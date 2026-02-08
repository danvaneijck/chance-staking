use chance_staking_common::merkle::{compute_leaf_hash, verify_merkle_proof};
use chance_staking_common::types::{DrawStatus, DrawType};
use cosmwasm_std::{
    coins, to_json_binary, BankMsg, DepsMut, Env, Event, MessageInfo, QueryRequest, Response,
    Timestamp, Uint128, WasmQuery,
};
use sha2::{Digest, Sha256};

use crate::error::ContractError;
use crate::msg::{CommitDrawParams, OracleQueryMsg, RevealDrawParams, UpdateConfigParams};
use crate::state::{
    Draw, Snapshot, CONFIG, DRAWS, DRAW_STATE, SNAPSHOTS, USER_TOTAL_WON, USER_WINS, USER_WIN_COUNT,
};

/// Fund the regular draw pool. Only staking hub can call.
pub fn fund_regular_pool(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.staking_hub {
        return Err(ContractError::Unauthorized {
            reason: "only staking hub can fund pools".to_string(),
        });
    }

    let inj_amount = info
        .funds
        .iter()
        .find(|c| c.denom == "inj")
        .map(|c| c.amount)
        .unwrap_or(Uint128::zero());

    if inj_amount.is_zero() {
        return Err(ContractError::NoFundsSent);
    }

    let mut state = DRAW_STATE.load(deps.storage)?;
    state.regular_pool_balance += inj_amount;
    DRAW_STATE.save(deps.storage, &state)?;

    Ok(Response::new()
        .add_attribute("action", "fund_regular_pool")
        .add_attribute("amount", inj_amount.to_string())
        .add_event(
            Event::new("chance_pool_funded")
                .add_attribute("pool", "regular")
                .add_attribute("amount", inj_amount.to_string())
                .add_attribute("new_balance", state.regular_pool_balance.to_string()),
        ))
}

/// Fund the big draw pool. Only staking hub can call.
pub fn fund_big_pool(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.staking_hub {
        return Err(ContractError::Unauthorized {
            reason: "only staking hub can fund pools".to_string(),
        });
    }

    let inj_amount = info
        .funds
        .iter()
        .find(|c| c.denom == "inj")
        .map(|c| c.amount)
        .unwrap_or(Uint128::zero());

    if inj_amount.is_zero() {
        return Err(ContractError::NoFundsSent);
    }

    let mut state = DRAW_STATE.load(deps.storage)?;
    state.big_pool_balance += inj_amount;
    DRAW_STATE.save(deps.storage, &state)?;

    Ok(Response::new()
        .add_attribute("action", "fund_big_pool")
        .add_attribute("amount", inj_amount.to_string())
        .add_event(
            Event::new("chance_pool_funded")
                .add_attribute("pool", "big")
                .add_attribute("amount", inj_amount.to_string())
                .add_attribute("new_balance", state.big_pool_balance.to_string()),
        ))
}

/// Set snapshot from staking hub.
pub fn set_snapshot(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    epoch: u64,
    merkle_root: String,
    total_weight: Uint128,
    num_holders: u32,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.staking_hub {
        return Err(ContractError::Unauthorized {
            reason: "only staking hub can set snapshots".to_string(),
        });
    }

    let snapshot = Snapshot {
        epoch,
        merkle_root: merkle_root.clone(),
        total_weight,
        num_holders,
        submitted_at: env.block.time,
    };
    SNAPSHOTS.save(deps.storage, epoch, &snapshot)?;

    Ok(Response::new()
        .add_attribute("action", "set_snapshot")
        .add_attribute("epoch", epoch.to_string())
        .add_attribute("merkle_root", merkle_root)
        .add_event(
            Event::new("chance_snapshot_set")
                .add_attribute("epoch", epoch.to_string())
                .add_attribute("total_weight", total_weight.to_string())
                .add_attribute("num_holders", num_holders.to_string()),
        ))
}

