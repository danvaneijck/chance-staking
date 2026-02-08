import * as fs from "fs";
import * as path from "path";
import { queryContract, executeContract } from "../clients";
import { config } from "../config";
import { logger } from "../utils/logger";
import { generateSecret, computeOperatorCommit, computeWinningTicket } from "../utils/crypto";
import { generateProof, findWinnerIndex, SnapshotEntry } from "./merkle";
import { computeLeafHash } from "../utils/crypto";
import { getCachedSnapshot, getEpochState } from "./epoch";
import { fetchLatestDrandRound, submitSpecificRound, getStoredBeacon } from "./drand";

interface DrawStateInfo {
  next_draw_id: number;
  regular_pool_balance: string;
  big_pool_balance: string;
  total_draws_completed: number;
  total_rewards_distributed: string;
}

interface DistributorConfig {
  admin: string;
  operator: string;
  staking_hub: string;
  drand_oracle: string;
  reveal_deadline_seconds: number;
  regular_draw_reward: string;
  big_draw_reward: string;
}

interface Draw {
  id: number;
  draw_type: string;
  epoch: number;
  status: string;
  operator_commit: string;
  target_drand_round: number;
  drand_randomness: number[] | null;
  operator_secret: number[] | null;
  final_randomness: number[] | null;
  winner: string | null;
  reward_amount: string;
  created_at: string;
  revealed_at: string | null;
  reveal_deadline: string;
  merkle_root: string | null;
  total_weight: string | null;
}

interface DrawHistoryResponse {
  draws: Draw[];
}

interface PoolBalancesResponse {
  regular_pool: string;
  big_pool: string;
}

// Track secrets for committed draws so we can reveal them later
// Persisted to disk so they survive node restarts
const SECRETS_FILE = path.join(process.cwd(), "data", "pending_secrets.json");

const pendingDrawSecrets = new Map<number, Buffer>();

