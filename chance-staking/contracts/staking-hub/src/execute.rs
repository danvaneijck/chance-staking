use cosmwasm_std::{
    coins, BankMsg, Coin, CosmosMsg, Decimal, DepsMut, Env, Event, MessageInfo, StakingMsg,
    Uint128, WasmMsg,
};
use injective_cosmwasm::{
    create_burn_tokens_msg, create_mint_tokens_msg, create_new_denom_msg, InjectiveMsgWrapper,
};

use crate::error::ContractError;
use crate::msg::DistributorExecuteMsg;
use crate::state::{
    UnstakeRequest, CONFIG, EPOCH_STATE, EXCHANGE_RATE, NEXT_UNSTAKE_ID,
    TOTAL_CSINJ_SUPPLY, TOTAL_INJ_BACKING, UNSTAKE_REQUESTS,
};

type ContractResponse = cosmwasm_std::Response<InjectiveMsgWrapper>;

/// 21 days in seconds for unbonding period
const UNBONDING_PERIOD_SECS: u64 = 21 * 24 * 60 * 60;

/// Create the Token Factory denom during instantiation.
pub fn create_denom(
    env: &Env,
    subdenom: &str,
) -> Result<(CosmosMsg<InjectiveMsgWrapper>, String), ContractError> {
    let contract_addr = env.contract.address.to_string();
    let msg = create_new_denom_msg(contract_addr.clone(), subdenom.to_string());
    let full_denom = format!("factory/{}/{}", contract_addr, subdenom);
    Ok((msg, full_denom))
}

/// Helper: convert a Decimal to Uint128 by truncating fractional part.
/// Decimal internally stores value * 10^18, so we divide atomics by DECIMAL_FRACTIONAL.
#[inline]
fn decimal_to_uint128(d: Decimal) -> Uint128 {
    // Decimal::atomics() returns the raw u128 representation (value * 10^18).
    // Decimal::DECIMAL_FRACTIONAL is 10^18.
    d.atomics() / Decimal::DECIMAL_FRACTIONAL
}

/// Stake INJ → mint csINJ at current exchange rate.
pub fn stake(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
) -> Result<ContractResponse, ContractError> {
    // Validate funds: exactly one coin, must be INJ
    if info.funds.is_empty() {
        return Err(ContractError::NoFundsSent);
    }
    if info.funds.len() != 1 {
        return Err(ContractError::InvalidFunds);
    }
    let sent = &info.funds[0];
    if sent.denom != "inj" {
        return Err(ContractError::WrongDenom {
            denom: sent.denom.clone(),
        });
    }
    let inj_amount = sent.amount;
    if inj_amount.is_zero() {
        return Err(ContractError::NoFundsSent);
    }

    let config = CONFIG.load(deps.storage)?;
    let exchange_rate = EXCHANGE_RATE.load(deps.storage)?;

    // Calculate csINJ to mint: inj_amount / exchange_rate
    // exchange_rate = total_inj_backing / total_csinj_supply
    // csinj_to_mint = inj_amount / exchange_rate
    // Using Decimal arithmetic: build a Decimal, divide, then extract Uint128.
    let csinj_decimal = Decimal::from_ratio(inj_amount, 1u128) / exchange_rate;
    let csinj_amount = decimal_to_uint128(csinj_decimal);

    // Update totals
    let new_backing = TOTAL_INJ_BACKING.load(deps.storage)? + inj_amount;
    TOTAL_INJ_BACKING.save(deps.storage, &new_backing)?;

    let new_supply = TOTAL_CSINJ_SUPPLY.load(deps.storage)? + csinj_amount;
    TOTAL_CSINJ_SUPPLY.save(deps.storage, &new_supply)?;

    // Update epoch total staked
    let mut epoch_state = EPOCH_STATE.load(deps.storage)?;
    epoch_state.total_staked = new_backing;
    EPOCH_STATE.save(deps.storage, &epoch_state)?;

    // Mint csINJ via Token Factory
    let mint_msg = create_mint_tokens_msg(
        env.contract.address.clone(),
        Coin {
            denom: config.csinj_denom.clone(),
            amount: csinj_amount,
        },
        info.sender.to_string(),
    );

    // Delegate INJ to validators (round-robin)
    let delegate_msgs = create_delegation_msgs(&config.validators, inj_amount)?;

    let mut response = ContractResponse::new()
        .add_message(mint_msg)
        .add_attribute("action", "stake")
        .add_attribute("user", info.sender.to_string())
        .add_attribute("inj_amount", inj_amount.to_string())
        .add_attribute("csinj_minted", csinj_amount.to_string())
        .add_event(
            Event::new("chance_stake")
                .add_attribute("user", info.sender.to_string())
                .add_attribute("inj_amount", inj_amount.to_string())
                .add_attribute("csinj_minted", csinj_amount.to_string())
                .add_attribute("exchange_rate", exchange_rate.to_string()),
        );

    for msg in delegate_msgs {
        response = response.add_message(msg);
    }

    Ok(response)
}