/// Commit to a draw. Operator only.
/// Reward amount is the full pool balance at commit time.
/// Epoch spacing is enforced per draw type.
pub fn commit_draw(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    params: CommitDrawParams,
) -> Result<Response, ContractError> {
    let CommitDrawParams {
        draw_type,
        operator_commit,
        target_drand_round,
        epoch,
    } = params;

    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.operator {
        return Err(ContractError::Unauthorized {
            reason: "only operator can commit draws".to_string(),
        });
    }

    // Verify snapshot exists for this epoch
    if !SNAPSHOTS.has(deps.storage, epoch) {
        return Err(ContractError::NoSnapshot);
    }

    let mut state = DRAW_STATE.load(deps.storage)?;

    // Enforce epoch spacing and take full pool balance as reward
    let reward_amount = match draw_type {
        DrawType::Regular => {
            if let Some(last) = state.last_regular_draw_epoch {
                if epoch < last + config.epochs_between_regular {
                    return Err(ContractError::DrawTooSoon {
                        draw_type: "regular".to_string(),
                        epoch,
                        last_epoch: last,
                        min_gap: config.epochs_between_regular,
                    });
                }
            }
            if state.regular_pool_balance.is_zero() {
                return Err(ContractError::EmptyPool {
                    pool: "regular".to_string(),
                });
            }
            let amount = state.regular_pool_balance;
            state.regular_pool_balance = Uint128::zero();
            state.last_regular_draw_epoch = Some(epoch);
            amount
        }
        DrawType::Big => {
            if let Some(last) = state.last_big_draw_epoch {
                if epoch < last + config.epochs_between_big {
                    return Err(ContractError::DrawTooSoon {
                        draw_type: "big".to_string(),
                        epoch,
                        last_epoch: last,
                        min_gap: config.epochs_between_big,
                    });
                }
            }
            if state.big_pool_balance.is_zero() {
                return Err(ContractError::EmptyPool {
                    pool: "big".to_string(),
                });
            }
            let amount = state.big_pool_balance;
            state.big_pool_balance = Uint128::zero();
            state.last_big_draw_epoch = Some(epoch);
            amount
        }
    };

    let draw_id = state.next_draw_id;
    state.next_draw_id += 1;

    let reveal_deadline =
        Timestamp::from_seconds(env.block.time.seconds() + config.reveal_deadline_seconds);

    let draw = Draw {
        id: draw_id,
        draw_type: draw_type.clone(),
        epoch,
        status: DrawStatus::Committed,
        operator_commit: operator_commit.clone(),
        target_drand_round,
        drand_randomness: None,
        operator_secret: None,
        final_randomness: None,
        winner: None,
        reward_amount,
        created_at: env.block.time,
        revealed_at: None,
        reveal_deadline,
        merkle_root: None,
        total_weight: None,
    };

    DRAWS.save(deps.storage, draw_id, &draw)?;
    DRAW_STATE.save(deps.storage, &state)?;

    let draw_type_str = match draw_type {
        DrawType::Regular => "regular",
        DrawType::Big => "big",
    };

    Ok(Response::new()
        .add_attribute("action", "commit_draw")
        .add_attribute("draw_id", draw_id.to_string())
        .add_event(
            Event::new("chance_draw_committed")
                .add_attribute("draw_id", draw_id.to_string())
                .add_attribute("draw_type", draw_type_str)
                .add_attribute("reward_amount", reward_amount.to_string())
                .add_attribute("target_drand_round", target_drand_round.to_string())
                .add_attribute("reveal_deadline", reveal_deadline.seconds().to_string())
                .add_attribute("epoch", epoch.to_string()),
        ))
}

