use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Decimal, Timestamp, Uint128};
use cw_storage_plus::{Item, Map};

pub const CONFIG: Item<Config> = Item::new("config");
pub const EPOCH_STATE: Item<EpochState> = Item::new("epoch_state");
pub const EXCHANGE_RATE: Item<Decimal> = Item::new("xrate");
pub const TOTAL_INJ_BACKING: Item<Uint128> = Item::new("inj_backing");
pub const TOTAL_CSINJ_SUPPLY: Item<Uint128> = Item::new("csinj_supply");
pub const UNSTAKE_REQUESTS: Map<(&Addr, u64), UnstakeRequest> = Map::new("unstake_reqs");
pub const NEXT_UNSTAKE_ID: Map<&Addr, u64> = Map::new("next_unstake_id");
/// Running total of all unclaimed unstake request INJ amounts.
/// Updated on unstake (increment) and claim_unstaked (decrement) to avoid
/// iterating all requests on every distribute_rewards() call.
pub const PENDING_UNSTAKE_TOTAL: Item<Uint128> = Item::new("pending_unstake");
/// Tracks the epoch of the user's most recent stake. Resets on every stake
/// so newly added funds must also satisfy the min_epochs eligibility requirement.
pub const USER_STAKE_EPOCH: Map<&Addr, u64> = Map::new("user_stake_epoch");

#[cw_serde]
pub struct Config {
    pub admin: Addr,
    pub operator: Addr,
    pub reward_distributor: Addr,
    pub drand_oracle: Addr,
    /// Token Factory denom: "factory/{this_contract}/csINJ"
    pub csinj_denom: String,
    pub validators: Vec<String>,
    pub epoch_duration_seconds: u64,
    /// Protocol treasury fee in basis points (500 = 5%)
    pub protocol_fee_bps: u16,
    pub treasury: Addr,
    /// Base yield in basis points (500 = 5%)
    pub base_yield_bps: u16,
    /// Regular draw pool in basis points (7000 = 70%)
    pub regular_pool_bps: u16,
    /// Big draw pool in basis points (2000 = 20%)
    pub big_pool_bps: u16,
    /// Minimum epochs a user must have been staking to be eligible for regular draws
    pub min_epochs_regular: u64,
    /// Minimum epochs a user must have been staking to be eligible for big draws
    pub min_epochs_big: u64,
}

#[cw_serde]
pub struct EpochState {
    pub current_epoch: u64,
    pub epoch_start_time: Timestamp,
    pub total_staked: Uint128,
    pub snapshot_merkle_root: Option<String>,
    pub snapshot_finalized: bool,
    pub snapshot_total_weight: Uint128,
    pub snapshot_num_holders: u32,
    pub snapshot_uri: Option<String>,
}

#[cw_serde]
pub struct UnstakeRequest {
    pub inj_amount: Uint128,
    pub csinj_burned: Uint128,
    pub unlock_time: Timestamp,
    pub claimed: bool,
}