/// Unstake csINJ → begin unbonding, create unstake request.
pub fn unstake(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
) -> Result<ContractResponse, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Validate funds: exactly one coin, must be csINJ
    if info.funds.is_empty() {
        return Err(ContractError::NoUnstakeFunds);
    }
    if info.funds.len() != 1 {
        return Err(ContractError::InvalidFunds);
    }
    let sent = &info.funds[0];
    if sent.denom != config.csinj_denom {
        return Err(ContractError::WrongUnstakeDenom {
            denom: sent.denom.clone(),
        });
    }
    let csinj_amount = sent.amount;
    if csinj_amount.is_zero() {
        return Err(ContractError::NoUnstakeFunds);
    }

    let exchange_rate = EXCHANGE_RATE.load(deps.storage)?;

    // Calculate INJ to return: csinj_amount * exchange_rate
    // Using Decimal arithmetic then extracting Uint128.
    let inj_decimal = Decimal::from_ratio(csinj_amount, 1u128) * exchange_rate;
    let inj_amount = decimal_to_uint128(inj_decimal);

    // Update totals
    let new_backing = TOTAL_INJ_BACKING
        .load(deps.storage)?
        .checked_sub(inj_amount)
        .unwrap_or(Uint128::zero());
    TOTAL_INJ_BACKING.save(deps.storage, &new_backing)?;

    let new_supply = TOTAL_CSINJ_SUPPLY
        .load(deps.storage)?
        .checked_sub(csinj_amount)
        .unwrap_or(Uint128::zero());
    TOTAL_CSINJ_SUPPLY.save(deps.storage, &new_supply)?;

    // Update epoch total staked
    let mut epoch_state = EPOCH_STATE.load(deps.storage)?;
    epoch_state.total_staked = new_backing;
    EPOCH_STATE.save(deps.storage, &epoch_state)?;

    // Create unstake request
    let unlock_time =
        cosmwasm_std::Timestamp::from_seconds(env.block.time.seconds() + UNBONDING_PERIOD_SECS);
    let request_id = NEXT_UNSTAKE_ID
        .may_load(deps.storage, &info.sender)?
        .unwrap_or(0);
    let request = UnstakeRequest {
        inj_amount,
        csinj_burned: csinj_amount,
        unlock_time,
        claimed: false,
    };
    UNSTAKE_REQUESTS.save(deps.storage, (&info.sender, request_id), &request)?;
    NEXT_UNSTAKE_ID.save(deps.storage, &info.sender, &(request_id + 1))?;

    // Burn csINJ via Token Factory
    let burn_msg = create_burn_tokens_msg(
        env.contract.address.clone(),
        Coin {
            denom: config.csinj_denom.clone(),
            amount: csinj_amount,
        },
    );

    // Undelegate INJ from validators (round-robin)
    let undelegate_msgs = create_undelegation_msgs(&config.validators, inj_amount)?;

    let mut response = ContractResponse::new()
        .add_message(burn_msg)
        .add_attribute("action", "unstake")
        .add_attribute("user", info.sender.to_string())
        .add_attribute("csinj_burned", csinj_amount.to_string())
        .add_attribute("inj_owed", inj_amount.to_string())
        .add_event(
            Event::new("chance_unstake")
                .add_attribute("user", info.sender.to_string())
                .add_attribute("csinj_burned", csinj_amount.to_string())
                .add_attribute("inj_owed", inj_amount.to_string())
                .add_attribute("exchange_rate", exchange_rate.to_string())
                .add_attribute("unlock_time", unlock_time.seconds().to_string())
                .add_attribute("request_id", request_id.to_string()),
        );

    for msg in undelegate_msgs {
        response = response.add_message(msg);
    }

    Ok(response)
}

