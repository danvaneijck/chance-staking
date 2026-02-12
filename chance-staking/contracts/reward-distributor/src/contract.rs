use cosmwasm_std::{
    entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult, Uint128,
};
use cw2::{get_contract_version, set_contract_version};

use crate::error::ContractError;
use crate::execute;
use crate::msg::{
    CommitDrawParams, ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg, RevealDrawParams,
    UpdateConfigParams,
};
use crate::query;
use crate::state::{DistributorConfig, DrawStateInfo, CONFIG, DRAW_STATE};

const CONTRACT_NAME: &str = "crates.io:chance-reward-distributor";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    // V2-M-03 FIX: Validate reveal deadline bounds at instantiation
    execute::validate_reveal_deadline(msg.reveal_deadline_seconds)?;

    let config = DistributorConfig {
        admin: info.sender.clone(),
        operator: deps.api.addr_validate(&msg.operator)?,
        staking_hub: deps.api.addr_validate(&msg.staking_hub)?,
        drand_oracle: deps.api.addr_validate(&msg.drand_oracle)?,
        reveal_deadline_seconds: msg.reveal_deadline_seconds,
        epochs_between_regular: msg.epochs_between_regular,
        epochs_between_big: msg.epochs_between_big,
    };
    CONFIG.save(deps.storage, &config)?;

    let draw_state = DrawStateInfo {
        next_draw_id: 0,
        regular_pool_balance: Uint128::zero(),
        big_pool_balance: Uint128::zero(),
        total_draws_completed: 0,
        total_rewards_distributed: Uint128::zero(),
        last_regular_draw_epoch: None,
        last_big_draw_epoch: None,
    };
    DRAW_STATE.save(deps.storage, &draw_state)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("contract", "reward-distributor")
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
        ExecuteMsg::FundRegularPool {} => execute::fund_regular_pool(deps, env, info),
        ExecuteMsg::FundBigPool {} => execute::fund_big_pool(deps, env, info),
        ExecuteMsg::SetSnapshot {
            epoch,
            merkle_root,
            total_weight,
            num_holders,
        } => execute::set_snapshot(
            deps,
            env,
            info,
            epoch,
            merkle_root,
            total_weight,
            num_holders,
        ),
        ExecuteMsg::CommitDraw {
            draw_type,
            operator_commit,
            target_drand_round,
            epoch,
        } => execute::commit_draw(
            deps,
            env,
            info,
            CommitDrawParams {
                draw_type,
                operator_commit,
                target_drand_round,
                epoch,
            },
        ),
        ExecuteMsg::RevealDraw {
            draw_id,
            operator_secret_hex,
            winner_address,
            winner_cumulative_start,
            winner_cumulative_end,
            merkle_proof,
        } => execute::reveal_draw(
            deps,
            env,
            info,
            RevealDrawParams {
                draw_id,
                operator_secret_hex,
                winner_address,
                winner_cumulative_start,
                winner_cumulative_end,
                merkle_proof,
            },
        ),
        ExecuteMsg::ExpireDraw { draw_id } => execute::expire_draw(deps, env, info, draw_id),
        ExecuteMsg::UpdateConfig {
            operator,
            staking_hub,
            reveal_deadline_seconds,
            epochs_between_regular,
            epochs_between_big,
        } => execute::update_config(
            deps,
            env,
            info,
            UpdateConfigParams {
                operator,
                staking_hub,
                reveal_deadline_seconds,
                epochs_between_regular,
                epochs_between_big,
            },
        ),
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => query::query_config(deps),
        QueryMsg::DrawState {} => query::query_draw_state(deps),
        QueryMsg::Draw { draw_id } => query::query_draw(deps, draw_id),
        QueryMsg::DrawHistory { start_after, limit } => {
            query::query_draw_history(deps, start_after, limit)
        }
        QueryMsg::PoolBalances {} => query::query_pool_balances(deps),
        QueryMsg::UserWins {
            address,
            start_after,
            limit,
        } => query::query_user_wins(deps, address, start_after, limit),
        QueryMsg::UserWinDetails {
            address,
            start_after,
            limit,
        } => query::query_user_win_details(deps, address, start_after, limit),
        QueryMsg::VerifyInclusion {
            merkle_root,
            proof,
            leaf_address,
            cumulative_start,
            cumulative_end,
        } => query::query_verify_inclusion(
            deps,
            merkle_root,
            proof,
            leaf_address,
            cumulative_start,
            cumulative_end,
        ),
        QueryMsg::Snapshot { epoch } => query::query_snapshot(deps, epoch),
    }
}

