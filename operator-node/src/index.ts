import { config } from "./config";
import { logger } from "./utils/logger";
import { getOperatorAddress } from "./clients";
import { syncDrandBeacons } from "./services/drand";
import { checkAndAdvanceEpoch, getEpochState } from "./services/epoch";
import { checkAndCommitDraws, checkAndRevealDraws, getDrawState } from "./services/draw";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDrandLoop(): Promise<void> {
  while (true) {
    try {
      await syncDrandBeacons();
    } catch (err) {
      logger.error("Drand sync error:", err);
    }
    await sleep(config.intervals.drandPollSeconds * 1000);
  }
}

async function runEpochLoop(): Promise<void> {
  while (true) {
    try {
      await checkAndAdvanceEpoch();
    } catch (err) {
      logger.error("Epoch check error:", err);
    }
    await sleep(config.intervals.epochCheckSeconds * 1000);
  }
}

async function runDrawLoop(): Promise<void> {
  while (true) {
    try {
      // First try to reveal any committed draws
      await checkAndRevealDraws();

      // Then check if we should commit new draws
      await checkAndCommitDraws();
    } catch (err) {
      logger.error("Draw loop error:", err);
    }
    await sleep(config.intervals.drawCheckSeconds * 1000);
  }
}

async function logStatus(): Promise<void> {
  try {
    const epochState = await getEpochState();
    const drawState = await getDrawState();

    logger.info("=== Operator Status ===");
    logger.info(`  Epoch: ${epochState.current_epoch}`);
    logger.info(`  Total staked: ${epochState.total_staked}`);
    logger.info(`  Snapshot finalized: ${epochState.snapshot_finalized}`);
    logger.info(`  Draws completed: ${drawState.total_draws_completed}`);
    logger.info(`  Regular pool: ${drawState.regular_pool_balance}`);
    logger.info(`  Big pool: ${drawState.big_pool_balance}`);
    logger.info("=======================");
  } catch (err) {
    logger.error("Failed to fetch status:", err);
  }
}

async function main(): Promise<void> {
  logger.info("Starting Chance Staking operator node...");
  logger.info(`Operator: ${getOperatorAddress()}`);
  logger.info(`Contracts:`);
  logger.info(`  Drand Oracle:        ${config.contracts.drandOracle}`);
  logger.info(`  Staking Hub:         ${config.contracts.stakingHub}`);
  logger.info(`  Reward Distributor:  ${config.contracts.rewardDistributor}`);

  await logStatus();

  // Run all loops concurrently
  logger.info("Starting operator loops...");
  await Promise.all([runDrandLoop(), runEpochLoop(), runDrawLoop()]);
}

main().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
