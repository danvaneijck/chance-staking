use cosmwasm_std::{to_json_binary, Binary, Deps, Env, Order, StdResult, Uint128};
use cw_storage_plus::Bound;

use crate::msg::{
    ExchangeRateResponse, StakerInfoResponse, UnstakeRequestEntry, ValidatorDelegation,
    ValidatorDelegationsResponse,
};
use crate::state::{
    CONFIG, EPOCH_STATE, EXCHANGE_RATE, TOTAL_CSINJ_SUPPLY, TOTAL_INJ_BACKING, UNSTAKE_REQUESTS,
    USER_STAKE_EPOCH,
};

pub fn query_config(deps: Deps) -> StdResult<Binary> {
    let config = CONFIG.load(deps.storage)?;
    to_json_binary(&config)
}

pub fn query_epoch_state(deps: Deps) -> StdResult<Binary> {
    let state = EPOCH_STATE.load(deps.storage)?;
    to_json_binary(&state)
}

pub fn query_exchange_rate(deps: Deps) -> StdResult<Binary> {
    let rate = EXCHANGE_RATE.load(deps.storage)?;
    let total_inj_backing = TOTAL_INJ_BACKING.load(deps.storage)?;
    let total_csinj_supply = TOTAL_CSINJ_SUPPLY.load(deps.storage)?;

    to_json_binary(&ExchangeRateResponse {
        rate,
        total_inj_backing,
        total_csinj_supply,
    })
}

pub fn query_unstake_requests(
    deps: Deps,
    address: String,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<Binary> {
    let addr = deps.api.addr_validate(&address)?;
    let limit = limit.unwrap_or(50).min(100) as usize;
    let start = start_after.map(Bound::exclusive);

    let entries: Vec<UnstakeRequestEntry> = UNSTAKE_REQUESTS
        .prefix(&addr)
        .range(deps.storage, start, None, Order::Ascending)
        .take(limit)
        .filter_map(|r| r.ok())
        .map(|(id, request)| UnstakeRequestEntry { id, request })
        .collect();

    to_json_binary(&entries)
}

pub fn query_staker_info(deps: Deps, address: String) -> StdResult<Binary> {
    let addr = deps.api.addr_validate(&address)?;
    let stake_epoch = USER_STAKE_EPOCH.may_load(deps.storage, &addr)?;
    to_json_binary(&StakerInfoResponse {
        address,
        stake_epoch,
    })
}

pub fn query_validator_delegations(deps: Deps, env: Env) -> StdResult<Binary> {
    let config = CONFIG.load(deps.storage)?;
    let mut delegations = Vec::new();
    let mut total_delegated = Uint128::zero();

    for validator in &config.validators {
        let delegation = deps
            .querier
            .query_delegation(&env.contract.address, validator)?;
        let amount = delegation
            .map(|d| d.amount.amount)
            .unwrap_or(Uint128::zero());
        delegations.push(ValidatorDelegation {
            validator: validator.clone(),
            amount,
        });
        total_delegated += amount;
    }

    to_json_binary(&ValidatorDelegationsResponse {
        delegations,
        total_delegated,
    })
}
