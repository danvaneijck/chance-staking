import { bankClient, queryContract } from "../clients";
import { config } from "../config";
import { logger } from "../utils/logger";
import { SnapshotEntry } from "./merkle";

interface StakingHubConfig {
  admin: string;
  operator: string;
  reward_distributor: string;
  drand_oracle: string;
  csinj_denom: string;
  validators: string[];
  epoch_duration_seconds: number;
  protocol_fee_bps: number;
  treasury: string;
  base_yield_bps: number;
  regular_pool_bps: number;
  big_pool_bps: number;
}

interface DenomHolder {
  address: string;
  balance: string;
}

export async function getStakingHubConfig(): Promise<StakingHubConfig> {
  return queryContract<StakingHubConfig>(config.contracts.stakingHub, { config: {} });
}

export async function getCsInjDenom(): Promise<string> {
  const hubConfig = await getStakingHubConfig();
  return hubConfig.csinj_denom;
}

export async function fetchAllCsInjHolders(): Promise<DenomHolder[]> {
  const denom = await getCsInjDenom();
  logger.info(`Fetching all holders of ${denom}`);

  const holders: DenomHolder[] = [];
  let pagination: { key?: string } = {};

  // Paginate through all holders using bank module denom owners
  // The Injective SDK may not have a direct denomOwners query,
  // so we use supply + known holder tracking approach.
  // For testnet, we can use the REST API as a fallback.
  try {
    const response = await fetchDenomHoldersFromRest(denom);
    return response;
  } catch (err) {
    logger.warn("Failed to fetch holders from REST, trying gRPC approach");
    throw err;
  }
}

async function fetchDenomHoldersFromRest(denom: string): Promise<DenomHolder[]> {
  // Use Injective LCD/REST endpoint to get token factory denom holders
  const baseUrl = config.network === "mainnet"
    ? "https://sentry.lcd.injective.network"
    : "https://testnet.sentry.lcd.injective.network";

  const holders: DenomHolder[] = [];
  let nextKey: string | null = null;

  do {
    const params = new URLSearchParams({
      "pagination.limit": "100",
    });
    if (nextKey) {
      params.set("pagination.key", nextKey);
    }

    const url = `${baseUrl}/cosmos/bank/v1beta1/denom_owners/${encodeURIComponent(denom)}?${params}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch denom owners: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      denom_owners: Array<{ address: string; balance: { denom: string; amount: string } }>;
      pagination: { next_key: string | null };
    };

    for (const owner of data.denom_owners) {
      if (BigInt(owner.balance.amount) > BigInt(0)) {
        holders.push({
          address: owner.address,
          balance: owner.balance.amount,
        });
      }
    }

    nextKey = data.pagination.next_key;
  } while (nextKey);

  logger.info(`Found ${holders.length} csINJ holders`);
  return holders;
}

export function buildSnapshotEntries(holders: DenomHolder[]): SnapshotEntry[] {
  // Sort holders by address for deterministic ordering
  const sorted = [...holders].sort((a, b) => a.address.localeCompare(b.address));

  let cumulativeWeight = BigInt(0);
  const entries: SnapshotEntry[] = [];

  for (const holder of sorted) {
    const balance = BigInt(holder.balance);
    if (balance === BigInt(0)) continue;

    const start = cumulativeWeight;
    cumulativeWeight += balance;

    entries.push({
      address: holder.address,
      balance: holder.balance,
      cumulative_start: start.toString(),
      cumulative_end: cumulativeWeight.toString(),
    });
  }

  return entries;
}
