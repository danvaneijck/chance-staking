use cosmwasm_schema::{cw_serde, QueryResponses};

use crate::state::{OracleConfig, StoredBeacon};

#[cw_serde]
pub struct InstantiateMsg {
    pub operators: Vec<String>,
    /// Hex-encoded quicknet public key (96 bytes = 192 hex chars)
    pub quicknet_pubkey_hex: String,
    pub chain_hash: String,
    pub genesis_time: u64,
    pub period_seconds: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// Submit a drand beacon for verification and storage.
    SubmitBeacon {
        round: u64,
        /// Hex-encoded BLS signature (48 bytes = 96 hex chars)
        signature_hex: String,
    },
    /// Update operator list (admin only).
    UpdateOperators {
        add: Vec<String>,
        remove: Vec<String>,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(OracleConfig)]
    Config {},

    #[returns(Option<StoredBeacon>)]
    Beacon { round: u64 },

    #[returns(u64)]
    LatestRound {},
}
