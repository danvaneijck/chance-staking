use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("unauthorized: {reason}")]
    Unauthorized { reason: String },

    #[error("beacon for round {round} already exists")]
    BeaconAlreadyExists { round: u64 },

    #[error("BLS verification failed: {reason}")]
    VerificationFailed { reason: String },

    #[error("invalid hex input: {field}")]
    InvalidHex { field: String },

    #[error("beacon not found for round {round}")]
    BeaconNotFound { round: u64 },

    #[error("invalid pubkey length: expected 96 bytes, got {got}")]
    InvalidPubkeyLength { got: usize },
}