/// Reveal a committed draw. Operator only.
///
/// This is the most complex function in the protocol:
/// 1. Verify commit pre-image: sha256(secret) == commit
/// 2. Query drand oracle for beacon randomness
/// 3. XOR randomness: final = drand_randomness XOR sha256(secret)
/// 4. Compute winning_ticket = uint128(final[0..16]) % total_weight
/// 5. Verify merkle proof that winner's range contains winning_ticket
/// 6. Send reward to winner
/// 7. Update USER_WINS and USER_TOTAL_WON
pub fn reveal_draw(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    params: RevealDrawParams,
) -> Result<Response, ContractError> {
    let RevealDrawParams {
        draw_id,
        operator_secret_hex,
        winner_address,
        winner_cumulative_start,
        winner_cumulative_end,
        merkle_proof,
    } = params;

    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.operator {
        return Err(ContractError::Unauthorized {
            reason: "only operator can reveal draws".to_string(),
        });
    }

    let mut draw = DRAWS
        .may_load(deps.storage, draw_id)?
        .ok_or(ContractError::DrawNotFound { draw_id })?;

    // Must be in Committed status
    if draw.status != DrawStatus::Committed {
        return Err(ContractError::DrawNotCommitted { draw_id });
    }

    // Must not be expired
    if env.block.time > draw.reveal_deadline {
        return Err(ContractError::DrawExpired {
            draw_id,
            deadline: draw.reveal_deadline.seconds(),
        });
    }

    // 1. Verify commit pre-image
    let operator_secret =
        hex::decode(&operator_secret_hex).map_err(|_| ContractError::InvalidHex {
            field: "operator_secret_hex".to_string(),
        })?;
    let secret_hash: [u8; 32] = Sha256::digest(&operator_secret).into();
    let secret_hash_hex = hex::encode(secret_hash);
    if secret_hash_hex != draw.operator_commit {
        return Err(ContractError::CommitMismatch);
    }

    // 2. Query drand oracle for beacon
    let beacon_query = QueryRequest::Wasm(WasmQuery::Smart {
        contract_addr: config.drand_oracle.to_string(),
        msg: to_json_binary(&OracleQueryMsg::Beacon {
            round: draw.target_drand_round,
        })?,
    });

    let beacon_response: Option<crate::state::StoredBeaconResponse> =
        deps.querier.query(&beacon_query)?;
    let beacon = beacon_response.ok_or(ContractError::BeaconNotFound {
        round: draw.target_drand_round,
    })?;

    let drand_randomness = beacon.randomness;
    if drand_randomness.len() != 32 {
        return Err(ContractError::BeaconNotFound {
            round: draw.target_drand_round,
        });
    }

    // 3. XOR randomness: final = drand_randomness XOR sha256(operator_secret)
    let mut final_randomness = [0u8; 32];
    for i in 0..32 {
        final_randomness[i] = drand_randomness[i] ^ secret_hash[i];
    }

    // 4. Get snapshot for this draw's epoch
    let snapshot = SNAPSHOTS
        .may_load(deps.storage, draw.epoch)?
        .ok_or(ContractError::NoSnapshot)?;

    let total_weight = snapshot.total_weight;

    // Compute winning_ticket = uint128(final_randomness[0..16]) % total_weight
    let mut ticket_bytes = [0u8; 16];
    ticket_bytes.copy_from_slice(&final_randomness[0..16]);
    let ticket_raw = u128::from_be_bytes(ticket_bytes);
    let winning_ticket = ticket_raw % total_weight.u128();

    // 5. Verify winning ticket is in winner's range
    if winning_ticket < winner_cumulative_start.u128()
        || winning_ticket >= winner_cumulative_end.u128()
    {
        return Err(ContractError::WinningTicketOutOfRange {
            ticket: winning_ticket,
            start: winner_cumulative_start.u128(),
            end: winner_cumulative_end.u128(),
        });
    }

    // 6. Verify merkle proof
    let leaf_hash = compute_leaf_hash(
        &winner_address,
        winner_cumulative_start.u128(),
        winner_cumulative_end.u128(),
    );
    if !verify_merkle_proof(&snapshot.merkle_root, &merkle_proof, &leaf_hash) {
        return Err(ContractError::InvalidMerkleProof);
    }

    // 7. Send reward to winner
    let winner_addr = deps.api.addr_validate(&winner_address)?;
    let send_msg = BankMsg::Send {
        to_address: winner_address.clone(),
        amount: coins(draw.reward_amount.u128(), "inj"),
    };

    // 8. Update draw state
    draw.status = DrawStatus::Revealed;
    draw.drand_randomness = Some(drand_randomness.clone());
    draw.operator_secret = Some(operator_secret);
    draw.final_randomness = Some(final_randomness.to_vec());
    draw.winner = Some(winner_addr.clone());
    draw.revealed_at = Some(env.block.time);
    draw.merkle_root = Some(snapshot.merkle_root.clone());
    draw.total_weight = Some(total_weight);
    DRAWS.save(deps.storage, draw_id, &draw)?;

    // 9. Update draw state totals
    let mut state = DRAW_STATE.load(deps.storage)?;
    state.total_draws_completed += 1;
    state.total_rewards_distributed += draw.reward_amount;
    DRAW_STATE.save(deps.storage, &state)?;

    // 10. Update per-user win tracking (O(1) write per win, no unbounded Vec)
    USER_WINS.save(deps.storage, (&winner_addr, draw_id), &())?;
    let win_count = USER_WIN_COUNT
        .may_load(deps.storage, &winner_addr)?
        .unwrap_or(0);
    USER_WIN_COUNT.save(deps.storage, &winner_addr, &(win_count + 1))?;

    let user_total = USER_TOTAL_WON
        .may_load(deps.storage, &winner_addr)?
        .unwrap_or(Uint128::zero());
    USER_TOTAL_WON.save(
        deps.storage,
        &winner_addr,
        &(user_total + draw.reward_amount),
    )?;

    let draw_type_str = match draw.draw_type {
        DrawType::Regular => "regular",
        DrawType::Big => "big",
    };

    Ok(Response::new()
        .add_message(send_msg)
        .add_attribute("action", "reveal_draw")
        .add_attribute("draw_id", draw_id.to_string())
        .add_attribute("winner", winner_address.clone())
        .add_attribute("reward_amount", draw.reward_amount.to_string())
        .add_event(
            Event::new("chance_draw_result")
                .add_attribute("draw_id", draw_id.to_string())
                .add_attribute("draw_type", draw_type_str)
                .add_attribute("epoch", draw.epoch.to_string())
                .add_attribute("winner", winner_address)
                .add_attribute("reward_amount", draw.reward_amount.to_string())
                .add_attribute("reward_denom", "inj")
                .add_attribute("winning_ticket", winning_ticket.to_string())
                .add_attribute("total_weight", total_weight.to_string())
                .add_attribute("final_randomness", hex::encode(final_randomness))
                .add_attribute("drand_round", draw.target_drand_round.to_string())
                .add_attribute("timestamp", env.block.time.seconds().to_string()),
        ))
}

