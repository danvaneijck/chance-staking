use cosmwasm_std::{DepsMut, Env, Event, MessageInfo, Response};

use crate::error::ContractError;
use crate::state::{BEACONS, CONFIG, LATEST_ROUND, StoredBeacon};
use crate::verify::verify_quicknet_beacon;

/// Submit a drand beacon. Only operators can call this.
/// The beacon is BLS-verified using the drand-verify crate (pure Rust).
pub fn submit_beacon(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    round: u64,
    signature_hex: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Authorization: only operators
    if !config.operators.contains(&info.sender) {
        return Err(ContractError::Unauthorized {
            reason: "only operators can submit beacons".to_string(),
        });
    }

    // Check for duplicate
    if BEACONS.has(deps.storage, round) {
        return Err(ContractError::BeaconAlreadyExists { round });
    }

    // Decode signature
    let signature = hex::decode(&signature_hex).map_err(|_| ContractError::InvalidHex {
        field: "signature_hex".to_string(),
    })?;

    // BLS verification via drand-verify (pure Rust, no native crypto API)
    let randomness = verify_quicknet_beacon(&config.quicknet_pubkey, round, &signature)
        .map_err(|e| ContractError::VerificationFailed {
            reason: e.to_string(),
        })?;

    // Store beacon
    let beacon = StoredBeacon {
        round,
        randomness: randomness.to_vec(),
        signature: signature.clone(),
        verified: true,
        submitted_at: env.block.time,
        submitted_by: info.sender.clone(),
    };
    BEACONS.save(deps.storage, round, &beacon)?;

    // Update latest round if this is newer
    let current_latest = LATEST_ROUND.may_load(deps.storage)?.unwrap_or(0);
    if round > current_latest {
        LATEST_ROUND.save(deps.storage, &round)?;
    }

    Ok(Response::new()
        .add_attribute("action", "submit_beacon")
        .add_attribute("round", round.to_string())
        .add_attribute("submitted_by", info.sender.to_string())
        .add_event(
            Event::new("chance_beacon_submitted")
                .add_attribute("round", round.to_string())
                .add_attribute("randomness", hex::encode(randomness))
                .add_attribute("submitted_by", info.sender.to_string())
                .add_attribute("timestamp", env.block.time.seconds().to_string()),
        ))
}

/// Update the operator list. Admin only.
pub fn update_operators(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    add: Vec<String>,
    remove: Vec<String>,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    if info.sender != config.admin {
        return Err(ContractError::Unauthorized {
            reason: "only admin can update operators".to_string(),
        });
    }

    // Remove operators
    for addr_str in &remove {
        let addr = deps.api.addr_validate(addr_str)?;
        config.operators.retain(|a| a != addr);
    }

    // Add operators
    for addr_str in &add {
        let addr = deps.api.addr_validate(addr_str)?;
        if !config.operators.contains(&addr) {
            config.operators.push(addr);
        }
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "update_operators")
        .add_attribute("added", add.join(",")))
}