/// Claim unlocked unstake requests.
pub fn claim_unstaked(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    request_ids: Vec<u64>,
) -> Result<ContractResponse, ContractError> {
    let mut total_claim = Uint128::zero();

    for id in &request_ids {
        let mut request = UNSTAKE_REQUESTS
            .may_load(deps.storage, (&info.sender, *id))?
            .ok_or(ContractError::UnstakeRequestNotFound {
                address: info.sender.to_string(),
                id: *id,
            })?;

        if request.claimed {
            return Err(ContractError::UnstakeAlreadyClaimed { id: *id });
        }

        if env.block.time < request.unlock_time {
            return Err(ContractError::UnstakeNotUnlocked {
                id: *id,
                unlock_time: request.unlock_time.seconds(),
            });
        }

        request.claimed = true;
        UNSTAKE_REQUESTS.save(deps.storage, (&info.sender, *id), &request)?;
        total_claim += request.inj_amount;
    }

    let send_msg = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: coins(total_claim.u128(), "inj"),
    };

    Ok(ContractResponse::new()
        .add_message(send_msg)
        .add_attribute("action", "claim_unstaked")
        .add_attribute("user", info.sender.to_string())
        .add_attribute("total_claimed", total_claim.to_string())
        .add_attribute("request_ids", format!("{:?}", request_ids)))
}

