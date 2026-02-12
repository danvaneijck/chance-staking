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
    min_epochs_regular: number;
    min_epochs_big: number;
}

interface StakerInfoResponse {
    address: string;
    stake_epoch: number | null;
}

interface DenomHolder {
    address: string;
    balance: string;
}

export async function getStakingHubConfig(): Promise<StakingHubConfig> {
    return queryContract<StakingHubConfig>(config.contracts.stakingHub, {
        config: {},
    });
}

export async function getCsInjDenom(): Promise<string> {
    const hubConfig = await getStakingHubConfig();
    return hubConfig.csinj_denom;
}

export async function queryStakerInfo(address: string): Promise<StakerInfoResponse> {
    return queryContract<StakerInfoResponse>(config.contracts.stakingHub, {
        staker_info: { address },
    });
}

/**
 * Filter holders by draw eligibility based on min_epochs config.
 * Returns holders eligible for regular draws, and a flag indicating
 * whether all of those holders are also eligible for big draws.
 */
export async function filterEligibleHolders(
    holders: DenomHolder[],
    currentEpoch: number,
    minEpochsRegular: number,
    minEpochsBig: number,
): Promise<{ eligible: DenomHolder[]; allBigEligible: boolean }> {
    const eligible: DenomHolder[] = [];
    let allBigEligible = true;

    for (const holder of holders) {
        const info = await queryStakerInfo(holder.address);
        if (info.stake_epoch === null) {
            // No stake epoch recorded — skip (shouldn't happen for a holder)
            logger.warn(`Holder ${holder.address} has no stake_epoch, excluding from snapshot`);
            continue;
        }

        const epochsStaked = currentEpoch - info.stake_epoch;
        if (epochsStaked < minEpochsRegular) {
            logger.info(
                `Excluding ${holder.address} from snapshot: staked ${epochsStaked} epochs, need ${minEpochsRegular} for regular`
            );
            continue;
        }

        eligible.push(holder);

        if (epochsStaked < minEpochsBig) {
            allBigEligible = false;
        }
    }

    return { eligible, allBigEligible };
}

export async function fetchAllCsInjHolders(): Promise<DenomHolder[]> {
    const denom = await getCsInjDenom();
    logger.info(`Fetching all holders of ${denom}`);

    const holders: DenomHolder[] = [];
    let nextKey: string | null = "";

    do {
        const response = await bankClient.fetchDenomOwners(denom, {
            key: nextKey,
        });

        if (response && response.denomOwners) {
            for (const owner of response.denomOwners) {
                if (owner.balance && BigInt(owner.balance.amount) > BigInt(0)) {
                    holders.push({
                        address: owner.address,
                        balance: owner.balance.amount,
                    });
                }
            }
        } else {
            logger.warn("No denom owners found in response");
            break;
        }

        nextKey = response.pagination.next;
    } while (nextKey);

    logger.info(`Found ${holders.length} csINJ holders`);
    return holders;
}

export function buildSnapshotEntries(holders: DenomHolder[]): SnapshotEntry[] {
    // Sort holders by address for deterministic ordering
    const sorted = [...holders].sort((a, b) =>
        a.address.localeCompare(b.address),
    );

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
