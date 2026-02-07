use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("unauthorized: {reason}")]
    Unauthorized { reason: String },

    #[error("no INJ sent with stake")]
    NoFundsSent,

    #[error("must send exactly one coin (INJ)")]
    InvalidFunds,

    #[error("must send INJ denom, got {denom}")]
    WrongDenom { denom: String },

    #[error("must send csINJ to unstake, got {denom}")]
    WrongUnstakeDenom { denom: String },

    #[error("no csINJ sent with unstake")]
    NoUnstakeFunds,

    #[error("unstake request {id} not found for {address}")]
    UnstakeRequestNotFound { address: String, id: u64 },

    #[error("unstake request {id} not yet unlocked (unlocks at {unlock_time})")]
    UnstakeNotUnlocked { id: u64, unlock_time: u64 },

    #[error("unstake request {id} already claimed")]
    UnstakeAlreadyClaimed { id: u64 },

    #[error("no validators configured")]
    NoValidators,

    #[error("epoch not ready to advance (current epoch started too recently)")]
    EpochNotReady,

    #[error("snapshot already taken for this epoch")]
    SnapshotAlreadyTaken,

    #[error("invalid basis points: {field} = {value} (must be <= 10000)")]
    InvalidBps { field: String, value: u16 },

    #[error("basis points don't sum to 10000: regular({regular}) + big({big}) + base_yield({base_yield}) + fee({fee}) = {total}")]
    BpsSumMismatch {
        regular: u16,
        big: u16,
        base_yield: u16,
        fee: u16,
        total: u16,
    },

    #[error("insufficient contract balance for claim")]
    InsufficientBalance,
}