function ensureDataDir(): void {
  const dir = path.dirname(SECRETS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveSecretsToDisk(): void {
  ensureDataDir();
  const data: Record<string, string> = {};
  for (const [drawId, secret] of pendingDrawSecrets) {
    data[drawId.toString()] = secret.toString("hex");
  }
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(data, null, 2));
  logger.debug(`Saved ${pendingDrawSecrets.size} pending secrets to disk`);
}

function loadSecretsFromDisk(): void {
  if (!fs.existsSync(SECRETS_FILE)) return;
  try {
    const raw = fs.readFileSync(SECRETS_FILE, "utf-8");
    const data = JSON.parse(raw) as Record<string, string>;
    for (const [drawIdStr, secretHex] of Object.entries(data)) {
      pendingDrawSecrets.set(parseInt(drawIdStr, 10), Buffer.from(secretHex, "hex"));
    }
    logger.info(`Loaded ${pendingDrawSecrets.size} pending secrets from disk`);
  } catch (err) {
    logger.error("Failed to load secrets from disk:", err);
  }
}

// Load secrets on module initialization
loadSecretsFromDisk();

export async function getDrawState(): Promise<DrawStateInfo> {
  return queryContract<DrawStateInfo>(config.contracts.rewardDistributor, { draw_state: {} });
}

export async function getDistributorConfig(): Promise<DistributorConfig> {
  return queryContract<DistributorConfig>(config.contracts.rewardDistributor, { config: {} });
}

export async function getPoolBalances(): Promise<PoolBalancesResponse> {
  return queryContract<PoolBalancesResponse>(config.contracts.rewardDistributor, {
    pool_balances: {},
  });
}

export async function getDraw(drawId: number): Promise<Draw> {
  return queryContract<Draw>(config.contracts.rewardDistributor, { draw: { draw_id: drawId } });
}

export async function getDrawHistory(startAfter?: number, limit = 10): Promise<Draw[]> {
  const response = await queryContract<DrawHistoryResponse>(config.contracts.rewardDistributor, {
    draw_history: { start_after: startAfter, limit },
  });
  return response.draws;
}

export async function commitDraw(
  drawType: "regular" | "big",
  epoch: number
): Promise<{ drawId: number; targetRound: number }> {
  const distributorConfig = await getDistributorConfig();
  const rewardAmount =
    drawType === "regular"
      ? distributorConfig.regular_draw_reward
      : distributorConfig.big_draw_reward;

  // Check pool has enough funds
  const pools = await getPoolBalances();
  const poolBalance =
    drawType === "regular" ? BigInt(pools.regular_pool) : BigInt(pools.big_pool);
  if (poolBalance < BigInt(rewardAmount)) {
    logger.warn(
      `${drawType} pool has insufficient funds: ${poolBalance} < ${rewardAmount}`
    );
    throw new Error(`Insufficient ${drawType} pool funds`);
  }

  // Generate operator secret and commitment
  const secret = generateSecret();
  const commit = computeOperatorCommit(secret);

  // Target a drand round ~30 seconds in the future
  const latestDrand = await fetchLatestDrandRound();
  const targetRound = latestDrand.round + 10; // ~30s at 3s period

  const drawState = await getDrawState();
  const nextDrawId = drawState.next_draw_id;

  logger.info(
    `Committing ${drawType} draw (id=${nextDrawId}) for epoch ${epoch}, target drand round ${targetRound}`
  );

  await executeContract(config.contracts.rewardDistributor, {
    commit_draw: {
      draw_type: drawType,
      operator_commit: commit,
      target_drand_round: targetRound,
      reward_amount: rewardAmount,
      epoch,
    },
  });

  // Store the secret for later reveal (persisted to disk)
  pendingDrawSecrets.set(nextDrawId, secret);
  saveSecretsToDisk();
  logger.info(`Draw ${nextDrawId} committed, secret stored for reveal`);

  return { drawId: nextDrawId, targetRound };
}

export async function revealDraw(drawId: number): Promise<string> {
  const draw = await getDraw(drawId);

  if (draw.status !== "committed") {
    throw new Error(`Draw ${drawId} is not in committed state (status: ${draw.status})`);
  }

  const secret = pendingDrawSecrets.get(drawId);
  if (!secret) {
    throw new Error(
      `No secret stored for draw ${drawId}. The operator node may have restarted since commit.`
    );
  }

  // Ensure the drand beacon is available on-chain
  const storedBeacon = await getStoredBeacon(draw.target_drand_round);
  if (!storedBeacon) {
    // Try to fetch and submit it
    logger.info(`Submitting drand beacon for round ${draw.target_drand_round}`);
    await submitSpecificRound(draw.target_drand_round);
  }

  // Fetch the beacon to get randomness
  const beacon = await getStoredBeacon(draw.target_drand_round);
  if (!beacon) {
    throw new Error(`Could not get drand beacon for round ${draw.target_drand_round}`);
  }

  const drandRandomness = Buffer.from(beacon.randomness);

  // Get the snapshot for this epoch
  const snapshot = getCachedSnapshot();
  if (!snapshot) {
    throw new Error(
      `No cached snapshot available for draw reveal. The operator node may have restarted.`
    );
  }

  const totalWeight = BigInt(snapshot.totalWeight);
  const winningTicket = computeWinningTicket(drandRandomness, secret, totalWeight);

  logger.info(`Draw ${drawId}: winning ticket = ${winningTicket} / ${totalWeight}`);

  const winnerIndex = findWinnerIndex(snapshot.entries, winningTicket);
  const winner = snapshot.entries[winnerIndex];

  logger.info(`Draw ${drawId}: winner = ${winner.address} (index ${winnerIndex})`);

  // Generate merkle proof
  const leaves = snapshot.entries.map((e: SnapshotEntry) =>
    computeLeafHash(e.address, BigInt(e.cumulative_start), BigInt(e.cumulative_end))
  );

  const proof = generateProof(leaves, winnerIndex);

  const txHash = await executeContract(config.contracts.rewardDistributor, {
    reveal_draw: {
      draw_id: drawId,
      operator_secret_hex: secret.toString("hex"),
      winner_address: winner.address,
      winner_cumulative_start: winner.cumulative_start,
      winner_cumulative_end: winner.cumulative_end,
      merkle_proof: proof,
    },
  });

  pendingDrawSecrets.delete(drawId);
  saveSecretsToDisk();
  logger.info(`Draw ${drawId} revealed! Winner: ${winner.address}, tx: ${txHash}`);

  return txHash;
}

export async function expireDraw(drawId: number): Promise<string> {
  logger.info(`Expiring draw ${drawId} (past reveal deadline)`);
  const txHash = await executeContract(config.contracts.rewardDistributor, {
    expire_draw: { draw_id: drawId },
  });
  // Clean up any stale secret for this draw
  if (pendingDrawSecrets.has(drawId)) {
    pendingDrawSecrets.delete(drawId);
    saveSecretsToDisk();
  }
  logger.info(`Draw ${drawId} expired, funds returned to pool. tx: ${txHash}`);
  return txHash;
}

export async function checkAndRevealDraws(): Promise<void> {
  // Check recent draws for any that are committed and ready to reveal
  const draws = await getDrawHistory(undefined, 20);
  const nowNanos = BigInt(Date.now()) * BigInt(1_000_000);

  for (const draw of draws) {
    if (draw.status !== "committed") continue;

    const deadlineNanos = BigInt(draw.reveal_deadline);

    // If past deadline, expire it regardless of whether we have the secret
    if (nowNanos > deadlineNanos) {
      try {
        await expireDraw(draw.id);
      } catch (err) {
        logger.error(`Error expiring draw ${draw.id}:`, err);
      }
      continue;
    }

    if (!pendingDrawSecrets.has(draw.id)) {
      logger.warn(
        `Draw ${draw.id} is committed but we don't have the secret. ` +
          `It may have been committed by a different operator instance.`
      );
      continue;
    }

    // Check if the drand network has produced the target round yet.
    // We query the drand HTTP API (free) instead of the on-chain oracle.
    // revealDraw handles submitting the specific beacon on-chain.
    try {
      const latestDrand = await fetchLatestDrandRound();
      if (latestDrand.round >= draw.target_drand_round) {
        logger.info(`Drand at round ${latestDrand.round} (target: ${draw.target_drand_round}), revealing draw ${draw.id}`);
        await revealDraw(draw.id);
      } else {
        logger.debug(
          `Waiting for drand round ${draw.target_drand_round} for draw ${draw.id} (drand latest: ${latestDrand.round})`
        );
      }
    } catch (err) {
      logger.error(`Error checking/revealing draw ${draw.id}:`, err);
    }
  }
}

export async function checkAndCommitDraws(): Promise<void> {
  const epochState = await getEpochState();

  if (!epochState.snapshot_finalized) {
    logger.debug("Snapshot not finalized, skipping draw commit");
    return;
  }

  const pools = await getPoolBalances();
  const distributorConfig = await getDistributorConfig();

  // Check if we should commit a regular draw
  const regularPool = BigInt(pools.regular_pool);
  const regularReward = BigInt(distributorConfig.regular_draw_reward);
  if (regularPool >= regularReward) {
    // Check if there's already a pending regular draw for this epoch
    const draws = await getDrawHistory(undefined, 10);
    const hasActiveRegular = draws.some(
      (d) =>
        d.draw_type === "regular" &&
        d.epoch === epochState.current_epoch &&
        d.status === "committed"
    );

    if (!hasActiveRegular) {
      try {
        await commitDraw("regular", epochState.current_epoch);
      } catch (err) {
        logger.error("Failed to commit regular draw:", err);
      }
    }
  }

  // Check if we should commit a big draw
  const bigPool = BigInt(pools.big_pool);
  const bigReward = BigInt(distributorConfig.big_draw_reward);
  if (bigPool >= bigReward) {
    const draws = await getDrawHistory(undefined, 10);
    const hasActiveBig = draws.some(
      (d) =>
        d.draw_type === "big" &&
        d.epoch === epochState.current_epoch &&
        d.status === "committed"
    );

    if (!hasActiveBig) {
      try {
        await commitDraw("big", epochState.current_epoch);
      } catch (err) {
        logger.error("Failed to commit big draw:", err);
      }
    }
  }
}
