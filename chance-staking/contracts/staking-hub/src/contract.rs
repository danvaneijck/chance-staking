use cosmwasm_std::{
    entry_point, Binary, Decimal, Deps, DepsMut, Env, MessageInfo, StdResult, Uint128,
};
use cw2::set_contract_version;
use injective_cosmwasm::InjectiveMsgWrapper;

use crate::error::ContractError;
use crate::execute;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::query;
use crate::state::{
    Config, EpochState, CONFIG, EPOCH_STATE, EXCHANGE_RATE, PENDING_UNSTAKE_TOTAL,
    TOTAL_CSINJ_SUPPLY, TOTAL_INJ_BACKING,
};

const CONTRACT_NAME: &str = "crates.io:chance-staking-hub";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

type ContractResponse = cosmwasm_std::Response<InjectiveMsgWrapper>;

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<ContractResponse, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    // Validate bps sum
    let total_bps =
        msg.regular_pool_bps + msg.big_pool_bps + msg.base_yield_bps + msg.protocol_fee_bps;
    if total_bps != 10000 {
        return Err(ContractError::BpsSumMismatch {
            regular: msg.regular_pool_bps,
            big: msg.big_pool_bps,
            base_yield: msg.base_yield_bps,
            fee: msg.protocol_fee_bps,
            total: total_bps,
        });
    }

    // Create Token Factory denom
    let (create_denom_msg, full_denom) = execute::create_denom(&env, &msg.csinj_subdenom)?;

    let config = Config {
        admin: info.sender.clone(),
        operator: deps.api.addr_validate(&msg.operator)?,
        reward_distributor: deps.api.addr_validate(&msg.reward_distributor)?,
        drand_oracle: deps.api.addr_validate(&msg.drand_oracle)?,
        csinj_denom: full_denom.clone(),
        validators: msg.validators,
        epoch_duration_seconds: msg.epoch_duration_seconds,
        protocol_fee_bps: msg.protocol_fee_bps,
        treasury: deps.api.addr_validate(&msg.treasury)?,
        base_yield_bps: msg.base_yield_bps,
        regular_pool_bps: msg.regular_pool_bps,
        big_pool_bps: msg.big_pool_bps,
        min_epochs_regular: msg.min_epochs_regular,
        min_epochs_big: msg.min_epochs_big,
    };

    CONFIG.save(deps.storage, &config)?;

    // Initialize exchange rate to 1:1
    EXCHANGE_RATE.save(deps.storage, &Decimal::one())?;
    TOTAL_INJ_BACKING.save(deps.storage, &Uint128::zero())?;
    TOTAL_CSINJ_SUPPLY.save(deps.storage, &Uint128::zero())?;
    PENDING_UNSTAKE_TOTAL.save(deps.storage, &Uint128::zero())?;

    // Initialize epoch state
    let epoch_state = EpochState {
        current_epoch: 1,
        epoch_start_time: env.block.time,
        total_staked: Uint128::zero(),
        snapshot_merkle_root: None,
        snapshot_finalized: false,
        snapshot_total_weight: Uint128::zero(),
        snapshot_num_holders: 0,
        snapshot_uri: None,
    };
    EPOCH_STATE.save(deps.storage, &epoch_state)?;

    Ok(ContractResponse::new()
        .add_message(create_denom_msg)
        .add_attribute("action", "instantiate")
        .add_attribute("contract", "staking-hub")
        .add_attribute("csinj_denom", full_denom)
        .add_attribute("admin", info.sender.to_string()))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<ContractResponse, ContractError> {
    match msg {
        ExecuteMsg::Stake {} => execute::stake(deps, env, info),
        ExecuteMsg::Unstake {} => execute::unstake(deps, env, info),
        ExecuteMsg::ClaimUnstaked { request_ids } => {
            execute::claim_unstaked(deps, env, info, request_ids)
        }
        ExecuteMsg::ClaimRewards {} => execute::claim_rewards(deps, env, info),
        ExecuteMsg::DistributeRewards {} => execute::distribute_rewards(deps, env, info),
        ExecuteMsg::TakeSnapshot {
            merkle_root,
            total_weight,
            num_holders,
            snapshot_uri,
        } => execute::take_snapshot(
            deps,
            env,
            info,
            merkle_root,
            total_weight,
            num_holders,
            snapshot_uri,
        ),
        ExecuteMsg::UpdateConfig {
            admin,
            operator,
            protocol_fee_bps,
            min_epochs_regular,
            min_epochs_big,
        } => execute::update_config(
            deps,
            env,
            info,
            admin,
            operator,
            protocol_fee_bps,
            min_epochs_regular,
            min_epochs_big,
        ),
        ExecuteMsg::UpdateValidators { add, remove } => {
            execute::update_validators(deps, env, info, add, remove)
        }
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => query::query_config(deps),
        QueryMsg::EpochState {} => query::query_epoch_state(deps),
        QueryMsg::ExchangeRate {} => query::query_exchange_rate(deps),
        QueryMsg::UnstakeRequests {
            address,
            start_after,
            limit,
        } => query::query_unstake_requests(deps, address, start_after, limit),
        QueryMsg::StakerInfo { address } => query::query_staker_info(deps, address),
    }
}