/// Advance to next epoch. Claims validator rewards and distributes them.
/// Operator only.
pub fn advance_epoch(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
) -> Result<ContractResponse, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if info.sender != config.operator {
        return Err(ContractError::Unauthorized {
            reason: "only operator can advance epoch".to_string(),
        });
    }

    let mut epoch_state = EPOCH_STATE.load(deps.storage)?;

    // In a real deployment, we'd query actual staking rewards.
    // For the contract logic, the operator sends the claimed rewards as funds.
    // The rewards are whatever INJ was sent with this message.
    let total_rewards = info
        .funds
        .iter()
        .find(|c| c.denom == "inj")
        .map(|c| c.amount)
        .unwrap_or(Uint128::zero());

    // Split rewards according to basis points using Uint128::multiply_ratio
    // This avoids Decimal entirely and is the idiomatic CosmWasm approach.
    let regular_amount = total_rewards.multiply_ratio(config.regular_pool_bps as u128, 10000u128);
    let big_amount = total_rewards.multiply_ratio(config.big_pool_bps as u128, 10000u128);
    let base_yield = total_rewards.multiply_ratio(config.base_yield_bps as u128, 10000u128);
    let treasury_fee = total_rewards.multiply_ratio(config.protocol_fee_bps as u128, 10000u128);

    // Update exchange rate with base yield
    let total_backing = TOTAL_INJ_BACKING.load(deps.storage)?;
    let total_supply = TOTAL_CSINJ_SUPPLY.load(deps.storage)?;

    let new_backing = total_backing + base_yield;
    TOTAL_INJ_BACKING.save(deps.storage, &new_backing)?;

    let new_rate = if total_supply.is_zero() {
        Decimal::one()
    } else {
        Decimal::from_ratio(new_backing, total_supply)
    };
    EXCHANGE_RATE.save(deps.storage, &new_rate)?;

    // Advance epoch
    epoch_state.current_epoch += 1;
    epoch_state.epoch_start_time = env.block.time;
    epoch_state.total_staked = new_backing;
    epoch_state.snapshot_merkle_root = None;
    epoch_state.snapshot_finalized = false;
    epoch_state.snapshot_total_weight = Uint128::zero();
    epoch_state.snapshot_num_holders = 0;
    epoch_state.snapshot_uri = None;
    EPOCH_STATE.save(deps.storage, &epoch_state)?;

    let mut response = ContractResponse::new()
        .add_attribute("action", "advance_epoch")
        .add_attribute("new_epoch", epoch_state.current_epoch.to_string())
        .add_attribute("total_rewards", total_rewards.to_string());

    // Fund regular pool
    if !regular_amount.is_zero() {
        let fund_regular_msg = WasmMsg::Execute {
            contract_addr: config.reward_distributor.to_string(),
            msg: cosmwasm_std::to_json_binary(&DistributorExecuteMsg::FundRegularPool {})?,
            funds: coins(regular_amount.u128(), "inj"),
        };
        response = response.add_message(fund_regular_msg);
    }

    // Fund big pool
    if !big_amount.is_zero() {
        let fund_big_msg = WasmMsg::Execute {
            contract_addr: config.reward_distributor.to_string(),
            msg: cosmwasm_std::to_json_binary(&DistributorExecuteMsg::FundBigPool {})?,
            funds: coins(big_amount.u128(), "inj"),
        };
        response = response.add_message(fund_big_msg);
    }

    // Send treasury fee
    if !treasury_fee.is_zero() {
        let treasury_msg = BankMsg::Send {
            to_address: config.treasury.to_string(),
            amount: coins(treasury_fee.u128(), "inj"),
        };
        response = response.add_message(treasury_msg);
    }

    response = response.add_event(
        Event::new("chance_epoch_advanced")
            .add_attribute("epoch", epoch_state.current_epoch.to_string())
            .add_attribute("total_rewards_claimed", total_rewards.to_string())
            .add_attribute("regular_pool_funded", regular_amount.to_string())
            .add_attribute("big_pool_funded", big_amount.to_string())
            .add_attribute("base_yield_added", base_yield.to_string())
            .add_attribute("treasury_fee", treasury_fee.to_string())
            .add_attribute("new_exchange_rate", new_rate.to_string()),
    );

    Ok(response)
}

/// Submit a snapshot merkle root for the current epoch. Operator only.
/// This also forwards the snapshot to the reward distributor.
pub fn take_snapshot(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    merkle_root: String,
    total_weight: Uint128,
    num_holders: u32,
    snapshot_uri: String,
) -> Result<ContractResponse, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    if info.sender != config.operator {
        return Err(ContractError::Unauthorized {
            reason: "only operator can take snapshots".to_string(),
        });
    }

    let mut epoch_state = EPOCH_STATE.load(deps.storage)?;

    if epoch_state.snapshot_finalized {
        return Err(ContractError::SnapshotAlreadyTaken);
    }

    epoch_state.snapshot_merkle_root = Some(merkle_root.clone());
    epoch_state.snapshot_finalized = true;
    epoch_state.snapshot_total_weight = total_weight;
    epoch_state.snapshot_num_holders = num_holders;
    epoch_state.snapshot_uri = Some(snapshot_uri.clone());
    EPOCH_STATE.save(deps.storage, &epoch_state)?;

    // Forward snapshot to reward distributor
    let set_snapshot_msg = WasmMsg::Execute {
        contract_addr: config.reward_distributor.to_string(),
        msg: cosmwasm_std::to_json_binary(&DistributorExecuteMsg::SetSnapshot {
            epoch: epoch_state.current_epoch,
            merkle_root: merkle_root.clone(),
            total_weight,
            num_holders,
        })?,
        funds: vec![],
    };

    Ok(ContractResponse::new()
        .add_message(set_snapshot_msg)
        .add_attribute("action", "take_snapshot")
        .add_attribute("epoch", epoch_state.current_epoch.to_string())
        .add_attribute("merkle_root", merkle_root)
        .add_attribute("total_weight", total_weight.to_string())
        .add_attribute("num_holders", num_holders.to_string())
        .add_event(
            Event::new("chance_snapshot_taken")
                .add_attribute("epoch", epoch_state.current_epoch.to_string())
                .add_attribute("total_weight", total_weight.to_string())
                .add_attribute("num_holders", num_holders.to_string())
                .add_attribute("snapshot_uri", snapshot_uri),
        ))
}