/// Expire a draw that wasn't revealed in time. Anyone can call.
/// Returns the reward amount back to the appropriate pool.
pub fn expire_draw(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    draw_id: u64,
) -> Result<Response, ContractError> {
    let mut draw = DRAWS
        .may_load(deps.storage, draw_id)?
        .ok_or(ContractError::DrawNotFound { draw_id })?;

    if draw.status != DrawStatus::Committed {
        return Err(ContractError::DrawNotCommitted { draw_id });
    }

    if env.block.time <= draw.reveal_deadline {
        return Err(ContractError::DrawNotExpired {
            draw_id,
            deadline: draw.reveal_deadline.seconds(),
        });
    }

    // Return funds to pool
    let mut state = DRAW_STATE.load(deps.storage)?;
    match draw.draw_type {
        DrawType::Regular => {
            state.regular_pool_balance += draw.reward_amount;
        }
        DrawType::Big => {
            state.big_pool_balance += draw.reward_amount;
        }
    }
    DRAW_STATE.save(deps.storage, &state)?;

    draw.status = DrawStatus::Expired;
    DRAWS.save(deps.storage, draw_id, &draw)?;

    let pool_str = match draw.draw_type {
        DrawType::Regular => "regular",
        DrawType::Big => "big",
    };

    Ok(Response::new()
        .add_attribute("action", "expire_draw")
        .add_attribute("draw_id", draw_id.to_string())
        .add_event(
            Event::new("chance_draw_expired")
                .add_attribute("draw_id", draw_id.to_string())
                .add_attribute("returned_amount", draw.reward_amount.to_string())
                .add_attribute("pool", pool_str),
        ))
}

/// Update configuration. Admin only.
pub fn update_config(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    params: UpdateConfigParams,
) -> Result<Response, ContractError> {
    let UpdateConfigParams {
        operator,
        staking_hub,
        reveal_deadline_seconds,
        epochs_between_regular,
        epochs_between_big,
    } = params;

    let mut config = CONFIG.load(deps.storage)?;

    if info.sender != config.admin {
        return Err(ContractError::Unauthorized {
            reason: "only admin can update config".to_string(),
        });
    }

    if let Some(op) = operator {
        config.operator = deps.api.addr_validate(&op)?;
    }
    if let Some(hub) = staking_hub {
        config.staking_hub = deps.api.addr_validate(&hub)?;
    }
    if let Some(deadline) = reveal_deadline_seconds {
        config.reveal_deadline_seconds = deadline;
    }
    if let Some(gap) = epochs_between_regular {
        config.epochs_between_regular = gap;
    }
    if let Some(gap) = epochs_between_big {
        config.epochs_between_big = gap;
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new().add_attribute("action", "update_config"))
}
