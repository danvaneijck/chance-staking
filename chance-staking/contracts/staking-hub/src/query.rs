use cosmwasm_std::{to_json_binary, Binary, Deps, Order, StdResult};

use crate::msg::{ExchangeRateResponse, UnstakeRequestEntry};
use crate::state::{
    CONFIG, EPOCH_STATE, EXCHANGE_RATE, NEXT_UNSTAKE_ID, TOTAL_CSINJ_SUPPLY, TOTAL_INJ_BACKING,
    UNSTAKE_REQUESTS,
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

pub fn query_unstake_requests(deps: Deps, address: String) -> StdResult<Binary> {
    let addr = deps.api.addr_validate(&address)?;
    let next_id = NEXT_UNSTAKE_ID
        .may_load(deps.storage, &addr)?
        .unwrap_or(0);

    let mut entries = Vec::new();
    for id in 0..next_id {
        if let Some(request) = UNSTAKE_REQUESTS.may_load(deps.storage, (&addr, id))? {
            entries.push(UnstakeRequestEntry { id, request });
        }
    }

    to_json_binary(&entries)
}
