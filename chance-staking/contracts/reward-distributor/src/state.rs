use chance_staking_common::types::{DrawStatus, DrawType};
use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Timestamp, Uint128};
use cw_storage_plus::{Item, Map};

pub const CONFIG: Item<DistributorConfig> = Item::new("config");
pub const DRAW_STATE: Item<DrawStateInfo> = Item::new("draw_state");
pub const DRAWS: Map<u64, Draw> = Map::new("draws");
pub const SNAPSHOTS: Map<u64, Snapshot> = Map::new("snapshots");

/// Per-user win tracking
pub const USER_WINS: Map<&Addr, Vec<u64>> = Map::new("user_wins");
pub const USER_TOTAL_WON: Map<&Addr, Uint128> = Map::new("user_total_won");

#[cw_serde]
pub struct DistributorConfig {
    pub admin: Addr,
    pub operator: Addr,
    pub staking_hub: Addr,
    pub drand_oracle: Addr,
    /// How long the operator has to reveal after committing (seconds)
    pub reveal_deadline_seconds: u64,
    /// Reward amount per regular draw (in uINJ)
    pub regular_draw_reward: Uint128,
    /// Reward amount per big draw (in uINJ)
    pub big_draw_reward: Uint128,
}

#[cw_serde]
pub struct DrawStateInfo {
    pub next_draw_id: u64,
    pub regular_pool_balance: Uint128,
    pub big_pool_balance: Uint128,
    pub total_draws_completed: u64,
    pub total_rewards_distributed: Uint128,
}

#[cw_serde]
pub struct Draw {
    pub id: u64,
    pub draw_type: DrawType,
    pub epoch: u64,
    pub status: DrawStatus,
    /// sha256(operator_secret), hex-encoded
    pub operator_commit: String,
    pub target_drand_round: u64,
    pub drand_randomness: Option<Vec<u8>>,
    pub operator_secret: Option<Vec<u8>>,
    pub final_randomness: Option<Vec<u8>>,
    pub winner: Option<Addr>,
    pub reward_amount: Uint128,
    pub created_at: Timestamp,
    pub revealed_at: Option<Timestamp>,
    pub reveal_deadline: Timestamp,
    /// Merkle root used for this draw (from snapshot)
    pub merkle_root: Option<String>,
    pub total_weight: Option<Uint128>,
}

#[cw_serde]
pub struct Snapshot {
    pub epoch: u64,
    pub merkle_root: String,
    pub total_weight: Uint128,
    pub num_holders: u32,
    pub submitted_at: Timestamp,
}

/// Response type for querying a beacon from the drand oracle.
/// Mirrors the StoredBeacon struct from the oracle contract.
#[cw_serde]
pub struct StoredBeaconResponse {
    pub round: u64,
    pub randomness: Vec<u8>,
    pub signature: Vec<u8>,
    pub verified: bool,
}
