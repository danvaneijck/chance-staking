import { queryContract, executeContract } from "../clients";
import { config } from "../config";
import { logger } from "../utils/logger";
import { getStakingHubConfig, fetchAllCsInjHolders, buildSnapshotEntries } from "./snapshot";
import { buildMerkleTree } from "./merkle";

interface EpochState {
  current_epoch: number;
  epoch_start_time: string;
  total_staked: string;
  snapshot_merkle_root: string | null;
  snapshot_finalized: boolean;
  snapshot_total_weight: string;
  snapshot_num_holders: number;
  snapshot_uri: string | null;
}

export async function getEpochState(): Promise<EpochState> {
  return queryContract<EpochState>(config.contracts.stakingHub, { epoch_state: {} });
}

export async function claimRewards(): Promise<string> {
  logger.info("Claiming staking rewards from validators...");
  return executeContract(config.contracts.stakingHub, { claim_rewards: {} });
}

export async function distributeRewards(): Promise<string> {
  logger.info("Distributing rewards and advancing epoch...");
  return executeContract(config.contracts.stakingHub, { distribute_rewards: {} });
}

export async function takeSnapshot(): Promise<string> {
  logger.info("Building snapshot of csINJ holders...");

  const holders = await fetchAllCsInjHolders();
  if (holders.length === 0) {
    throw new Error("No csINJ holders found, cannot take snapshot");
  }

  const entries = buildSnapshotEntries(holders);
  const { root } = buildMerkleTree(entries);
  const totalWeight = entries[entries.length - 1].cumulative_end;

  logger.info(
    `Snapshot built: ${entries.length} holders, total weight: ${totalWeight}, root: ${root}`
  );

  // Store snapshot data for later use in draw reveals
  snapshotCache = { entries, root, totalWeight };

  const txHash = await executeContract(config.contracts.stakingHub, {
    take_snapshot: {
      merkle_root: root,
      total_weight: totalWeight,
      num_holders: entries.length,
      snapshot_uri: "", // Could upload to IPFS in production
    },
  });

  logger.info(`Snapshot submitted in tx: ${txHash}`);
  return txHash;
}

// In-memory cache of the latest snapshot for draw reveals
interface SnapshotCache {
  entries: ReturnType<typeof buildSnapshotEntries>;
  root: string;
  totalWeight: string;
}

let snapshotCache: SnapshotCache | null = null;

export function getCachedSnapshot(): SnapshotCache | null {
  return snapshotCache;
}

export async function checkAndAdvanceEpoch(): Promise<boolean> {
  const epochState = await getEpochState();
  const hubConfig = await getStakingHubConfig();

  const epochStartNanos = parseInt(epochState.epoch_start_time, 10);
  const epochStartSeconds = epochStartNanos / 1_000_000_000;
  const nowSeconds = Date.now() / 1000;
  const elapsed = nowSeconds - epochStartSeconds;

  if (elapsed < hubConfig.epoch_duration_seconds) {
    logger.debug(
      `Epoch ${epochState.current_epoch} has ${hubConfig.epoch_duration_seconds - elapsed}s remaining`
    );
    return false;
  }

  logger.info(`Epoch ${epochState.current_epoch} is ready to advance`);

  // Step 1: Claim staking rewards from all validators
  // This sends WithdrawDelegatorReward msgs to claim rewards into the contract
  await claimRewards();

  // Step 2: Distribute the claimed rewards and advance epoch
  // Wait a moment for the claim tx to be processed
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await distributeRewards();

  // Step 3: Take snapshot if not yet taken
  const updatedEpoch = await getEpochState();
  if (!updatedEpoch.snapshot_finalized) {
    await takeSnapshot();
  }

  return true;
}
