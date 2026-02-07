use chance_staking_common::merkle::{compute_leaf_hash, verify_merkle_proof};
use cosmwasm_std::{to_json_binary, Binary, Deps, Order, StdResult, Uint128};

use crate::state::{
    CONFIG, DRAWS, DRAW_STATE, SNAPSHOTS, USER_TOTAL_WON, USER_WINS,
};
use crate::msg::{DrawHistoryResponse, PoolBalancesResponse, UserWinsResponse};

pub fn query_config(deps: Deps) -> StdResult<Binary> {
    let config = CONFIG.load(deps.storage)?;
    to_json_binary(&config)
}

pub fn query_draw_state(deps: Deps) -> StdResult<Binary> {
    let state = DRAW_STATE.load(deps.storage)?;
    to_json_binary(&state)
}

pub fn query_draw(deps: Deps, draw_id: u64) -> StdResult<Binary> {
    let draw = DRAWS.load(deps.storage, draw_id)?;
    to_json_binary(&draw)
}

pub fn query_draw_history(
    deps: Deps,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<Binary> {
    let limit = limit.unwrap_or(20).min(100) as usize;
    let start = start_after.map(|s| cosmwasm_std::Bound::exclusive(s));

    let draws: Vec<_> = DRAWS
        .range(deps.storage, start, None, Order::Ascending)
        .take(limit)
        .filter_map(|r| r.ok())
        .map(|(_, draw)| draw)
        .collect();

    to_json_binary(&DrawHistoryResponse { draws })
}

pub fn query_pool_balances(deps: Deps) -> StdResult<Binary> {
    let state = DRAW_STATE.load(deps.storage)?;
    to_json_binary(&PoolBalancesResponse {
        regular_pool: state.regular_pool_balance,
        big_pool: state.big_pool_balance,
    })
}

pub fn query_user_wins(deps: Deps, address: String) -> StdResult<Binary> {
    let addr = deps.api.addr_validate(&address)?;
    let draw_ids = USER_WINS
        .may_load(deps.storage, &addr)?
        .unwrap_or_default();
    let total_won = USER_TOTAL_WON
        .may_load(deps.storage, &addr)?
        .unwrap_or(Uint128::zero());

    to_json_binary(&UserWinsResponse {
        address,
        total_wins: draw_ids.len() as u32,
        total_won_amount: total_won,
        draw_ids,
    })
}

pub fn query_user_win_details(
    deps: Deps,
    address: String,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<Binary> {
    let addr = deps.api.addr_validate(&address)?;
    let draw_ids = USER_WINS
        .may_load(deps.storage, &addr)?
        .unwrap_or_default();

    let limit = limit.unwrap_or(20).min(100) as usize;

    let mut draws = Vec::new();
    let filtered_ids: Vec<u64> = if let Some(start) = start_after {
        draw_ids.into_iter().filter(|id| *id > start).collect()
    } else {
        draw_ids
    };

    for id in filtered_ids.into_iter().take(limit) {
        if let Ok(draw) = DRAWS.load(deps.storage, id) {
            draws.push(draw);
        }
    }

    to_json_binary(&draws)
}

pub fn query_verify_inclusion(
    deps: Deps,
    merkle_root: String,
    proof: Vec<String>,
    leaf_address: String,
    cumulative_start: Uint128,
    cumulative_end: Uint128,
) -> StdResult<Binary> {
    let leaf_hash = compute_leaf_hash(
        &leaf_address,
        cumulative_start.u128(),
        cumulative_end.u128(),
    );
    let valid = verify_merkle_proof(&merkle_root, &proof, &leaf_hash);
    to_json_binary(&valid)
}

pub fn query_snapshot(deps: Deps, epoch: u64) -> StdResult<Binary> {
    let snapshot = SNAPSHOTS.may_load(deps.storage, epoch)?;
    to_json_binary(&snapshot)
}
