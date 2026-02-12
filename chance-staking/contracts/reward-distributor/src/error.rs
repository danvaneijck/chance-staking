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

    #[error("drand beacon not found for round {round}")]
    BeaconNotFound { round: u64 },

    #[error("invalid hex: {field}")]
    InvalidHex { field: String },

    #[error("must send INJ to fund pool")]
    NoFundsSent,

    #[error("{draw_type} draw too soon: epoch {epoch}, last draw epoch {last_epoch}, need {min_gap} epochs between draws")]
    DrawTooSoon {
        draw_type: String,
        epoch: u64,
        last_epoch: u64,
        min_gap: u64,
    },

    #[error("{pool} pool is empty")]
    EmptyPool { pool: String },

    // H-02 FIX: Invalid epoch error
    #[error("invalid epoch: provided {provided}, latest snapshot is {latest}")]
    InvalidEpoch { provided: u64, latest: u64 },

    // H-03 FIX: Zero weight error
    #[error("cannot commit draw with zero total weight")]
    ZeroWeight,

    // M-01 FIX: Snapshot already exists error
    #[error("snapshot for epoch {epoch} already exists")]
    SnapshotAlreadyExists { epoch: u64 },

    // L-05 FIX: Insufficient contract balance error
    #[error("insufficient contract balance: required {required}, available {available}")]
    InsufficientContractBalance {
        required: cosmwasm_std::Uint128,
        available: cosmwasm_std::Uint128,
    },

    #[error("winner {address} not eligible for {draw_type} draw: staked {epochs_staked} epochs, need {min_epochs}")]
    WinnerNotEligible {
        address: String,
        draw_type: String,
        epochs_staked: u64,
        min_epochs: u64,
    },

    // V2-M-03 FIX: Invalid reveal deadline bounds
    #[error("reveal_deadline_seconds must be between {min} and {max}, got {value}")]
    InvalidRevealDeadline { value: u64, min: u64, max: u64 },
}