#[cfg(test)]
mod tests {
    use crate::state::UNSTAKE_REQUESTS;

    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};
    use cosmwasm_std::{coins, Coin, Timestamp};

    fn default_instantiate_msg() -> InstantiateMsg {
        let mock_api = MockApi::default();
        InstantiateMsg {
            operator: mock_api.addr_make("operator").to_string(),
            reward_distributor: mock_api.addr_make("distributor").to_string(),
            drand_oracle: mock_api.addr_make("oracle").to_string(),
            validators: vec!["val1".to_string(), "val2".to_string()],
            epoch_duration_seconds: 86400,
            protocol_fee_bps: 500,
            treasury: mock_api.addr_make("treasury").to_string(),
            base_yield_bps: 500,
            regular_pool_bps: 7000,
            big_pool_bps: 2000,
            csinj_subdenom: "csINJ".to_string(),
            min_epochs_regular: 0,
            min_epochs_big: 0,
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
        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.admin, admin);
        assert_eq!(config.operator, operator);
        assert!(config.csinj_denom.contains("csINJ"));
        assert_eq!(config.validators.len(), 2);

        let rate = EXCHANGE_RATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(rate, Decimal::one());

        let epoch = EPOCH_STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(epoch.current_epoch, 1);
        assert!(!epoch.snapshot_finalized);
    }

    #[test]
    fn test_instantiate_invalid_bps() {
        let mut deps = mock_dependencies();
        let mut msg = default_instantiate_msg();
        msg.regular_pool_bps = 8000; // Sum would be 11000
        let admin = deps.api.addr_make("admin");
        let info = message_info(&admin, &[]);
        let err = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert!(matches!(err, ContractError::BpsSumMismatch { .. }));
    }

    #[test]
    fn test_stake() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &coins(100_000_000, "inj"));
        let res = execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Stake {}).unwrap();

        // Should have mint message + delegation messages
        assert!(res.messages.len() >= 2); // 1 mint + 2 delegations

        // Check totals updated
        let backing = TOTAL_INJ_BACKING.load(deps.as_ref().storage).unwrap();
        assert_eq!(backing, Uint128::from(100_000_000u128));

        let supply = TOTAL_CSINJ_SUPPLY.load(deps.as_ref().storage).unwrap();
        assert_eq!(supply, Uint128::from(100_000_000u128)); // Rate is 1:1

        // Check event emitted
        assert!(res.events.iter().any(|e| e.ty == "chance_stake"));
    }

    #[test]
    fn test_stake_no_funds() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &[]);
        let err = execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Stake {}).unwrap_err();
        assert!(matches!(err, ContractError::NoFundsSent));
    }

    #[test]
    fn test_stake_wrong_denom() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &coins(100, "usdt"));
        let err = execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Stake {}).unwrap_err();
        assert!(matches!(err, ContractError::WrongDenom { .. }));
    }

    #[test]
    fn test_stake_with_exchange_rate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // First stake at rate 1.0
        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &coins(100_000_000, "inj"));
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Stake {}).unwrap();

        // Manually increase exchange rate to 2.0
        EXCHANGE_RATE
            .save(deps.as_mut().storage, &Decimal::from_ratio(2u128, 1u128))
            .unwrap();

        // Second stake at rate 2.0 — should get half the csINJ
        let user2 = deps.api.addr_make("user2");
        let info2 = message_info(&user2, &coins(100_000_000, "inj"));
        execute(deps.as_mut(), mock_env(), info2, ExecuteMsg::Stake {}).unwrap();

        let supply = TOTAL_CSINJ_SUPPLY.load(deps.as_ref().storage).unwrap();
        // user1 got 100M csINJ, user2 got 50M csINJ = 150M total
        assert_eq!(supply, Uint128::from(150_000_000u128));
    }

    #[test]
    fn test_unstake() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // First stake
        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &coins(100_000_000, "inj"));
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Stake {}).unwrap();

        // Get the csINJ denom
        let config = CONFIG.load(deps.as_ref().storage).unwrap();

        // Unstake half
        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &[Coin::new(50_000_000u128, &config.csinj_denom)]);
        let res = execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Unstake {}).unwrap();

        // Should have burn message + undelegation messages
        assert!(res.messages.len() >= 2);

        // Check totals
        let backing = TOTAL_INJ_BACKING.load(deps.as_ref().storage).unwrap();
        assert_eq!(backing, Uint128::from(50_000_000u128));

        let supply = TOTAL_CSINJ_SUPPLY.load(deps.as_ref().storage).unwrap();
        assert_eq!(supply, Uint128::from(50_000_000u128));

        // Check unstake request created
        let addr = deps.api.addr_make("user1");
        let request = UNSTAKE_REQUESTS
            .load(deps.as_ref().storage, (&addr, 0))
            .unwrap();
        assert_eq!(request.inj_amount, Uint128::from(50_000_000u128));
        assert!(!request.claimed);
    }

    #[test]
    fn test_claim_unstaked_before_unlock() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Stake
        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &coins(100_000_000, "inj"));
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Stake {}).unwrap();

        let config = CONFIG.load(deps.as_ref().storage).unwrap();

        // Unstake
        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &[Coin::new(50_000_000u128, &config.csinj_denom)]);
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Unstake {}).unwrap();

        // Try to claim immediately — should fail
        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::ClaimUnstaked {
                request_ids: vec![0],
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::UnstakeNotUnlocked { .. }));
    }

    #[test]
    fn test_claim_unstaked_after_unlock() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Stake
        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &coins(100_000_000, "inj"));
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Stake {}).unwrap();

        let config = CONFIG.load(deps.as_ref().storage).unwrap();

        // Unstake
        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &[Coin::new(50_000_000u128, &config.csinj_denom)]);
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Unstake {}).unwrap();

        // Fast forward past 21 days
        let mut env = mock_env();
        env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 22 * 24 * 60 * 60);

        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &[]);
        let res = execute(
            deps.as_mut(),
            env,
            info,
            ExecuteMsg::ClaimUnstaked {
                request_ids: vec![0],
            },
        )
        .unwrap();

        // Should have a bank send message
        assert_eq!(res.messages.len(), 1);

        // Check request marked as claimed
        let addr = deps.api.addr_make("user1");
        let request = UNSTAKE_REQUESTS
            .load(deps.as_ref().storage, (&addr, 0))
            .unwrap();
        assert!(request.claimed);
    }

    #[test]
    fn test_claim_rewards_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let random_user = deps.api.addr_make("random_user");
        let info = message_info(&random_user, &[]);
        let err =
            execute(deps.as_mut(), mock_env(), info, ExecuteMsg::ClaimRewards {}).unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized { .. }));
    }

    #[test]
    fn test_claim_rewards() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        let res = execute(deps.as_mut(), mock_env(), info, ExecuteMsg::ClaimRewards {}).unwrap();

        // Should have: 1 SetWithdrawAddress + 2 WithdrawDelegatorReward (one per validator)
        assert_eq!(res.messages.len(), 3);

        // Check event
        assert!(res.events.iter().any(|e| e.ty == "chance_rewards_claimed"));
    }

    #[test]
    fn test_distribute_rewards() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Stake first so there's backing
        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &coins(1_000_000_000, "inj"));
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Stake {}).unwrap();

        // Simulate rewards arriving in contract balance (100M INJ rewards)
        let env = mock_env();
        let contract_addr = env.contract.address.clone();
        deps.querier
            .bank
            .update_balance(contract_addr, coins(100_000_000, "inj"));

        // Distribute rewards (step 2)
        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        let res = execute(deps.as_mut(), env, info, ExecuteMsg::DistributeRewards {}).unwrap();

        // Should have messages: fund regular pool, fund big pool, treasury send
        assert!(res.messages.len() >= 3);

        // Check epoch advanced
        let epoch = EPOCH_STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(epoch.current_epoch, 2);
        assert!(!epoch.snapshot_finalized);

        // Check exchange rate increased (base yield = 5% of 100M = 5M added to 1B backing)
        let rate = EXCHANGE_RATE.load(deps.as_ref().storage).unwrap();
        assert!(rate > Decimal::one());

        // Check event
        assert!(res.events.iter().any(|e| e.ty == "chance_epoch_advanced"));
    }

    #[test]
    fn test_distribute_rewards_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let random_user = deps.api.addr_make("random_user");
        let info = message_info(&random_user, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::DistributeRewards {},
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized { .. }));
    }

    #[test]
    fn test_take_snapshot() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        let res = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::TakeSnapshot {
                merkle_root: "abcd1234".to_string(),
                total_weight: Uint128::from(1000u128),
                num_holders: 5,
                snapshot_uri: "ipfs://snapshot".to_string(),
            },
        )
        .unwrap();

        let epoch = EPOCH_STATE.load(deps.as_ref().storage).unwrap();
        assert!(epoch.snapshot_finalized);
        assert_eq!(epoch.snapshot_merkle_root, Some("abcd1234".to_string()));
        assert_eq!(epoch.snapshot_total_weight, Uint128::from(1000u128));
        assert_eq!(epoch.snapshot_num_holders, 5);

        // Should have forwarded to distributor
        assert_eq!(res.messages.len(), 1);
    }

    #[test]
    fn test_take_snapshot_duplicate() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info.clone(),
            ExecuteMsg::TakeSnapshot {
                merkle_root: "abcd1234".to_string(),
                total_weight: Uint128::from(1000u128),
                num_holders: 5,
                snapshot_uri: "ipfs://snapshot".to_string(),
            },
        )
        .unwrap();

        // Second snapshot should fail
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::TakeSnapshot {
                merkle_root: "efgh5678".to_string(),
                total_weight: Uint128::from(2000u128),
                num_holders: 10,
                snapshot_uri: "ipfs://snapshot2".to_string(),
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::SnapshotAlreadyTaken));
    }

    #[test]
    fn test_update_validators() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let admin = deps.api.addr_make("admin");
        let info = message_info(&admin, &[]);
        execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::UpdateValidators {
                add: vec!["val3".to_string()],
                remove: vec!["val1".to_string()],
            },
        )
        .unwrap();

        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(
            config.validators,
            vec!["val2".to_string(), "val3".to_string()]
        );
    }

    #[test]
    fn test_update_validators_unauthorized() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let random = deps.api.addr_make("random");
        let info = message_info(&random, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::UpdateValidators {
                add: vec!["val3".to_string()],
                remove: vec![],
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized { .. }));
    }

    #[test]
    fn test_update_validators_with_redelegation() {
        use cosmwasm_std::FullDelegation;

        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let env = mock_env();

        // Mock a delegation of 1000 INJ to val1
        let delegation = FullDelegation::create(
            env.contract.address.clone(),
            "val1".to_string(),
            Coin::new(1_000_000u128, "inj"),
            Coin::new(1_000_000u128, "inj"),
            vec![],
        );
        deps.querier.staking.update("inj", &[], &[delegation]);

        let admin = deps.api.addr_make("admin");
        let info = message_info(&admin, &[]);
        let res = execute(
            deps.as_mut(),
            env,
            info,
            ExecuteMsg::UpdateValidators {
                add: vec!["val3".to_string()],
                remove: vec!["val1".to_string()],
            },
        )
        .unwrap();

        // Should have redelegation messages from val1 to val2 and val3
        assert!(res.messages.len() >= 2);

        // Check validators updated
        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(
            config.validators,
            vec!["val2".to_string(), "val3".to_string()]
        );

        // Check event
        assert!(res
            .events
            .iter()
            .any(|e| e.ty == "chance_validators_updated"));
    }

    #[test]
    fn test_update_validators_remove_all_fails() {
        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let admin = deps.api.addr_make("admin");
        let info = message_info(&admin, &[]);
        let err = execute(
            deps.as_mut(),
            mock_env(),
            info,
            ExecuteMsg::UpdateValidators {
                add: vec![],
                remove: vec!["val1".to_string(), "val2".to_string()],
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::NoValidators));
    }

    #[test]
    fn test_stake_records_epoch() {
        use crate::state::USER_STAKE_EPOCH;

        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &coins(100_000_000, "inj"));
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Stake {}).unwrap();

        // Verify stake epoch recorded
        let addr = deps.api.addr_make("user1");
        let stake_epoch = USER_STAKE_EPOCH.load(deps.as_ref().storage, &addr).unwrap();
        assert_eq!(stake_epoch, 1); // epoch starts at 1

        // Second stake should not overwrite
        let user1 = deps.api.addr_make("user1");
        let info = message_info(&user1, &coins(50_000_000, "inj"));
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Stake {}).unwrap();

        let addr = deps.api.addr_make("user1");
        let stake_epoch = USER_STAKE_EPOCH.load(deps.as_ref().storage, &addr).unwrap();
        assert_eq!(stake_epoch, 1); // still epoch 1
    }

    #[test]
    fn test_staker_info_query() {
        use crate::msg::StakerInfoResponse;
        use cosmwasm_std::from_json;

        let mut deps = mock_dependencies();
        setup_contract(deps.as_mut());

        // Query before staking — should return None
        let user1 = deps.api.addr_make("user1");
        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::StakerInfo {
                address: user1.to_string(),
            },
        )
        .unwrap();
        let info: StakerInfoResponse = from_json(res).unwrap();
        assert_eq!(info.stake_epoch, None);

        // Stake
        let user1 = deps.api.addr_make("user1");
        let msg_info = message_info(&user1, &coins(100_000_000, "inj"));
        execute(deps.as_mut(), mock_env(), msg_info, ExecuteMsg::Stake {}).unwrap();

        // Query after staking — should return epoch 1
        let res = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::StakerInfo {
                address: user1.to_string(),
            },
        )
        .unwrap();
        let info: StakerInfoResponse = from_json(res).unwrap();
        assert_eq!(info.stake_epoch, Some(1));
    }

    #[test]
    fn test_min_epochs_in_config() {
        let mut deps = mock_dependencies();
        let mut msg = default_instantiate_msg();
        msg.min_epochs_regular = 3;
        msg.min_epochs_big = 7;
        let admin = deps.api.addr_make("admin");
        let info = message_info(&admin, &[]);
        instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();

        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.min_epochs_regular, 3);
        assert_eq!(config.min_epochs_big, 7);
    }
}
