use cosmwasm_std::{to_json_binary, Binary, Deps, StdResult};

use crate::state::{BEACONS, CONFIG, LATEST_ROUND};

pub fn query_config(deps: Deps) -> StdResult<Binary> {
    let config = CONFIG.load(deps.storage)?;
    to_json_binary(&config)
}

pub fn query_beacon(deps: Deps, round: u64) -> StdResult<Binary> {
    let beacon = BEACONS.may_load(deps.storage, round)?;
    to_json_binary(&beacon)
}

pub fn query_latest_round(deps: Deps) -> StdResult<Binary> {
    let round = LATEST_ROUND.may_load(deps.storage)?.unwrap_or(0);
    to_json_binary(&round)
}
