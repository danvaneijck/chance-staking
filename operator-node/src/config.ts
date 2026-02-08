import * as dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  mnemonic: requireEnv("MNEMONIC"),
  network: optionalEnv("NETWORK", "testnet") as "testnet" | "mainnet",

  contracts: {
    drandOracle: requireEnv("DRAND_ORACLE_ADDRESS"),
    stakingHub: requireEnv("STAKING_HUB_ADDRESS"),
    rewardDistributor: requireEnv("REWARD_DISTRIBUTOR_ADDRESS"),
  },

  intervals: {
    drandPollSeconds: parseInt(optionalEnv("DRAND_POLL_INTERVAL", "10"), 10),
    epochCheckSeconds: parseInt(optionalEnv("EPOCH_CHECK_INTERVAL", "60"), 10),
    drawCheckSeconds: parseInt(optionalEnv("DRAW_CHECK_INTERVAL", "30"), 10),
  },

  drand: {
    apiUrl: optionalEnv("DRAND_API_URL", "https://api.drand.sh"),
    chainHash: optionalEnv(
      "DRAND_CHAIN_HASH",
      "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
    ),
  },
};

export type Config = typeof config;
