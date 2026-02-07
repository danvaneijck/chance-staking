use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Decimal, Uint128};

use crate::state::{Config, EpochState, UnstakeRequest};

#[cw_serde]
pub struct InstantiateMsg {
    pub operator: String,
    pub reward_distributor: String,
    pub drand_oracle: String,
    pub validators: Vec<String>,
    pub epoch_duration_seconds: u64,
    pub protocol_fee_bps: u16,
    pub treasury: String,
    pub base_yield_bps: u16,
    pub regular_pool_bps: u16,
    pub big_pool_bps: u16,
    /// Subdenom for Token Factory, e.g. "csINJ"
    pub csinj_subdenom: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// Stake INJ to receive csINJ. Send INJ in info.funds.
    Stake {},
    /// Unstake csINJ to begin unbonding. Send csINJ in info.funds.
    Unstake {},
    /// Claim unlocked unstake requests.
    ClaimUnstaked { request_ids: Vec<u64> },
    /// Advance to next epoch. Claims validator rewards and distributes.
    /// Operator only.
    AdvanceEpoch {},
    /// Submit a snapshot merkle root for the current epoch. Operator only.
    TakeSnapshot {
        merkle_root: String,
        total_weight: Uint128,
        num_holders: u32,
        snapshot_uri: String,
    },
    /// Update contract configuration. Admin only.
    UpdateConfig {
        admin: Option<String>,
        operator: Option<String>,
        protocol_fee_bps: Option<u16>,
    },
    /// Update validator set. Admin only.
    UpdateValidators {
        add: Vec<String>,
        remove: Vec<String>,
    },
}

/// Message sent to reward distributor to fund pools.
#[cw_serde]
pub enum DistributorExecuteMsg {
    FundRegularPool {},
    FundBigPool {},
    SetSnapshot {
        epoch: u64,
        merkle_root: String,
        total_weight: Uint128,
        num_holders: u32,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(Config)]
    Config {},
    #[returns(EpochState)]
    EpochState {},
    #[returns(ExchangeRateResponse)]
    ExchangeRate {},
    #[returns(Vec<UnstakeRequestEntry>)]
    UnstakeRequests { address: String },
}

#[cw_serde]
pub struct ExchangeRateResponse {
    pub rate: Decimal,
    pub total_inj_backing: Uint128,
    pub total_csinj_supply: Uint128,
}

#[cw_serde]
pub struct UnstakeRequestEntry {
    pub id: u64,
    pub request: UnstakeRequest,
}
