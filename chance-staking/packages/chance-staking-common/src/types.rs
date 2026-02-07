use cosmwasm_schema::cw_serde;
use cosmwasm_std::Uint128;

/// The type of draw: regular (weighted by csINJ balance) or big (equal weight monthly).
#[cw_serde]
pub enum DrawType {
    Regular,
    Big,
}

/// The lifecycle status of a draw.
#[cw_serde]
pub enum DrawStatus {
    Committed,
    Revealed,
    Expired,
}

/// A single entry in the off-chain snapshot used to build the Merkle tree.
/// Each entry represents a holder's cumulative weight range.
#[cw_serde]
pub struct SnapshotEntry {
    pub address: String,
    pub balance: Uint128,
    pub cumulative_start: Uint128,
    pub cumulative_end: Uint128,
}