// M-03 FIX: Add migrate entry point for contract upgradability
#[entry_point]
pub fn migrate(deps: DepsMut, _env: Env, _msg: MigrateMsg) -> Result<Response, ContractError> {
    let stored = get_contract_version(deps.storage)?;
    if stored.contract != CONTRACT_NAME {
        return Err(ContractError::Unauthorized {
            reason: "Cannot migrate from different contract type".to_string(),
        });
    }

    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(Response::new()
        .add_attribute("action", "migrate")
        .add_attribute("from_version", stored.version)
        .add_attribute("to_version", CONTRACT_VERSION))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chance_staking_common::types::{DrawStatus, DrawType};
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};
    use cosmwasm_std::{coins, Timestamp};
    use sha2::{Digest, Sha256};

    use crate::state::{DRAWS, DRAW_STATE};

    fn default_instantiate_msg() -> InstantiateMsg {
        let mock_api = MockApi::default();
        InstantiateMsg {
            operator: mock_api.addr_make("operator").to_string(),
            staking_hub: mock_api.addr_make("staking_hub").to_string(),
            drand_oracle: mock_api.addr_make("drand_oracle").to_string(),
            reveal_deadline_seconds: 3600,
            epochs_between_regular: 1,
            epochs_between_big: 7,
        }
    }

    fn setup_contract(deps: DepsMut) {
        let mock_api = MockApi::default();
        let msg = default_instantiate_msg();
        let admin = mock_api.addr_make("admin");
        let info = message_info(&admin, &[]);
        instantiate(deps, mock_env(), info, msg).unwrap();
    }

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let admin = deps.api.addr_make("admin");
        let operator = deps.api.addr_make("operator");
        let staking_hub = deps.api.addr_make("staking_hub");
        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.admin, admin);
        assert_eq!(config.operator, operator);
        assert_eq!(config.staking_hub, staking_hub);

        let state = DRAW_STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.next_draw_id, 0);
        assert_eq!(state.regular_pool_balance, Uint128::zero());
    }

    #[test]
    fn test_fund_regular_pool() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &coins(50_000_000, "inj"));
        let res = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::FundRegularPool {},
        )
        .unwrap();

        let state = DRAW_STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.regular_pool_balance, Uint128::from(50_000_000u128));
        assert!(res.events.iter().any(|e| e.ty == "chance_pool_funded"));
    }

    #[test]
    fn test_fund_pool_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let random = deps.api.addr_make("random");
        let info = message_info(&random, &coins(50_000_000, "inj"));
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::FundRegularPool {},
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized { .. }));
    }

    #[test]
    fn test_fund_big_pool() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &coins(100_000_000, "inj"));
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::FundBigPool {}).unwrap();

        let state = DRAW_STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.big_pool_balance, Uint128::from(100_000_000u128));
    }

    #[test]
    fn test_commit_draw_no_snapshot() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &coins(50_000_000, "inj"));
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::FundRegularPool {},
        )
        .unwrap();

        let secret = b"my_secret";
        let commit: [u8; 32] = Sha256::digest(secret).into();

        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::CommitDraw {
                draw_type: DrawType::Regular,
                operator_commit: hex::encode(commit),
                target_drand_round: 1000,
                epoch: 1,
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::NoSnapshot));
    }

    #[test]
    fn test_commit_draw() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Fund pool
        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &coins(50_000_000, "inj"));
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::FundRegularPool {},
        )
        .unwrap();

        // Set snapshot
        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetSnapshot {
                epoch: 1,
                merkle_root: "abcd1234".to_string(),
                total_weight: Uint128::from(1000u128),
                num_holders: 3,
            },
        )
        .unwrap();

        // Commit draw
        let secret = b"my_secret";
        let commit: [u8; 32] = Sha256::digest(secret).into();
        let commit_hex = hex::encode(commit);

        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::CommitDraw {
                draw_type: DrawType::Regular,
                operator_commit: commit_hex.clone(),
                target_drand_round: 1000,
                epoch: 1,
            },
        )
        .unwrap();

        let draw = DRAWS.load(deps.as_ref().storage, 0).unwrap();
        assert_eq!(draw.status, DrawStatus::Committed);
        assert_eq!(draw.operator_commit, commit_hex);
        // Reward = full pool balance
        assert_eq!(draw.reward_amount, Uint128::from(50_000_000u128));

        let state = DRAW_STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.regular_pool_balance, Uint128::zero());
        assert_eq!(state.next_draw_id, 1);
    }

    #[test]
    fn test_commit_draw_empty_pool() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Set snapshot but don't fund the pool
        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetSnapshot {
                epoch: 1,
                merkle_root: "abcd1234".to_string(),
                total_weight: Uint128::from(1000u128),
                num_holders: 3,
            },
        )
        .unwrap();

        let secret = b"my_secret";
        let commit: [u8; 32] = Sha256::digest(secret).into();

        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::CommitDraw {
                draw_type: DrawType::Regular,
                operator_commit: hex::encode(commit),
                target_drand_round: 1000,
                epoch: 1,
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::EmptyPool { .. }));
    }

    #[test]
    fn test_expire_draw() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &coins(50_000_000, "inj"));
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::FundRegularPool {},
        )
        .unwrap();

        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetSnapshot {
                epoch: 1,
                merkle_root: "abcd1234".to_string(),
                total_weight: Uint128::from(1000u128),
                num_holders: 3,
            },
        )
        .unwrap();

        let secret = b"my_secret";
        let commit: [u8; 32] = Sha256::digest(secret).into();
        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::CommitDraw {
                draw_type: DrawType::Regular,
                operator_commit: hex::encode(commit),
                target_drand_round: 1000,
                epoch: 1,
            },
        )
        .unwrap();

        // Too early
        let anyone = deps.api.addr_make("anyone");
        let info = message_info(&anyone, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::ExpireDraw { draw_id: 0 },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::DrawNotExpired { .. }));

        // Past deadline
        let mut env = mock_env();
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 7200);

        let anyone = deps.api.addr_make("anyone");
        let info = message_info(&anyone, &[]);
        execute(
            deps.as_mut(),
            env,
            info,
            ExecuteMsg::ExpireDraw { draw_id: 0 },
        )
        .unwrap();

        let draw = DRAWS.load(deps.as_ref().storage, 0).unwrap();
        assert_eq!(draw.status, DrawStatus::Expired);

        let state = DRAW_STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.regular_pool_balance, Uint128::from(50_000_000u128));
    }

    #[test]
    fn test_reveal_draw_bad_commit() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &coins(50_000_000, "inj"));
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::FundRegularPool {},
        )
        .unwrap();

        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetSnapshot {
                epoch: 1,
                merkle_root: "abcd1234".to_string(),
                total_weight: Uint128::from(1000u128),
                num_holders: 3,
            },
        )
        .unwrap();

        let secret = b"my_secret";
        let commit: [u8; 32] = Sha256::digest(secret).into();
        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::CommitDraw {
                draw_type: DrawType::Regular,
                operator_commit: hex::encode(commit),
                target_drand_round: 1000,
                epoch: 1,
            },
        )
        .unwrap();

        // Wrong secret
        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::RevealDraw {
                draw_id: 0,
                operator_secret_hex: hex::encode(b"wrong_secret"),
                winner_address: "inj1winner".to_string(),
                winner_cumulative_start: Uint128::zero(),
                winner_cumulative_end: Uint128::from(100u128),
                merkle_proof: vec![],
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::CommitMismatch));
    }

    #[test]
    fn test_reveal_draw_expired() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &coins(50_000_000, "inj"));
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::FundRegularPool {},
        )
        .unwrap();

        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::SetSnapshot {
                epoch: 1,
                merkle_root: "abcd1234".to_string(),
                total_weight: Uint128::from(1000u128),
                num_holders: 3,
            },
        )
        .unwrap();

        let secret = b"my_secret";
        let commit: [u8; 32] = Sha256::digest(secret).into();
        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::CommitDraw {
                draw_type: DrawType::Regular,
                operator_commit: hex::encode(commit),
                target_drand_round: 1000,
                epoch: 1,
            },
        )
        .unwrap();

        let mut env = mock_env();
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 7200);

        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        let err = execute(
            deps.as_mut(),
            env,
            info,
            ExecuteMsg::RevealDraw {
                draw_id: 0,
                operator_secret_hex: hex::encode(secret),
                winner_address: "inj1winner".to_string(),
                winner_cumulative_start: Uint128::zero(),
                winner_cumulative_end: Uint128::from(100u128),
                merkle_proof: vec![],
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::DrawExpired { .. }));
    }

    // ── Audit V2 tests ──

    #[test]
    fn test_update_config() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let admin = deps.api.addr_make("admin");
        let new_operator = deps.api.addr_make("new_operator");
        let new_hub = deps.api.addr_make("new_hub");

        // Non-admin cannot update config
        let random = deps.api.addr_make("random");
        let info = message_info(&random, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::UpdateConfig {
                operator: Some(new_operator.to_string()),
                staking_hub: None,
                reveal_deadline_seconds: None,
                epochs_between_regular: None,
                epochs_between_big: None,
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized { .. }));

        // Admin can update operator and staking_hub
        let info = message_info(&admin, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::UpdateConfig {
                operator: Some(new_operator.to_string()),
                staking_hub: Some(new_hub.to_string()),
                reveal_deadline_seconds: Some(7200),
                epochs_between_regular: Some(2),
                epochs_between_big: Some(14),
            },
        )
        .unwrap();

        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.operator, new_operator);
        assert_eq!(config.staking_hub, new_hub);
        assert_eq!(config.reveal_deadline_seconds, 7200);
        assert_eq!(config.epochs_between_regular, 2);
        assert_eq!(config.epochs_between_big, 14);
    }

    #[test]
    fn test_reveal_deadline_bounds() {
        // V2-M-03: Verify reveal_deadline_seconds bounds are enforced
        let mut deps = mock_dependencies();

        // Instantiate with too-low deadline should fail
        let mock_api = MockApi::default();
        let admin = mock_api.addr_make("admin");
        let msg = InstantiateMsg {
            operator: mock_api.addr_make("operator").to_string(),
            staking_hub: mock_api.addr_make("staking_hub").to_string(),
            drand_oracle: mock_api.addr_make("drand_oracle").to_string(),
            reveal_deadline_seconds: 10, // Too low (min 300)
            epochs_between_regular: 1,
            epochs_between_big: 7,
        };
        let info = message_info(&admin, &[]);
        let err = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert!(
            format!("{:?}", err).contains("InvalidRevealDeadline"),
            "Expected InvalidRevealDeadline, got: {:?}",
            err
        );

        // Instantiate with too-high deadline should fail
        let msg = InstantiateMsg {
            operator: mock_api.addr_make("operator").to_string(),
            staking_hub: mock_api.addr_make("staking_hub").to_string(),
            drand_oracle: mock_api.addr_make("drand_oracle").to_string(),
            reveal_deadline_seconds: 100_000, // Too high (max 86400)
            epochs_between_regular: 1,
            epochs_between_big: 7,
        };
        let admin = mock_api.addr_make("admin");
        let info = message_info(&admin, &[]);
        let err = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert!(
            format!("{:?}", err).contains("InvalidRevealDeadline"),
            "Expected InvalidRevealDeadline, got: {:?}",
            err
        );

        // Valid instantiation
        setup_contract(deps.as_mut());

        // Update config with invalid deadline should fail
        let admin = deps.api.addr_make("admin");
        let info = message_info(&admin, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::UpdateConfig {
                operator: None,
                staking_hub: None,
                reveal_deadline_seconds: Some(0),
                epochs_between_regular: None,
                epochs_between_big: None,
            },
        )
        .unwrap_err();
        assert!(
            format!("{:?}", err).contains("InvalidRevealDeadline"),
            "Expected InvalidRevealDeadline for zero deadline, got: {:?}",
            err
        );
    }
}
