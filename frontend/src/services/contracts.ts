import {
    ChainGrpcWasmApi,
    ChainGrpcBankApi,
    ChainGrpcStakingApi,
    ChainGrpcMintApi,
    MsgExecuteContractCompat,
} from "@injectivelabs/sdk-ts";
import { CONTRACTS, ENDPOINTS, INJ_DENOM, getCsinjDenom } from "../config";

// ---------- API instances ----------
const wasmApi = new ChainGrpcWasmApi(ENDPOINTS.grpc);
const bankApi = new ChainGrpcBankApi(ENDPOINTS.grpc);
const stakingApi = new ChainGrpcStakingApi(ENDPOINTS.grpc);
const mintApi = new ChainGrpcMintApi(ENDPOINTS.grpc);

// ---------- Types ----------
export interface ExchangeRateResponse {
    rate: string;
    total_inj_backing: string;
    total_csinj_supply: string;
}

export interface EpochState {
    current_epoch: number;
    epoch_start_time: string;
    total_staked: string;
    snapshot_merkle_root: string | null;
    snapshot_finalized: boolean;
    snapshot_total_weight: string;
    snapshot_num_holders: number;
    snapshot_uri: string | null;
}

export interface UnstakeRequest {
    inj_amount: string;
    csinj_burned: string;
    unlock_time: string;
    claimed: boolean;
}

export interface UnstakeRequestEntry {
    id: number;
    request: UnstakeRequest;
}

export interface DrawStateInfo {
    next_draw_id: number;
    regular_pool_balance: string;
    big_pool_balance: string;
    total_draws_completed: number;
    total_rewards_distributed: string;
    last_regular_draw_epoch: number | null;
    last_big_draw_epoch: number | null;
}

