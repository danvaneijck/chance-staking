use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("unauthorized: {reason}")]
    Unauthorized { reason: String },

    #[error("draw {draw_id} not found")]
    DrawNotFound { draw_id: u64 },

    #[error("draw {draw_id} is not in Committed status")]
    DrawNotCommitted { draw_id: u64 },

    #[error("draw {draw_id} has expired (deadline: {deadline})")]
    DrawExpired { draw_id: u64, deadline: u64 },

    #[error("draw {draw_id} has not expired yet (deadline: {deadline})")]
    DrawNotExpired { draw_id: u64, deadline: u64 },

    #[error("commit pre-image mismatch: sha256(secret) != commit")]
    CommitMismatch,

    #[error("invalid merkle proof for winner")]
    InvalidMerkleProof,

    #[error("winning ticket {ticket} not in range [{start}, {end})")]
    WinningTicketOutOfRange {
        ticket: u128,
        start: u128,
        end: u128,
    },

    #[error("no snapshot available for current epoch")]
    NoSnapshot,

    #[error("insufficient pool balance: need {needed}, have {available}")]
    InsufficientPool {
        needed: String,
        available: String,
    },

    #[error("drand beacon not found for round {round}")]
    BeaconNotFound { round: u64 },

    #[error("invalid hex: {field}")]
    InvalidHex { field: String },

    #[error("must send INJ to fund pool")]
    NoFundsSent,
}
