use chance_staking_common::merkle::{compute_leaf_hash, verify_merkle_proof};
use cosmwasm_std::{to_json_binary, Binary, Deps, Order, StdResult, Uint128};
use cw_storage_plus::Bound;

use crate::state::{
    CONFIG, DRAWS, DRAW_STATE, SNAPSHOTS, USER_TOTAL_WON, USER_WINS, USER_WIN_COUNT,
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
    let start = start_after.map(Bound::exclusive);

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

pub fn query_user_wins(
    deps: Deps,
    address: String,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<Binary> {
    let addr = deps.api.addr_validate(&address)?;
    let limit = limit.unwrap_or(100).min(100) as usize;
    let start = start_after.map(Bound::exclusive);

    let draw_ids: Vec<u64> = USER_WINS
        .prefix(&addr)
        .range(deps.storage, start, None, Order::Ascending)
        .take(limit)
        .filter_map(|r| r.ok())
        .map(|(draw_id, _)| draw_id)
        .collect();

    let total_wins = USER_WIN_COUNT
        .may_load(deps.storage, &addr)?
        .unwrap_or(0);
    let total_won = USER_TOTAL_WON
        .may_load(deps.storage, &addr)?
        .unwrap_or(Uint128::zero());

    to_json_binary(&UserWinsResponse {
        address,
        total_wins,
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
    let limit = limit.unwrap_or(20).min(100) as usize;
    let start = start_after.map(Bound::exclusive);

    let draws: Vec<_> = USER_WINS
        .prefix(&addr)
        .range(deps.storage, start, None, Order::Ascending)
        .take(limit)
        .filter_map(|r| r.ok())
        .filter_map(|(draw_id, _)| DRAWS.load(deps.storage, draw_id).ok())
        .collect();

    to_json_binary(&draws)
}

pub fn query_verify_inclusion(
    _deps: Deps,
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
