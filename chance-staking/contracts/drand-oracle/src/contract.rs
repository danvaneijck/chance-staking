use cosmwasm_std::{entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult};
use cw2::set_contract_version;

use crate::error::ContractError;
use crate::execute;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::query;
use crate::state::{CONFIG, LATEST_ROUND, OracleConfig};

const CONTRACT_NAME: &str = "crates.io:chance-drand-oracle";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    // Decode and validate pubkey
    let pubkey_bytes = hex::decode(&msg.quicknet_pubkey_hex).map_err(|_| {
        ContractError::InvalidHex {
            field: "quicknet_pubkey_hex".to_string(),
        }
    })?;
    if pubkey_bytes.len() != 96 {
        return Err(ContractError::InvalidPubkeyLength {
            got: pubkey_bytes.len(),
        });
    }

    // Validate operator addresses
    let mut operators = Vec::new();
    for op in &msg.operators {
        operators.push(deps.api.addr_validate(op)?);
    }

    let config = OracleConfig {
        admin: info.sender.clone(),
        operators,
        quicknet_pubkey: pubkey_bytes,
        chain_hash: msg.chain_hash,
        genesis_time: msg.genesis_time,
        period_seconds: msg.period_seconds,
    };

    CONFIG.save(deps.storage, &config)?;
    LATEST_ROUND.save(deps.storage, &0u64)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("contract", "drand-oracle")
        .add_attribute("admin", info.sender.to_string()))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::SubmitBeacon {
            round,
            signature_hex,
        } => execute::submit_beacon(deps, env, info, round, signature_hex),
        ExecuteMsg::UpdateOperators { add, remove } => {
            execute::update_operators(deps, env, info, add, remove)
        }
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => query::query_config(deps),
        QueryMsg::Beacon { round } => query::query_beacon(deps, round),
        QueryMsg::LatestRound {} => query::query_latest_round(deps),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, message_info, MockApi};
    use crate::{state::BEACONS, verify::QUICKNET_PK_HEX};

    fn setup_contract(deps: DepsMut) {
        let mock_api = MockApi::default();
        let admin = mock_api.addr_make("admin");
        let operator1 = mock_api.addr_make("operator1");
        let msg = InstantiateMsg {
            operators: vec![operator1.to_string()],
            quicknet_pubkey_hex: QUICKNET_PK_HEX.to_string(),
            chain_hash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
                .to_string(),
            genesis_time: 1692803367,
            period_seconds: 3,
        };
        let info = message_info(&admin, &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let admin = deps.api.addr_make("admin");
        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.admin, admin);
        assert_eq!(config.operators.len(), 1);
        assert_eq!(config.period_seconds, 3);
        assert_eq!(config.quicknet_pubkey.len(), 96);
    }

    #[test]
    fn test_submit_beacon_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let msg = ExecuteMsg::SubmitBeacon {
            round: 1000,
            signature_hex: "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39".to_string(),
        };
        let random_user = deps.api.addr_make("random_user");
        let info = message_info(&random_user, &[]);
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized { .. }));
    }

    #[test]
    fn test_submit_beacon_valid() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let msg = ExecuteMsg::SubmitBeacon {
            round: 1000,
            signature_hex: "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39".to_string(),
        };
        let operator1 = deps.api.addr_make("operator1");
        let info = message_info(&operator1, &[]);
        let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Check attributes
        assert_eq!(res.attributes[0].value, "submit_beacon");

        // Check stored beacon
        let beacon = BEACONS.load(deps.as_ref().storage, 1000).unwrap();
        assert!(beacon.verified);
        assert_eq!(
            hex::encode(&beacon.randomness),
            "fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd"
        );

        // Check latest round updated
        let latest = LATEST_ROUND.load(deps.as_ref().storage).unwrap();
        assert_eq!(latest, 1000);
    }

    #[test]
    fn test_submit_beacon_duplicate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let msg = ExecuteMsg::SubmitBeacon {
            round: 1000,
            signature_hex: "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39".to_string(),
        };
        let operator1 = deps.api.addr_make("operator1");
        let info = message_info(&operator1, &[]);
        execute(deps.as_mut(), mock_env(), info.clone(), msg.clone()).unwrap();

        // Second submission should fail
        let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert!(matches!(err, ContractError::BeaconAlreadyExists { round: 1000 }));
    }

    #[test]
    fn test_query_beacon() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Submit a beacon
        let msg = ExecuteMsg::SubmitBeacon {
            round: 1000,
            signature_hex: "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39".to_string(),
        };
        let operator1 = deps.api.addr_make("operator1");
        let info = message_info(&operator1, &[]);
        execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        // Query existing beacon
        let res = query(deps.as_ref(), mock_env(), QueryMsg::Beacon { round: 1000 }).unwrap();
        let beacon: Option<crate::state::StoredBeacon> = serde_json::from_slice(&res).unwrap();
        assert!(beacon.is_some());
        assert_eq!(beacon.unwrap().round, 1000);

        // Query non-existing beacon
        let res = query(deps.as_ref(), mock_env(), QueryMsg::Beacon { round: 9999 }).unwrap();
        let beacon: Option<crate::state::StoredBeacon> = serde_json::from_slice(&res).unwrap();
        assert!(beacon.is_none());
    }

    #[test]
    fn test_query_latest_round() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let res = query(deps.as_ref(), mock_env(), QueryMsg::LatestRound {}).unwrap();
        let round: u64 = serde_json::from_slice(&res).unwrap();
        assert_eq!(round, 0);

        // Submit beacon
        let msg = ExecuteMsg::SubmitBeacon {
            round: 500,
            signature_hex: "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39".to_string(),
        };
        // Note: This will fail BLS verification since round 500 != round 1000 for this sig.
        // For unit test purposes of latest_round tracking, we'd need a valid beacon.
        // We'll test latest_round update via the valid round 1000 beacon.
        let msg_valid = ExecuteMsg::SubmitBeacon {
            round: 1000,
            signature_hex: "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39".to_string(),
        };
        let operator1 = deps.api.addr_make("operator1");
        let info = message_info(&operator1, &[]);
        execute(deps.as_mut(), mock_env(), info, msg_valid).unwrap();

        let res = query(deps.as_ref(), mock_env(), QueryMsg::LatestRound {}).unwrap();
        let round: u64 = serde_json::from_slice(&res).unwrap();
        assert_eq!(round, 1000);

        // Verify wrong round fails
        let operator1 = deps.api.addr_make("operator1");
        let info2 = message_info(&operator1, &[]);
        let err = execute(deps.as_mut(), mock_env(), info2, msg).unwrap_err();
        assert!(matches!(err, ContractError::VerificationFailed { .. }));
    }
}