export interface Draw {
    id: number;
    draw_type: "regular" | "big";
    epoch: number;
    status: "committed" | "revealed" | "expired";
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

export interface StakingHubConfig {
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

export interface StakerInfoResponse {
    address: string;
    stake_epoch: number | null;
}

export interface UserWinsResponse {
    address: string;
    total_wins: number;
    total_won_amount: string;
    draw_ids: number[];
}

export interface PoolBalancesResponse {
    regular_pool: string;
    big_pool: string;
}

// ---------- Generic query helper ----------
async function queryContract<T>(
    contractAddress: string,
    queryMsg: Record<string, any>,
): Promise<T> {
    const response = await wasmApi.fetchSmartContractState(
        contractAddress,
        queryMsg,
    );
    const decoded = JSON.parse(Buffer.from(response.data).toString("utf-8"));
    return decoded as T;
}

// ---------- Balance queries ----------
export async function fetchInjBalance(address: string): Promise<string> {
    const balance = await bankApi.fetchBalance({
        accountAddress: address,
        denom: INJ_DENOM,
    });
    return balance.amount;
}

export async function fetchCsinjBalance(address: string): Promise<string> {
    const denom = getCsinjDenom();
    if (!denom) return "0";
    const balance = await bankApi.fetchBalance({
        accountAddress: address,
        denom,
    });
    return balance.amount;
}

// ---------- Staking Hub Queries ----------
export async function fetchExchangeRate(): Promise<ExchangeRateResponse> {
    return queryContract<ExchangeRateResponse>(CONTRACTS.stakingHub, {
        exchange_rate: {},
    });
}

export async function fetchEpochState(): Promise<EpochState> {
    return queryContract<EpochState>(CONTRACTS.stakingHub, {
        epoch_state: {},
    });
}

export async function fetchUnstakeRequests(
    address: string,
    startAfter?: number,
    limit?: number,
): Promise<UnstakeRequestEntry[]> {
    return queryContract<UnstakeRequestEntry[]>(CONTRACTS.stakingHub, {
        unstake_requests: {
            address,
            start_after: startAfter ?? null,
            limit: limit ?? null,
        },
    });
}

export async function fetchStakerInfo(
    address: string,
): Promise<StakerInfoResponse> {
    return queryContract<StakerInfoResponse>(CONTRACTS.stakingHub, {
        staker_info: { address },
    });
}

// ---------- Reward Distributor Queries ----------
export async function fetchDrawState(): Promise<DrawStateInfo> {
    return queryContract<DrawStateInfo>(CONTRACTS.rewardDistributor, {
        draw_state: {},
    });
}

export async function fetchPoolBalances(): Promise<PoolBalancesResponse> {
    return queryContract<PoolBalancesResponse>(CONTRACTS.rewardDistributor, {
        pool_balances: {},
    });
}

export async function fetchDrawHistory(
    startAfter?: number,
    limit?: number,
): Promise<{ draws: Draw[] }> {
    return queryContract<{ draws: Draw[] }>(CONTRACTS.rewardDistributor, {
        draw_history: {
            start_after: startAfter ?? null,
            limit: limit ?? 20,
        },
    });
}

export async function fetchUserWins(
    address: string,
    startAfter?: number,
    limit?: number,
): Promise<UserWinsResponse> {
    return queryContract<UserWinsResponse>(CONTRACTS.rewardDistributor, {
        user_wins: {
            address,
            start_after: startAfter ?? null,
            limit: limit ?? null,
        },
    });
}

export async function fetchUserWinDetails(
    address: string,
    startAfter?: number,
    limit?: number,
): Promise<Draw[]> {
    return queryContract<Draw[]>(CONTRACTS.rewardDistributor, {
        user_win_details: {
            address,
            start_after: startAfter ?? null,
            limit: limit ?? 20,
        },
    });
}

// ---------- Single draw query ----------
export async function fetchDraw(drawId: number): Promise<Draw> {
    return queryContract<Draw>(CONTRACTS.rewardDistributor, {
        draw: { draw_id: drawId },
    });
}

// ---------- Staking Hub Config ----------
export async function fetchStakingHubConfig(): Promise<StakingHubConfig> {
    return queryContract<StakingHubConfig>(CONTRACTS.stakingHub, {
        config: {},
    });
}

// ---------- On-chain staking APR ----------
export async function fetchStakingApr(
    validators: string[],
): Promise<number | null> {
    try {
        const [provisions, pool, ...validatorResults] = await Promise.all([
            mintApi.fetchAnnualProvisions(),
            stakingApi.fetchPool(),
            ...validators.map((addr) =>
                Promise.all([
                    stakingApi.fetchValidator(addr).catch(() => null),
                    stakingApi
                        .fetchDelegation({
                            injectiveAddress: CONTRACTS.stakingHub,
                            validatorAddress: addr,
                        })
                        .catch(() => null),
                ]),
            ),
        ]);

        // annualProvisions is a Cosmos SDK Dec (18 implicit decimal places),
        // bondedTokens is a plain integer — divide out the 1e18 factor.
        const annualProvisions = parseFloat(provisions.annualProvisions) / 1e18;
        const bondedTokens = parseFloat(pool.bondedTokens);
        if (!bondedTokens || !annualProvisions) return null;

        const nominalApr = annualProvisions / bondedTokens;

        // Weight each validator's commission by its actual delegation amount
        let totalDelegated = 0;
        let weightedCommission = 0;
        for (const [validator, delegation] of validatorResults) {
            if (!validator) continue;
            const commission = parseFloat(
                validator.commission.commissionRates.rate,
            );
            const delegated = delegation
                ? parseFloat(delegation.balance.amount)
                : 0;
            totalDelegated += delegated;
            weightedCommission += commission * delegated;
        }

        if (totalDelegated === 0) return nominalApr * 100;

        const effectiveCommission = weightedCommission / totalDelegated;
        return nominalApr * (1 - effectiveCommission) * 100;
    } catch {
        return null;
    }
}

// ---------- Execute message builders ----------
export function buildStakeMsg(sender: string, amount: string) {
    return MsgExecuteContractCompat.fromJSON({
        sender,
        contractAddress: CONTRACTS.stakingHub,
        msg: { stake: {} },
        funds: { denom: INJ_DENOM, amount },
    });
}

export function buildUnstakeMsg(sender: string, amount: string) {
    return MsgExecuteContractCompat.fromJSON({
        sender,
        contractAddress: CONTRACTS.stakingHub,
        msg: { unstake: {} },
        funds: { denom: getCsinjDenom(), amount },
    });
}

export function buildClaimUnstakedMsg(sender: string, requestIds: number[]) {
    return MsgExecuteContractCompat.fromJSON({
        sender,
        contractAddress: CONTRACTS.stakingHub,
        msg: { claim_unstaked: { request_ids: requestIds } },
    });
}