/// Update contract configuration. Admin only.
pub fn update_config(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    admin: Option<String>,
    operator: Option<String>,
    protocol_fee_bps: Option<u16>,
) -> Result<ContractResponse, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    if info.sender != config.admin {
        return Err(ContractError::Unauthorized {
            reason: "only admin can update config".to_string(),
        });
    }

    if let Some(new_admin) = admin {
        config.admin = deps.api.addr_validate(&new_admin)?;
    }
    if let Some(new_operator) = operator {
        config.operator = deps.api.addr_validate(&new_operator)?;
    }
    if let Some(new_fee) = protocol_fee_bps {
        if new_fee > 10000 {
            return Err(ContractError::InvalidBps {
                field: "protocol_fee_bps".to_string(),
                value: new_fee,
            });
        }
        config.protocol_fee_bps = new_fee;
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(ContractResponse::new().add_attribute("action", "update_config"))
}

/// Update validator set. Admin only.
pub fn update_validators(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    add: Vec<String>,
    remove: Vec<String>,
) -> Result<ContractResponse, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    if info.sender != config.admin {
        return Err(ContractError::Unauthorized {
            reason: "only admin can update validators".to_string(),
        });
    }

    for v in &remove {
        config.validators.retain(|existing| existing != v);
    }
    for v in add {
        if !config.validators.contains(&v) {
            config.validators.push(v);
        }
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(ContractResponse::new().add_attribute("action", "update_validators"))
}

/// Helper: create delegation messages distributing INJ across validators (round-robin).
fn create_delegation_msgs(
    validators: &[String],
    total_amount: Uint128,
) -> Result<Vec<CosmosMsg<InjectiveMsgWrapper>>, ContractError> {
    if validators.is_empty() {
        return Err(ContractError::NoValidators);
    }

    let per_validator = total_amount / Uint128::from(validators.len() as u128);
    let remainder = total_amount - per_validator * Uint128::from(validators.len() as u128);

    let mut msgs = Vec::new();
    for (i, validator) in validators.iter().enumerate() {
        let mut amount = per_validator;
        if i == 0 {
            amount += remainder; // First validator gets the remainder
        }
        if !amount.is_zero() {
            msgs.push(CosmosMsg::Staking(StakingMsg::Delegate {
                validator: validator.clone(),
                amount: Coin {
                    denom: "inj".to_string(),
                    amount,
                },
            }));
        }
    }

    Ok(msgs)
}

/// Helper: create undelegation messages distributing across validators (round-robin).
fn create_undelegation_msgs(
    validators: &[String],
    total_amount: Uint128,
) -> Result<Vec<CosmosMsg<InjectiveMsgWrapper>>, ContractError> {
    if validators.is_empty() {
        return Err(ContractError::NoValidators);
    }

    let per_validator = total_amount / Uint128::from(validators.len() as u128);
    let remainder = total_amount - per_validator * Uint128::from(validators.len() as u128);

    let mut msgs = Vec::new();
    for (i, validator) in validators.iter().enumerate() {
        let mut amount = per_validator;
        if i == 0 {
            amount += remainder;
        }
        if !amount.is_zero() {
            msgs.push(CosmosMsg::Staking(StakingMsg::Undelegate {
                validator: validator.clone(),
                amount: Coin {
                    denom: "inj".to_string(),
                    amount,
                },
            }));
        }
    }

    Ok(msgs)
}
