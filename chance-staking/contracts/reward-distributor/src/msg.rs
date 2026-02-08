use chance_staking_common::types::DrawType;
use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Uint128;

use crate::state::{DistributorConfig, Draw, DrawStateInfo, Snapshot};

#[cw_serde]
pub struct InstantiateMsg {
    pub operator: String,
    pub staking_hub: String,
    pub drand_oracle: String,
    pub reveal_deadline_seconds: u64,
    pub regular_draw_reward: Uint128,
    pub big_draw_reward: Uint128,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// Fund the regular draw pool. Called by staking hub with INJ.
    FundRegularPool {},
    /// Fund the big draw pool. Called by staking hub with INJ.
    FundBigPool {},
    /// Set snapshot from staking hub.
    SetSnapshot {
        epoch: u64,
        merkle_root: String,
        total_weight: Uint128,
        num_holders: u32,
    },
    /// Commit to a draw. Operator only.
    CommitDraw {
        draw_type: DrawType,
        /// sha256(secret), hex-encoded
        operator_commit: String,
        target_drand_round: u64,
        reward_amount: Uint128,
        epoch: u64,
    },
    /// Reveal a committed draw with the winner. Operator only.
    RevealDraw {
        draw_id: u64,
        /// The pre-image secret (hex-encoded)
        operator_secret_hex: String,
        /// Winner's bech32 address
        winner_address: String,
        /// Winner's cumulative_start in the snapshot
        winner_cumulative_start: Uint128,
        /// Winner's cumulative_end in the snapshot
        winner_cumulative_end: Uint128,
        /// Merkle proof (list of hex-encoded sibling hashes)
        merkle_proof: Vec<String>,
    },
    /// Expire a draw that wasn't revealed in time. Anyone can call.
    ExpireDraw { draw_id: u64 },
    /// Update configuration. Admin only.
    UpdateConfig {
        operator: Option<String>,
        staking_hub: Option<String>,
        reveal_deadline_seconds: Option<u64>,
        regular_draw_reward: Option<Uint128>,
        big_draw_reward: Option<Uint128>,
    },
}

/// Query message for the drand oracle contract.
#[cw_serde]
pub enum OracleQueryMsg {
    Beacon { round: u64 },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(DistributorConfig)]
    Config {},
    #[returns(DrawStateInfo)]
    DrawState {},
    #[returns(Draw)]
    Draw { draw_id: u64 },
    #[returns(DrawHistoryResponse)]
    DrawHistory {
        start_after: Option<u64>,
        limit: Option<u32>,
    },
    #[returns(PoolBalancesResponse)]
    PoolBalances {},
    #[returns(UserWinsResponse)]
    UserWins {
        address: String,
        start_after: Option<u64>,
        limit: Option<u32>,
    },
    #[returns(Vec<Draw>)]
    UserWinDetails {
        address: String,
        start_after: Option<u64>,
        limit: Option<u32>,
    },
    #[returns(bool)]
    VerifyInclusion {
        merkle_root: String,
        proof: Vec<String>,
        leaf_address: String,
        cumulative_start: Uint128,
        cumulative_end: Uint128,
    },
    #[returns(Option<Snapshot>)]
    Snapshot { epoch: u64 },
}

#[cw_serde]
pub struct DrawHistoryResponse {
    pub draws: Vec<Draw>,
}

#[cw_serde]
pub struct PoolBalancesResponse {
    pub regular_pool: Uint128,
    pub big_pool: Uint128,
}

#[cw_serde]
pub struct UserWinsResponse {
    pub address: String,
    pub total_wins: u32,
    pub total_won_amount: Uint128,
    pub draw_ids: Vec<u64>,
}
