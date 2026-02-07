use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Timestamp};
use cw_storage_plus::{Item, Map};

pub const CONFIG: Item<OracleConfig> = Item::new("config");
pub const BEACONS: Map<u64, StoredBeacon> = Map::new("beacons");
pub const LATEST_ROUND: Item<u64> = Item::new("latest_round");

#[cw_serde]
pub struct OracleConfig {
    pub admin: Addr,
    pub operators: Vec<Addr>,
    /// Quicknet public key, 96 bytes (G2 point)
    pub quicknet_pubkey: Vec<u8>,
    /// Chain hash identifying the drand network
    pub chain_hash: String,
    /// Genesis time of the drand network (unix seconds)
    pub genesis_time: u64,
    /// Period between rounds in seconds (3 for quicknet)
    pub period_seconds: u64,
}

#[cw_serde]
pub struct StoredBeacon {
    pub round: u64,
    /// sha256(signature), 32 bytes
    pub randomness: Vec<u8>,
    /// BLS signature on G1, 48 bytes
    pub signature: Vec<u8>,
    pub verified: bool,
    pub submitted_at: Timestamp,
    pub submitted_by: Addr,
}
