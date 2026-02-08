import { queryContract, executeContract, stakingClient } from "../clients";
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

export async function advanceEpoch(rewardAmount: string): Promise<string> {
  logger.info(`Advancing epoch with ${rewardAmount} inj rewards`);
  return executeContract(
    config.contracts.stakingHub,
    { advance_epoch: {} },
    rewardAmount !== "0" ? [{ denom: "inj", amount: rewardAmount }] : undefined
  );
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

  // Step 1: Claim staking rewards from validators
  // In a real setup, the operator would claim rewards externally and pass them in.
  // For now, we advance with whatever rewards are available.
  // The operator needs to claim delegation rewards separately via MsgWithdrawDelegatorReward
  // and then send them to this contract.

  // TODO: Implement staking reward claiming from validators
  // For now, advance with 0 rewards (the contract handles the case)
  await advanceEpoch("0");

  // Step 2: Take snapshot if not yet taken
  if (!epochState.snapshot_finalized) {
    await takeSnapshot();
  }

  return true;
}
