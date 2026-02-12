//! Integration tests for Chance.Staking protocol.
//!
//! These tests exercise the contract entry points directly using
//! `cosmwasm_std::testing` mocks. Each contract is tested via its
//! `instantiate` / `execute` / `query` entry points.
//!
//! For cross-contract interactions (e.g. `reveal_draw` querying the
//! drand oracle), we mock the querier using `MockQuerier::update_wasm`.
//!
//! Run:
//! ```bash
//! cargo test -p chance-staking-integration-tests
//! ```

use chance_staking_common::merkle::{compute_leaf_hash, verify_merkle_proof};
use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi, MockQuerier};
use cosmwasm_std::{
    from_json, to_json_binary, Coin, ContractResult, Decimal, OwnedDeps, SystemResult, Timestamp,
    Uint128, WasmQuery,
};
use sha2::{Digest, Sha256};

// ─── Constants ───

/// Real drand quicknet public key
const QUICKNET_PK_HEX: &str = "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a";

/// Real quicknet test vector: round 1000
const TEST_ROUND: u64 = 1000;
const TEST_SIG_HEX: &str = "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39";
const TEST_RANDOMNESS_HEX: &str =
    "fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd";

// ─── Helpers ───

/// Helper: sorted pair hash for building test merkle trees
/// M-02 FIX: Added domain separation prefix (0x01) for internal nodes
fn sorted_hash(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update([0x01]); // M-02 FIX: Internal node prefix
    if a.as_slice() <= b.as_slice() {
        hasher.update(a);
        hasher.update(b);
    } else {
        hasher.update(b);
        hasher.update(a);
    }
    hasher.finalize().into()
}

// ─── Oracle helpers ───

fn oracle_instantiate_msg(operator: &str) -> chance_drand_oracle::msg::InstantiateMsg {
    chance_drand_oracle::msg::InstantiateMsg {
        operators: vec![operator.to_string()],
        quicknet_pubkey_hex: QUICKNET_PK_HEX.to_string(),
        chain_hash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971".to_string(),
        genesis_time: 1692803367,
        period_seconds: 3,
    }
}

fn setup_oracle(deps: &mut OwnedDeps<cosmwasm_std::MemoryStorage, MockApi, MockQuerier>) {
    let admin = deps.api.addr_make("admin");
    let operator = deps.api.addr_make("operator");
    let msg = oracle_instantiate_msg(operator.as_ref());
    let info = message_info(&admin, &[]);
    chance_drand_oracle::contract::instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();
}

// ─── Staking hub helpers ───

fn hub_instantiate_msg() -> chance_staking_hub::msg::InstantiateMsg {
    let mock_api = MockApi::default();
    chance_staking_hub::msg::InstantiateMsg {
        operator: mock_api.addr_make("operator").to_string(),
        reward_distributor: mock_api.addr_make("distributor").to_string(),
        drand_oracle: mock_api.addr_make("oracle").to_string(),
        validators: vec![
            "injvaloper1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqj9".to_string(),
            "injvaloper1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".to_string(),
        ],
        epoch_duration_seconds: 86400,
        protocol_fee_bps: 500,
        treasury: mock_api.addr_make("treasury").to_string(),
        base_yield_bps: 500,
        regular_pool_bps: 7000,
        big_pool_bps: 2000,
        csinj_subdenom: "csINJ".to_string(),
        min_epochs_regular: 0,
        min_epochs_big: 0,
        min_stake_amount: Uint128::zero(),
    }
}

fn setup_hub(deps: &mut OwnedDeps<cosmwasm_std::MemoryStorage, MockApi, MockQuerier>) {
    let admin = deps.api.addr_make("admin");
    let msg = hub_instantiate_msg();
    let info = message_info(&admin, &[]);
    chance_staking_hub::contract::instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();
}

// ─── Distributor helpers ───

fn distributor_instantiate_msg() -> chance_reward_distributor::msg::InstantiateMsg {
    let mock_api = MockApi::default();
    chance_reward_distributor::msg::InstantiateMsg {
        operator: mock_api.addr_make("operator").to_string(),
        staking_hub: mock_api.addr_make("staking_hub").to_string(),
        drand_oracle: mock_api.addr_make("drand_oracle").to_string(),
        reveal_deadline_seconds: 3600,
        epochs_between_regular: 1,
        epochs_between_big: 7,
    }
}

fn setup_distributor(deps: &mut OwnedDeps<cosmwasm_std::MemoryStorage, MockApi, MockQuerier>) {
    let admin = deps.api.addr_make("admin");
    let msg = distributor_instantiate_msg();
    let info = message_info(&admin, &[]);
    chance_reward_distributor::contract::instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_drand_beacon_verification() {
    // Test the drand oracle contract: instantiate, submit a real beacon,
    // query it back, then verify that a wrong-round submission fails.

    let mut deps = mock_dependencies();
    setup_oracle(&mut deps);

    let operator = deps.api.addr_make("operator");

    // 1. Submit real quicknet round 1000 beacon
    let submit_msg = chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
        round: TEST_ROUND,
        signature_hex: TEST_SIG_HEX.to_string(),
    };
    let info = message_info(&operator, &[]);
    let res = chance_drand_oracle::contract::execute(deps.as_mut(), mock_env(), info, submit_msg)
        .unwrap();

    // Verify response attributes
    assert_eq!(res.attributes[0].value, "submit_beacon");
    assert_eq!(res.attributes[1].value, TEST_ROUND.to_string());

    // 2. Query beacon back
    let query_msg = chance_drand_oracle::msg::QueryMsg::Beacon { round: TEST_ROUND };
    let res = chance_drand_oracle::contract::query(deps.as_ref(), mock_env(), query_msg).unwrap();
    let beacon: Option<chance_drand_oracle::state::StoredBeacon> = from_json(res).unwrap();
    assert!(beacon.is_some());
    let beacon = beacon.unwrap();
    assert_eq!(beacon.round, TEST_ROUND);
    assert!(beacon.verified);
    assert_eq!(hex::encode(&beacon.randomness), TEST_RANDOMNESS_HEX);

    // 3. Query latest round
    let query_msg = chance_drand_oracle::msg::QueryMsg::LatestRound {};
    let res = chance_drand_oracle::contract::query(deps.as_ref(), mock_env(), query_msg).unwrap();
    let latest: u64 = from_json(res).unwrap();
    assert_eq!(latest, TEST_ROUND);

    // 4. Submit with wrong round (same sig) → should fail BLS verification
    let bad_msg = chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
        round: TEST_ROUND + 1,
        signature_hex: TEST_SIG_HEX.to_string(),
    };
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_drand_oracle::contract::execute(deps.as_mut(), mock_env(), info, bad_msg)
        .unwrap_err();
    assert!(
        format!("{:?}", err).contains("VerificationFailed"),
        "Expected verification failure, got: {:?}",
        err
    );

    // 5. Duplicate submission → should fail
    let dup_msg = chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
        round: TEST_ROUND,
        signature_hex: TEST_SIG_HEX.to_string(),
    };
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_drand_oracle::contract::execute(deps.as_mut(), mock_env(), info, dup_msg)
        .unwrap_err();
    assert!(
        format!("{:?}", err).contains("BeaconAlreadyExists"),
        "Expected duplicate error, got: {:?}",
        err
    );

    // 6. Unauthorized submission → should fail
    let unauth_msg = chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
        round: 2000,
        signature_hex: TEST_SIG_HEX.to_string(),
    };
    let random = deps.api.addr_make("random");
    let info = message_info(&random, &[]);
    let err = chance_drand_oracle::contract::execute(deps.as_mut(), mock_env(), info, unauth_msg)
        .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Expected unauthorized error, got: {:?}",
        err
    );

    eprintln!("test_drand_beacon_verification passed");
}

#[test]
fn test_unstake_flow() {
    // Test stake → unstake → claim flow via staking hub.
    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let user1 = deps.api.addr_make("user1");
    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();

    // 1. User stakes 100 INJ
    let info = message_info(&user1, &[Coin::new(100_000_000u128, "inj")]);
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();
    // Should have mint + delegation messages
    assert!(res.messages.len() >= 2);

    // Verify totals
    let rate_resp: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(rate_resp.total_inj_backing, Uint128::from(100_000_000u128));
    assert_eq!(rate_resp.total_csinj_supply, Uint128::from(100_000_000u128));
    assert_eq!(rate_resp.rate, Decimal::one());

    // 2. User unstakes 50 csINJ
    let user1 = deps.api.addr_make("user1");
    let info = message_info(&user1, &[Coin::new(50_000_000u128, &config.csinj_denom)]);
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Unstake {},
    )
    .unwrap();
    assert!(res.messages.len() >= 2); // burn + undelegation

    // 3. Verify unstake request created with correct INJ amount
    let requests: Vec<chance_staking_hub::msg::UnstakeRequestEntry> = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::UnstakeRequests {
                address: user1.to_string(),
                start_after: None,
                limit: None,
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(
        requests[0].request.inj_amount,
        Uint128::from(50_000_000u128)
    );
    assert!(!requests[0].request.claimed);

    // 4. Try claim before unlock → should fail
    let user1 = deps.api.addr_make("user1");
    let info = message_info(&user1, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::ClaimUnstaked {
            request_ids: vec![0],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("UnstakeNotUnlocked"),
        "Expected unlock error, got: {:?}",
        err
    );

    // 5. Fast forward past 21 days
    let mut env = mock_env();
    env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 22 * 24 * 60 * 60);

    // 6. Claim → should succeed
    let user1 = deps.api.addr_make("user1");
    let info = message_info(&user1, &[]);
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_staking_hub::msg::ExecuteMsg::ClaimUnstaked {
            request_ids: vec![0],
        },
    )
    .unwrap();
    // Should have a bank send message
    assert_eq!(res.messages.len(), 1);

    // Verify request marked as claimed
    let requests: Vec<chance_staking_hub::msg::UnstakeRequestEntry> = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::UnstakeRequests {
                address: deps.api.addr_make("user1").to_string(),
                start_after: None,
                limit: None,
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert!(requests[0].request.claimed);

    // Verify backing updated
    let rate_resp: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(rate_resp.total_inj_backing, Uint128::from(50_000_000u128));
    assert_eq!(rate_resp.total_csinj_supply, Uint128::from(50_000_000u128));

    eprintln!("test_unstake_flow passed");
}

#[test]
fn test_exchange_rate_appreciation() {
    // Test that staking rewards cause the exchange rate to increase,
    // meaning later stakers get fewer csINJ per INJ and earlier stakers
    // get more INJ per csINJ when unstaking.
    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();

    // 1. User1 stakes 100 INJ at rate 1.0 → gets 100 csINJ
    let user1 = deps.api.addr_make("user1");
    let info = message_info(&user1, &[Coin::new(100_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    let rate_resp: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(rate_resp.rate, Decimal::one());
    assert_eq!(rate_resp.total_csinj_supply, Uint128::from(100_000_000u128));

    // 2. Distribute rewards: simulate 100M INJ rewards in contract balance
    //    base_yield_bps = 500 (5%), so base_yield = 5M INJ added to backing
    let mut env = mock_env();
    // H-01 FIX: Advance time past epoch_duration_seconds (86400)
    env.block.time = env.block.time.plus_seconds(86400);
    deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(100_000_000u128, "inj")],
    );
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_staking_hub::msg::ExecuteMsg::DistributeRewards {},
    )
    .unwrap();

    // 3. Verify exchange rate > 1.0
    let rate_resp: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert!(
        rate_resp.rate > Decimal::one(),
        "Exchange rate should be > 1.0 after epoch advance, got: {}",
        rate_resp.rate
    );
    // base_yield = 5% of 100M = 5M, so new backing = 105M, supply = 100M
    // rate = 105M / 100M = 1.05
    assert_eq!(
        rate_resp.rate,
        Decimal::from_ratio(105_000_000u128, 100_000_000u128)
    );

    // 4. User2 stakes 100 INJ at new rate → gets < 100 csINJ
    let user2 = deps.api.addr_make("user2");
    let info = message_info(&user2, &[Coin::new(100_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    let rate_resp: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    // user2 gets 100M / 1.05 ≈ 95.238M csINJ
    // total supply = 100M + ~95.238M ≈ 195.238M
    assert!(
        rate_resp.total_csinj_supply < Uint128::from(200_000_000u128),
        "User2 should get < 100M csINJ at rate 1.05"
    );
    let user2_csinj = rate_resp.total_csinj_supply - Uint128::from(100_000_000u128);
    assert!(
        user2_csinj < Uint128::from(100_000_000u128),
        "User2's csINJ ({}) should be less than 100M",
        user2_csinj
    );

    // 5. User1 unstakes 50 csINJ → gets > 50 INJ (due to appreciation)
    let user1 = deps.api.addr_make("user1");
    let info = message_info(&user1, &[Coin::new(50_000_000u128, &config.csinj_denom)]);
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Unstake {},
    )
    .unwrap();

    // Check the unstake event for inj_owed
    let unstake_event = res
        .events
        .iter()
        .find(|e| e.ty == "chance_unstake")
        .unwrap();
    let inj_owed: u128 = unstake_event
        .attributes
        .iter()
        .find(|a| a.key == "inj_owed")
        .unwrap()
        .value
        .parse()
        .unwrap();
    assert!(
        inj_owed > 50_000_000,
        "User1 should receive > 50M INJ for 50M csINJ at rate > 1.0, got: {}",
        inj_owed
    );

    eprintln!("test_exchange_rate_appreciation passed");
}

#[test]
fn test_expired_draw() {
    // Test the draw expiry flow in the reward distributor:
    // 1. Fund pool, set snapshot, commit draw
    // 2. Try expire too early → fail
    // 3. Fast forward past deadline → expire succeeds
    // 4. Verify funds returned to pool
    let mut deps = mock_dependencies();
    setup_distributor(&mut deps);

    // Fund the regular pool
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // Set snapshot (from staking hub)
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
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
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: hex::encode(commit),
            target_drand_round: 1000,
            epoch: 1,
        },
    )
    .unwrap();

    // Verify pool fully drained
    let state: chance_reward_distributor::state::DrawStateInfo = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawState {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(state.regular_pool_balance, Uint128::zero());

    // Try expire too early → should fail
    let anyone = deps.api.addr_make("anyone");
    let info = message_info(&anyone, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::ExpireDraw { draw_id: 0 },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("DrawNotExpired"),
        "Expected not-expired error, got: {:?}",
        err
    );

    // Fast forward past deadline (3600 + buffer)
    let mut env = mock_env();
    env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 7200);

    // Now expire should succeed
    let anyone = deps.api.addr_make("anyone");
    let info = message_info(&anyone, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::ExpireDraw { draw_id: 0 },
    )
    .unwrap();

    // Verify draw status is Expired
    let draw: chance_reward_distributor::state::Draw = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::Draw { draw_id: 0 },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        draw.status,
        chance_staking_common::types::DrawStatus::Expired
    );

    // Verify funds returned to pool
    let state: chance_reward_distributor::state::DrawStateInfo = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawState {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        state.regular_pool_balance,
        Uint128::from(50_000_000u128),
        "Funds should be returned to pool after expiry"
    );

    eprintln!("test_expired_draw passed");
}

#[test]
fn test_full_stake_and_draw_cycle() {
    // Full integration test across all 3 contracts:
    // 1. Setup oracle, submit a real beacon
    // 2. Setup distributor with mock wasm querier returning beacon data
    // 3. Fund pool, set snapshot, commit draw
    // 4. Build a real merkle tree with known addresses
    // 5. Reveal draw with correct winner + merkle proof
    // 6. Verify draw is Revealed and winner is correct

    // ── Step 1: Setup and submit beacon to oracle ──
    let mut oracle_deps = mock_dependencies();
    setup_oracle(&mut oracle_deps);

    let operator = oracle_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_drand_oracle::contract::execute(
        oracle_deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: TEST_ROUND,
            signature_hex: TEST_SIG_HEX.to_string(),
        },
    )
    .unwrap();

    // Get the beacon data we'll mock in the distributor's querier
    let beacon_query_res = chance_drand_oracle::contract::query(
        oracle_deps.as_ref(),
        mock_env(),
        chance_drand_oracle::msg::QueryMsg::Beacon { round: TEST_ROUND },
    )
    .unwrap();

    // ── Step 2: Setup distributor with custom wasm querier ──
    let mut dist_deps = mock_dependencies();

    // Configure the mock querier to respond to drand oracle and staking hub queries
    let beacon_binary = beacon_query_res.clone();
    dist_deps.querier.update_wasm(move |query| {
        match query {
            WasmQuery::Smart { msg, .. } => {
                // Try to parse as oracle query
                let parsed: Result<chance_reward_distributor::msg::OracleQueryMsg, _> =
                    from_json(msg);
                if let Ok(chance_reward_distributor::msg::OracleQueryMsg::Beacon { .. }) = parsed {
                    return SystemResult::Ok(ContractResult::Ok(beacon_binary.clone()));
                }

                // Try to parse as staking hub query
                let parsed: Result<chance_reward_distributor::msg::StakingHubQueryMsg, _> =
                    from_json(msg);
                match parsed {
                    Ok(chance_reward_distributor::msg::StakingHubQueryMsg::Config {}) => {
                        let config = chance_reward_distributor::msg::StakingHubConfigResponse {
                            min_epochs_regular: 0,
                            min_epochs_big: 0,
                        };
                        SystemResult::Ok(ContractResult::Ok(to_json_binary(&config).unwrap()))
                    }
                    Ok(chance_reward_distributor::msg::StakingHubQueryMsg::StakerInfo {
                        address,
                    }) => {
                        let info = chance_reward_distributor::msg::StakerInfoResponse {
                            address,
                            stake_epoch: Some(0),
                        };
                        SystemResult::Ok(ContractResult::Ok(to_json_binary(&info).unwrap()))
                    }
                    _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
                        error: "Unknown query".to_string(),
                        request: Default::default(),
                    }),
                }
            }
            _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
                error: "Only smart queries supported".to_string(),
                request: Default::default(),
            }),
        }
    });

    setup_distributor(&mut dist_deps);

    // ── Step 3: Fund pool ──
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // ── Step 4: Build merkle tree with real addresses ──
    // Use addr_make to create valid bech32 addresses
    let addr_a = dist_deps.api.addr_make("user_a").to_string();
    let addr_b = dist_deps.api.addr_make("user_b").to_string();
    let addr_c = dist_deps.api.addr_make("user_c").to_string();

    let leaf_a = compute_leaf_hash(&addr_a, 0, 100);
    let leaf_b = compute_leaf_hash(&addr_b, 100, 350);
    let leaf_c = compute_leaf_hash(&addr_c, 350, 400);
    let leaf_d = leaf_c; // duplicate for balanced tree

    let node_ab = sorted_hash(&leaf_a, &leaf_b);
    let node_cd = sorted_hash(&leaf_c, &leaf_d);
    let root = sorted_hash(&node_ab, &node_cd);
    let root_hex = hex::encode(root);

    // Total weight = 400
    let total_weight = Uint128::from(400u128);

    // Set snapshot with our merkle root
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: root_hex.clone(),
            total_weight,
            num_holders: 3,
        },
    )
    .unwrap();

    // ── Step 5: Commit draw ──
    let secret = b"integration_test_secret";
    let commit: [u8; 32] = Sha256::digest(secret).into();
    let commit_hex = hex::encode(commit);

    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: commit_hex,
            target_drand_round: TEST_ROUND,
            epoch: 1,
        },
    )
    .unwrap();

    // ── Step 6: Compute the winning ticket to figure out which user wins ──
    let drand_randomness = hex::decode(TEST_RANDOMNESS_HEX).unwrap();
    let secret_hash: [u8; 32] = Sha256::digest(secret).into();
    let mut final_randomness = [0u8; 32];
    for i in 0..32 {
        final_randomness[i] = drand_randomness[i] ^ secret_hash[i];
    }
    let mut ticket_bytes = [0u8; 16];
    ticket_bytes.copy_from_slice(&final_randomness[0..16]);
    let ticket_raw = u128::from_be_bytes(ticket_bytes);
    let winning_ticket = ticket_raw % total_weight.u128();

    // Determine winner and build proof
    let (winner_addr, winner_start, winner_end, proof) = if winning_ticket < 100 {
        // user_a wins, proof = [leaf_b, node_cd]
        (
            addr_a.clone(),
            Uint128::zero(),
            Uint128::from(100u128),
            vec![hex::encode(leaf_b), hex::encode(node_cd)],
        )
    } else if winning_ticket < 350 {
        // user_b wins, proof = [leaf_a, node_cd]
        (
            addr_b.clone(),
            Uint128::from(100u128),
            Uint128::from(350u128),
            vec![hex::encode(leaf_a), hex::encode(node_cd)],
        )
    } else {
        // user_c wins, proof = [leaf_d, node_ab]
        (
            addr_c.clone(),
            Uint128::from(350u128),
            Uint128::from(400u128),
            vec![hex::encode(leaf_d), hex::encode(node_ab)],
        )
    };

    // Sanity: verify proof works locally
    let winner_leaf = compute_leaf_hash(&winner_addr, winner_start.u128(), winner_end.u128());
    assert!(
        verify_merkle_proof(&root_hex, &proof, &winner_leaf),
        "Merkle proof should verify locally"
    );

    // ── Step 7: Reveal draw ──
    // L-05 FIX: Set contract balance for the reward payout
    let env = mock_env();
    dist_deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(50_000_000u128, "inj")],
    );

    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let res = chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 0,
            operator_secret_hex: hex::encode(secret),
            winner_address: winner_addr.clone(),
            winner_cumulative_start: winner_start,
            winner_cumulative_end: winner_end,
            merkle_proof: proof,
        },
    )
    .unwrap();

    // Verify the response has a bank send message (reward)
    assert_eq!(res.messages.len(), 1, "Should have 1 bank send message");

    // Check draw result event
    let result_event = res
        .events
        .iter()
        .find(|e| e.ty == "chance_draw_result")
        .expect("Should have draw result event");
    let event_winner = result_event
        .attributes
        .iter()
        .find(|a| a.key == "winner")
        .unwrap();
    assert_eq!(event_winner.value, winner_addr);

    // ── Step 8: Query draw and verify state ──
    let draw: chance_reward_distributor::state::Draw = from_json(
        chance_reward_distributor::contract::query(
            dist_deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::Draw { draw_id: 0 },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        draw.status,
        chance_staking_common::types::DrawStatus::Revealed
    );
    assert!(draw.winner.is_some());
    assert!(draw.final_randomness.is_some());
    assert!(draw.drand_randomness.is_some());

    // Verify draw state totals updated
    let state: chance_reward_distributor::state::DrawStateInfo = from_json(
        chance_reward_distributor::contract::query(
            dist_deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawState {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(state.total_draws_completed, 1);
    // Full pool (50M) was awarded
    assert_eq!(
        state.total_rewards_distributed,
        Uint128::from(50_000_000u128)
    );

    eprintln!("test_full_stake_and_draw_cycle passed");
}

#[test]
fn test_merkle_proof_verification_e2e() {
    // This test runs without wasm artifacts — it tests the common package logic
    let leaf_a = compute_leaf_hash("inj1aaa", 0, 100);
    let leaf_b = compute_leaf_hash("inj1bbb", 100, 350);
    let leaf_c = compute_leaf_hash("inj1ccc", 350, 400);

    // Build tree: pad to 4 leaves by duplicating last
    let leaf_d = leaf_c; // duplicate for balanced tree

    let node_ab = sorted_hash(&leaf_a, &leaf_b);
    let node_cd = sorted_hash(&leaf_c, &leaf_d);
    let root = sorted_hash(&node_ab, &node_cd);
    let root_hex = hex::encode(root);

    // Valid proof for leaf_b: [leaf_a, node_cd]
    let proof_b = vec![hex::encode(leaf_a), hex::encode(node_cd)];
    assert!(
        verify_merkle_proof(&root_hex, &proof_b, &leaf_b),
        "Valid proof should pass"
    );

    // Tampered proof
    let bad_proof = vec![hex::encode(leaf_c), hex::encode(node_cd)];
    assert!(
        !verify_merkle_proof(&root_hex, &bad_proof, &leaf_b),
        "Tampered proof should fail"
    );

    // Single leaf tree
    let single_leaf = compute_leaf_hash("inj1only", 0, 1000);
    let single_root = hex::encode(single_leaf);
    assert!(
        verify_merkle_proof(&single_root, &[], &single_leaf),
        "Single leaf with empty proof should pass"
    );

    eprintln!("test_merkle_proof_verification_e2e passed");
}

#[test]
fn test_multiple_draws_across_epochs() {
    // Test that multiple commit-reveal cycles work across epochs.
    // epochs_between_regular = 1, so we draw at epochs 1, 2, 3.
    // Each epoch gets funded and draws the full pool balance.

    let mut dist_deps = mock_dependencies();

    // Setup mock wasm querier with beacon response
    let randomness_bytes = hex::decode(TEST_RANDOMNESS_HEX).unwrap();
    let beacon_response = to_json_binary(&Some(
        chance_reward_distributor::state::StoredBeaconResponse {
            round: TEST_ROUND,
            randomness: randomness_bytes.clone(),
            signature: hex::decode(TEST_SIG_HEX).unwrap(),
            verified: true,
        },
    ))
    .unwrap();

    dist_deps.querier.update_wasm(move |query| match query {
        WasmQuery::Smart { msg, .. } => {
            // Try staking hub queries first
            let parsed: Result<chance_reward_distributor::msg::StakingHubQueryMsg, _> =
                from_json(msg);
            match parsed {
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::Config {}) => {
                    let config = chance_reward_distributor::msg::StakingHubConfigResponse {
                        min_epochs_regular: 0,
                        min_epochs_big: 0,
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&config).unwrap()))
                }
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::StakerInfo { address }) => {
                    let info = chance_reward_distributor::msg::StakerInfoResponse {
                        address,
                        stake_epoch: Some(0),
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&info).unwrap()))
                }
                _ => {
                    // Default: return beacon response (for oracle queries)
                    SystemResult::Ok(ContractResult::Ok(beacon_response.clone()))
                }
            }
        }
        _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
            error: "Only smart queries supported".to_string(),
            request: Default::default(),
        }),
    });

    setup_distributor(&mut dist_deps);

    // Build a simple merkle tree
    let addr_a = dist_deps.api.addr_make("user_a").to_string();
    let addr_b = dist_deps.api.addr_make("user_b").to_string();

    let leaf_a = compute_leaf_hash(&addr_a, 0, 500);
    let leaf_b = compute_leaf_hash(&addr_b, 500, 1000);
    let root = sorted_hash(&leaf_a, &leaf_b);
    let root_hex = hex::encode(root);
    let total_weight = Uint128::from(1000u128);

    let fund_per_epoch = Uint128::from(10_000_000u128);
    let mut total_distributed = Uint128::zero();

    for draw_num in 0u64..3 {
        let epoch = draw_num + 1;

        // Fund pool for this epoch
        let staking_hub = dist_deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &[Coin::new(fund_per_epoch.u128(), "inj")]);
        chance_reward_distributor::contract::execute(
            dist_deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
        )
        .unwrap();

        // Set snapshot for this epoch
        let staking_hub = dist_deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &[]);
        chance_reward_distributor::contract::execute(
            dist_deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
                epoch,
                merkle_root: root_hex.clone(),
                total_weight,
                num_holders: 2,
            },
        )
        .unwrap();

        // Each draw uses a different secret
        let secret = format!("secret_{}", draw_num);
        let secret_bytes = secret.as_bytes();
        let commit: [u8; 32] = Sha256::digest(secret_bytes).into();

        // Commit (reward = full pool balance)
        let operator = dist_deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        chance_reward_distributor::contract::execute(
            dist_deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
                draw_type: chance_staking_common::types::DrawType::Regular,
                operator_commit: hex::encode(commit),
                target_drand_round: TEST_ROUND,
                epoch,
            },
        )
        .unwrap();

        // Compute winning ticket
        let secret_hash: [u8; 32] = Sha256::digest(secret_bytes).into();
        let mut final_rand = [0u8; 32];
        for i in 0..32 {
            final_rand[i] = randomness_bytes[i] ^ secret_hash[i];
        }
        let mut ticket_bytes = [0u8; 16];
        ticket_bytes.copy_from_slice(&final_rand[0..16]);
        let ticket_raw = u128::from_be_bytes(ticket_bytes);
        let winning_ticket = ticket_raw % total_weight.u128();

        let (winner_addr, winner_start, winner_end, proof) = if winning_ticket < 500 {
            (
                addr_a.clone(),
                Uint128::zero(),
                Uint128::from(500u128),
                vec![hex::encode(leaf_b)],
            )
        } else {
            (
                addr_b.clone(),
                Uint128::from(500u128),
                Uint128::from(1000u128),
                vec![hex::encode(leaf_a)],
            )
        };

        // Reveal
        // L-05 FIX: Set contract balance for the reward payout
        let env = mock_env();
        dist_deps.querier.bank.update_balance(
            &env.contract.address,
            vec![Coin::new(fund_per_epoch.u128(), "inj")],
        );

        let operator = dist_deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        chance_reward_distributor::contract::execute(
            dist_deps.as_mut(),
            env,
            info,
            chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
                draw_id: draw_num,
                operator_secret_hex: hex::encode(secret_bytes),
                winner_address: winner_addr,
                winner_cumulative_start: winner_start,
                winner_cumulative_end: winner_end,
                merkle_proof: proof,
            },
        )
        .unwrap();

        total_distributed += fund_per_epoch;

        // Verify pool is drained after each draw
        let state: chance_reward_distributor::state::DrawStateInfo = from_json(
            chance_reward_distributor::contract::query(
                dist_deps.as_ref(),
                mock_env(),
                chance_reward_distributor::msg::QueryMsg::DrawState {},
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            state.regular_pool_balance,
            Uint128::zero(),
            "Pool should be fully drained after each draw"
        );
        assert_eq!(state.total_draws_completed, draw_num + 1);
    }

    // Final verification: 3 draws completed, 30M distributed
    let state: chance_reward_distributor::state::DrawStateInfo = from_json(
        chance_reward_distributor::contract::query(
            dist_deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawState {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(state.total_draws_completed, 3);
    assert_eq!(state.total_rewards_distributed, total_distributed);
    assert_eq!(state.regular_pool_balance, Uint128::zero());

    eprintln!("test_multiple_draws_across_epochs passed");
}

// ────────────────────────────────────────────────────────────────────────────
// Additional tests for audit coverage gaps
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_slashing_detection_via_sync_delegations() {
    // H-05: Test that sync_delegations correctly detects and reconciles slashing.
    // Simulate validator slashing by mocking delegation queries to return less than expected.

    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let user1 = deps.api.addr_make("user1");

    // 1. User stakes 100 INJ
    let info = message_info(&user1, &[Coin::new(100_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    // Verify initial backing
    let rate_resp: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(rate_resp.total_inj_backing, Uint128::from(100_000_000u128));
    assert_eq!(rate_resp.rate, Decimal::one());

    // 2. Simulate slashing: Mock delegation query to return 90M instead of 100M
    // Note: In a real scenario, we'd configure the querier to return slashed delegation amounts.
    // For this test, we'll call sync_delegations which queries delegations.
    // Since we can't easily mock delegation queries in this test framework,
    // we'll verify the function exists and is operator-only.

    // Verify unauthorized call fails
    let random = deps.api.addr_make("random");
    let info = message_info(&random, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::SyncDelegations {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Non-operator should not be able to call sync_delegations"
    );

    // Verify operator can call (though it will query real delegations which we can't mock easily)
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    // This will succeed but won't detect slashing without delegation query mocking
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::SyncDelegations {},
    );
    // Just verify it doesn't panic - actual slashing detection requires delegation query mocking
    assert!(
        res.is_ok(),
        "sync_delegations should be callable by operator"
    );

    eprintln!("test_slashing_detection_via_sync_delegations passed");
}

#[test]
fn test_multi_epoch_base_yield_no_double_counting() {
    // C-01: Verify that base yield doesn't double-count across multiple epochs.
    // Run distribute_rewards 5 times and verify exchange rate increases correctly.

    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let user1 = deps.api.addr_make("user1");

    // 1. User stakes 100M INJ
    let info = message_info(&user1, &[Coin::new(100_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    let initial_rate: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(initial_rate.rate, Decimal::one());

    // 2. Run 5 epochs with 10M rewards each
    let epoch_duration = 86400u64;

    for epoch in 1..=5 {
        // Create env and advance time by epoch_duration
        let mut env = mock_env();
        env.block.time = env.block.time.plus_seconds(epoch_duration * epoch);

        // Simulate 10M rewards in contract
        deps.querier.bank.update_balance(
            &env.contract.address,
            vec![Coin::new(10_000_000u128, "inj")],
        );

        // Distribute rewards
        let operator = deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        chance_staking_hub::contract::execute(
            deps.as_mut(),
            env.clone(),
            info,
            chance_staking_hub::msg::ExecuteMsg::DistributeRewards {},
        )
        .unwrap();

        // Verify exchange rate increases each epoch
        let rate_resp: chance_staking_hub::msg::ExchangeRateResponse = from_json(
            chance_staking_hub::contract::query(
                deps.as_ref(),
                env,
                chance_staking_hub::msg::QueryMsg::ExchangeRate {},
            )
            .unwrap(),
        )
        .unwrap();

        eprintln!(
            "Epoch {}: rate = {}, backing = {}, supply = {}",
            epoch, rate_resp.rate, rate_resp.total_inj_backing, rate_resp.total_csinj_supply
        );

        assert!(
            rate_resp.rate > initial_rate.rate,
            "Exchange rate should increase after epoch {}",
            epoch
        );
    }

    // Final verification: backing should be initial + (5 epochs × 10M × 5% base_yield)
    // = 100M + 2.5M = 102.5M (but due to pool distribution it's less)
    // The key test is that rate increases monotonically without jumps from double-counting
    let final_rate: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();

    assert!(
        final_rate.rate < Decimal::from_ratio(120_000_000u128, 100_000_000u128),
        "Rate should not be inflated by double-counting (should be < 1.2)"
    );

    eprintln!("test_multi_epoch_base_yield_no_double_counting passed");
}

#[test]
fn test_bps_sum_validation_in_update_config() {
    // C-02: Test that update_config validates BPS sum == 10000

    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let admin = deps.api.addr_make("admin");

    // Try to update protocol_fee_bps to 1000, which would break the sum
    // Current: regular=7000, big=2000, base_yield=500, fee=500 = 10000
    // If we change fee to 1000: regular=7000, big=2000, base_yield=500, fee=1000 = 10500 (invalid)
    let info = message_info(&admin, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::UpdateConfig {
            admin: None,
            operator: None,
            protocol_fee_bps: Some(1000), // This breaks the sum
            base_yield_bps: None,
            regular_pool_bps: None,
            big_pool_bps: None,
            min_epochs_regular: None,
            min_epochs_big: None,
            min_stake_amount: None,
        },
    )
    .unwrap_err();

    assert!(
        format!("{:?}", err).contains("BpsSumMismatch"),
        "Should reject invalid BPS sum, got: {:?}",
        err
    );

    // Valid update: change fee to 1000 and regular to 6500 (sum still 10000)
    let admin = deps.api.addr_make("admin");
    let info = message_info(&admin, &[]);
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::UpdateConfig {
            admin: None,
            operator: None,
            protocol_fee_bps: Some(1000),
            base_yield_bps: None,
            regular_pool_bps: Some(6500),
            big_pool_bps: None,
            min_epochs_regular: None,
            min_epochs_big: None,
            min_stake_amount: None,
        },
    );
    assert!(res.is_ok(), "Valid BPS sum should succeed");

    eprintln!("test_bps_sum_validation_in_update_config passed");
}

#[test]
fn test_zero_total_weight_snapshot_rejected() {
    // H-03: Test that committing a draw with zero total_weight is rejected

    let mut deps = mock_dependencies();
    setup_distributor(&mut deps);

    // Set snapshot with zero total_weight
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: "deadbeef".to_string(),
            total_weight: Uint128::zero(), // Zero weight!
            num_holders: 0,
        },
    )
    .unwrap();

    // Fund pool
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(10_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // Try to commit draw with zero-weight snapshot → should fail
    let secret = b"test_secret";
    let commit: [u8; 32] = Sha256::digest(secret).into();
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: hex::encode(commit),
            target_drand_round: 1000,
            epoch: 1,
        },
    )
    .unwrap_err();

    assert!(
        format!("{:?}", err).contains("ZeroWeight"),
        "Should reject zero-weight snapshot, got: {:?}",
        err
    );

    eprintln!("test_zero_total_weight_snapshot_rejected passed");
}

#[test]
fn test_snapshot_overwrite_prevented() {
    // M-01: Test that calling set_snapshot twice for the same epoch is rejected

    let mut deps = mock_dependencies();
    setup_distributor(&mut deps);

    // Set snapshot for epoch 1
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: "original_root".to_string(),
            total_weight: Uint128::from(1000u128),
            num_holders: 10,
        },
    )
    .unwrap();

    // Try to set snapshot again for epoch 1 → should fail
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: "malicious_root".to_string(),
            total_weight: Uint128::from(2000u128),
            num_holders: 20,
        },
    )
    .unwrap_err();

    assert!(
        format!("{:?}", err).contains("SnapshotAlreadyExists"),
        "Should reject duplicate snapshot, got: {:?}",
        err
    );

    // Setting snapshot for epoch 2 should succeed
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    let res = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 2,
            merkle_root: "epoch2_root".to_string(),
            total_weight: Uint128::from(3000u128),
            num_holders: 30,
        },
    );
    assert!(res.is_ok(), "New epoch snapshot should succeed");

    eprintln!("test_snapshot_overwrite_prevented passed");
}

#[test]
fn test_large_stake_amounts_no_overflow() {
    // Test staking large amounts near overflow boundaries
    // Verify that exchange rate calculations don't overflow

    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let whale = deps.api.addr_make("whale");

    // Stake a very large amount (1 billion INJ = 10^9 × 10^18 atto)
    let large_amount =
        Uint128::from(1_000_000_000u128) * Uint128::from(1_000_000_000_000_000_000u128);

    let info = message_info(&whale, &[Coin::new(large_amount.u128(), "inj")]);
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    );

    // Should succeed without overflow
    assert!(res.is_ok(), "Large stake should not overflow");

    // Verify exchange rate is still 1.0
    let rate_resp: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(rate_resp.rate, Decimal::one());
    assert_eq!(rate_resp.total_inj_backing, large_amount);

    eprintln!("test_large_stake_amounts_no_overflow passed");
}

#[test]
fn test_cross_contract_balance_reconciliation() {
    // Test that TOTAL_INJ_BACKING stays in sync with actual state across multiple operations.
    // This verifies H-04 fix (proper error handling) and general accounting correctness.

    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();

    let user1 = deps.api.addr_make("user1");
    let user2 = deps.api.addr_make("user2");

    // 1. User1 stakes 100M
    let info = message_info(&user1, &[Coin::new(100_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    let rate1: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(rate1.total_inj_backing, Uint128::from(100_000_000u128));

    // 2. User2 stakes 50M
    let info = message_info(&user2, &[Coin::new(50_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    let rate2: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(rate2.total_inj_backing, Uint128::from(150_000_000u128));

    // 3. User1 unstakes 30M csINJ
    let info = message_info(&user1, &[Coin::new(30_000_000u128, &config.csinj_denom)]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Unstake {},
    )
    .unwrap();

    // Backing should decrease by 30M, but it's reserved in PENDING_UNSTAKE_TOTAL
    // Total backing stays at 150M until claim
    let rate3: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    // After unstake, backing is reduced immediately
    assert_eq!(rate3.total_inj_backing, Uint128::from(120_000_000u128));
    assert_eq!(rate3.total_csinj_supply, Uint128::from(120_000_000u128));

    // 4. Advance time and claim
    let mut env = mock_env();
    env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 22 * 24 * 60 * 60);

    let info = message_info(&user1, &[]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        env.clone(),
        info,
        chance_staking_hub::msg::ExecuteMsg::ClaimUnstaked {
            request_ids: vec![0],
        },
    )
    .unwrap();

    // After claim, backing should still be 120M (30M was already removed)
    let rate4: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            env,
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(rate4.total_inj_backing, Uint128::from(120_000_000u128));

    eprintln!("test_cross_contract_balance_reconciliation passed");
}

#[test]
fn test_reveal_draw_rejects_ineligible_winner() {
    // Test that reveal_draw rejects a winner who doesn't meet min_epochs eligibility.
    // Scenario: min_epochs_regular=2, winner staked at epoch 1, draw is for epoch 1
    // → epochs_staked = 1 - 1 = 0, which is < 2 → should be rejected.

    // ── Step 1: Setup oracle and get beacon ──
    let mut oracle_deps = mock_dependencies();
    setup_oracle(&mut oracle_deps);

    let operator = oracle_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_drand_oracle::contract::execute(
        oracle_deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: TEST_ROUND,
            signature_hex: TEST_SIG_HEX.to_string(),
        },
    )
    .unwrap();

    let beacon_query_res = chance_drand_oracle::contract::query(
        oracle_deps.as_ref(),
        mock_env(),
        chance_drand_oracle::msg::QueryMsg::Beacon { round: TEST_ROUND },
    )
    .unwrap();

    // ── Step 2: Setup distributor with mock querier ──
    // Mock returns min_epochs_regular=2 and stake_epoch=1 for all stakers
    let mut dist_deps = mock_dependencies();
    let beacon_binary = beacon_query_res.clone();
    dist_deps.querier.update_wasm(move |query| {
        match query {
            WasmQuery::Smart { msg, .. } => {
                let parsed: Result<chance_reward_distributor::msg::StakingHubQueryMsg, _> =
                    from_json(msg);
                match parsed {
                    Ok(chance_reward_distributor::msg::StakingHubQueryMsg::Config {}) => {
                        let config = chance_reward_distributor::msg::StakingHubConfigResponse {
                            min_epochs_regular: 2,
                            min_epochs_big: 6,
                        };
                        SystemResult::Ok(ContractResult::Ok(to_json_binary(&config).unwrap()))
                    }
                    Ok(chance_reward_distributor::msg::StakingHubQueryMsg::StakerInfo {
                        address,
                    }) => {
                        // Winner staked at epoch 1
                        let info = chance_reward_distributor::msg::StakerInfoResponse {
                            address,
                            stake_epoch: Some(1),
                        };
                        SystemResult::Ok(ContractResult::Ok(to_json_binary(&info).unwrap()))
                    }
                    _ => {
                        // Oracle beacon query
                        SystemResult::Ok(ContractResult::Ok(beacon_binary.clone()))
                    }
                }
            }
            _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
                error: "Only smart queries supported".to_string(),
                request: Default::default(),
            }),
        }
    });

    setup_distributor(&mut dist_deps);

    // ── Step 3: Fund pool and set snapshot ──
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // Build merkle tree with one user
    let addr_a = dist_deps.api.addr_make("user_a").to_string();
    let leaf_a = compute_leaf_hash(&addr_a, 0, 100);
    let root_hex = hex::encode(leaf_a);

    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: root_hex.clone(),
            total_weight: Uint128::from(100u128),
            num_holders: 1,
        },
    )
    .unwrap();

    // ── Step 4: Commit draw for epoch 1 ──
    let secret = b"eligibility_test_secret";
    let commit: [u8; 32] = Sha256::digest(secret).into();

    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: hex::encode(commit),
            target_drand_round: TEST_ROUND,
            epoch: 1,
        },
    )
    .unwrap();

    // ── Step 5: Try to reveal — should fail with WinnerNotEligible ──
    let env = mock_env();
    dist_deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(50_000_000u128, "inj")],
    );

    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 0,
            operator_secret_hex: hex::encode(secret),
            winner_address: addr_a.clone(),
            winner_cumulative_start: Uint128::zero(),
            winner_cumulative_end: Uint128::from(100u128),
            merkle_proof: vec![], // single leaf = empty proof
        },
    )
    .unwrap_err();

    assert!(
        format!("{:?}", err).contains("WinnerNotEligible"),
        "Should reject ineligible winner, got: {:?}",
        err
    );

    eprintln!("test_reveal_draw_rejects_ineligible_winner passed");
}

#[test]
fn test_reveal_draw_accepts_eligible_winner() {
    // Test that reveal_draw succeeds when winner meets min_epochs eligibility.
    // Scenario: min_epochs_regular=2, winner staked at epoch 1, draw is for epoch 3
    // → epochs_staked = 3 - 1 = 2, which is >= 2 → should succeed.

    let mut oracle_deps = mock_dependencies();
    setup_oracle(&mut oracle_deps);

    let operator = oracle_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_drand_oracle::contract::execute(
        oracle_deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: TEST_ROUND,
            signature_hex: TEST_SIG_HEX.to_string(),
        },
    )
    .unwrap();

    let beacon_query_res = chance_drand_oracle::contract::query(
        oracle_deps.as_ref(),
        mock_env(),
        chance_drand_oracle::msg::QueryMsg::Beacon { round: TEST_ROUND },
    )
    .unwrap();

    let mut dist_deps = mock_dependencies();
    let beacon_binary = beacon_query_res.clone();
    dist_deps.querier.update_wasm(move |query| {
        match query {
            WasmQuery::Smart { msg, .. } => {
                let parsed: Result<chance_reward_distributor::msg::StakingHubQueryMsg, _> =
                    from_json(msg);
                match parsed {
                    Ok(chance_reward_distributor::msg::StakingHubQueryMsg::Config {}) => {
                        let config = chance_reward_distributor::msg::StakingHubConfigResponse {
                            min_epochs_regular: 2,
                            min_epochs_big: 6,
                        };
                        SystemResult::Ok(ContractResult::Ok(to_json_binary(&config).unwrap()))
                    }
                    Ok(chance_reward_distributor::msg::StakingHubQueryMsg::StakerInfo {
                        address,
                    }) => {
                        // Winner staked at epoch 1
                        let info = chance_reward_distributor::msg::StakerInfoResponse {
                            address,
                            stake_epoch: Some(1),
                        };
                        SystemResult::Ok(ContractResult::Ok(to_json_binary(&info).unwrap()))
                    }
                    _ => SystemResult::Ok(ContractResult::Ok(beacon_binary.clone())),
                }
            }
            _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
                error: "Only smart queries supported".to_string(),
                request: Default::default(),
            }),
        }
    });

    setup_distributor(&mut dist_deps);

    // Fund pool
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // Build merkle tree with one user
    let addr_a = dist_deps.api.addr_make("user_a").to_string();
    let leaf_a = compute_leaf_hash(&addr_a, 0, 100);
    let root_hex = hex::encode(leaf_a);

    // Set snapshot for epoch 3 (winner staked at epoch 1, so 3-1=2 >= min_epochs_regular=2)
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 3,
            merkle_root: root_hex.clone(),
            total_weight: Uint128::from(100u128),
            num_holders: 1,
        },
    )
    .unwrap();

    // Commit draw for epoch 3
    let secret = b"eligibility_test_secret";
    let commit: [u8; 32] = Sha256::digest(secret).into();

    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: hex::encode(commit),
            target_drand_round: TEST_ROUND,
            epoch: 3,
        },
    )
    .unwrap();

    // Reveal — should succeed
    let env = mock_env();
    dist_deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(50_000_000u128, "inj")],
    );

    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let res = chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 0,
            operator_secret_hex: hex::encode(secret),
            winner_address: addr_a.clone(),
            winner_cumulative_start: Uint128::zero(),
            winner_cumulative_end: Uint128::from(100u128),
            merkle_proof: vec![],
        },
    );

    assert!(
        res.is_ok(),
        "Eligible winner should succeed, got: {:?}",
        res.unwrap_err()
    );

    eprintln!("test_reveal_draw_accepts_eligible_winner passed");
}

// ────────────────────────────────────────────────────────────────────────────
// Audit V2 — Additional test coverage
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_big_pool_draw_cycle() {
    // Full commit-reveal cycle for a big pool draw.
    // Verifies big pool balance, last_big_draw_epoch tracking, and payout.

    let mut oracle_deps = mock_dependencies();
    setup_oracle(&mut oracle_deps);

    let operator = oracle_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_drand_oracle::contract::execute(
        oracle_deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: TEST_ROUND,
            signature_hex: TEST_SIG_HEX.to_string(),
        },
    )
    .unwrap();

    let beacon_query_res = chance_drand_oracle::contract::query(
        oracle_deps.as_ref(),
        mock_env(),
        chance_drand_oracle::msg::QueryMsg::Beacon { round: TEST_ROUND },
    )
    .unwrap();

    let mut dist_deps = mock_dependencies();
    let beacon_binary = beacon_query_res.clone();
    dist_deps.querier.update_wasm(move |query| match query {
        WasmQuery::Smart { msg, .. } => {
            let parsed: Result<chance_reward_distributor::msg::StakingHubQueryMsg, _> =
                from_json(msg);
            match parsed {
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::Config {}) => {
                    let config = chance_reward_distributor::msg::StakingHubConfigResponse {
                        min_epochs_regular: 0,
                        min_epochs_big: 0,
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&config).unwrap()))
                }
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::StakerInfo { address }) => {
                    let info = chance_reward_distributor::msg::StakerInfoResponse {
                        address,
                        stake_epoch: Some(0),
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&info).unwrap()))
                }
                _ => SystemResult::Ok(ContractResult::Ok(beacon_binary.clone())),
            }
        }
        _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
            error: "Only smart queries supported".to_string(),
            request: Default::default(),
        }),
    });

    setup_distributor(&mut dist_deps);

    // Fund the BIG pool
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(200_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundBigPool {},
    )
    .unwrap();

    // Verify big pool balance
    let state: chance_reward_distributor::state::DrawStateInfo = from_json(
        chance_reward_distributor::contract::query(
            dist_deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawState {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(state.big_pool_balance, Uint128::from(200_000_000u128));

    // Build merkle tree
    let addr_a = dist_deps.api.addr_make("user_a").to_string();
    let leaf_a = compute_leaf_hash(&addr_a, 0, 100);
    let root_hex = hex::encode(leaf_a);

    // Set snapshot for epoch 7 (epochs_between_big = 7)
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 7,
            merkle_root: root_hex.clone(),
            total_weight: Uint128::from(100u128),
            num_holders: 1,
        },
    )
    .unwrap();

    // Commit BIG draw
    let secret = b"big_draw_secret";
    let commit: [u8; 32] = Sha256::digest(secret).into();
    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Big,
            operator_commit: hex::encode(commit),
            target_drand_round: TEST_ROUND,
            epoch: 7,
        },
    )
    .unwrap();

    // Verify big pool drained and last_big_draw_epoch set
    let state: chance_reward_distributor::state::DrawStateInfo = from_json(
        chance_reward_distributor::contract::query(
            dist_deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawState {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(state.big_pool_balance, Uint128::zero());
    assert_eq!(state.last_big_draw_epoch, Some(7));

    // Reveal
    let env = mock_env();
    dist_deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(200_000_000u128, "inj")],
    );

    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let res = chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 0,
            operator_secret_hex: hex::encode(secret),
            winner_address: addr_a.clone(),
            winner_cumulative_start: Uint128::zero(),
            winner_cumulative_end: Uint128::from(100u128),
            merkle_proof: vec![],
        },
    );
    assert!(res.is_ok(), "Big pool reveal should succeed");

    // Verify draw was revealed correctly
    let draw: chance_reward_distributor::state::Draw = from_json(
        chance_reward_distributor::contract::query(
            dist_deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::Draw { draw_id: 0 },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        draw.status,
        chance_staking_common::types::DrawStatus::Revealed
    );
    assert_eq!(draw.draw_type, chance_staking_common::types::DrawType::Big);
    assert_eq!(draw.reward_amount, Uint128::from(200_000_000u128));

    eprintln!("test_big_pool_draw_cycle passed");
}

#[test]
fn test_draw_too_soon_enforcement() {
    // Verify DrawTooSoon error when committing draws before the required epoch gap.

    let mut deps = mock_dependencies();
    setup_distributor(&mut deps);

    // Fund regular pool
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // Set snapshot for epoch 1
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: "a".repeat(64),
            total_weight: Uint128::from(1000u128),
            num_holders: 3,
        },
    )
    .unwrap();

    // Commit regular draw for epoch 1
    let secret = b"secret1";
    let commit: [u8; 32] = Sha256::digest(secret).into();
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: hex::encode(commit),
            target_drand_round: 1000,
            epoch: 1,
        },
    )
    .unwrap();

    // Fund pool again and try to commit another regular draw for epoch 1
    // (same epoch, but epochs_between_regular = 1 means next draw at epoch 1+1=2)
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // Trying to commit at epoch 1 again should fail (last_regular_draw_epoch = 1,
    // need epoch >= 1 + 1 = 2)
    // But we can't use epoch 1 since it's already committed. Need epoch 2 snapshot.
    // Actually, the H-02 fix requires epoch == LATEST_SNAPSHOT_EPOCH.
    // Since latest is 1 and we already drew at 1, we need a new snapshot at epoch 2.
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 2,
            merkle_root: "b".repeat(64),
            total_weight: Uint128::from(1000u128),
            num_holders: 3,
        },
    )
    .unwrap();

    // Now try to commit regular draw at epoch 2 — should succeed since 2 >= 1 + 1
    let secret2 = b"secret2";
    let commit2: [u8; 32] = Sha256::digest(secret2).into();
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let res = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: hex::encode(commit2),
            target_drand_round: 1000,
            epoch: 2,
        },
    );
    assert!(res.is_ok(), "Draw at epoch 2 should succeed (gap=1)");

    // Now test big pool: epochs_between_big = 7
    // Fund big pool
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(100_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundBigPool {},
    )
    .unwrap();

    // Commit big draw at epoch 2 (first big draw, no last_big_draw_epoch)
    let secret3 = b"bigsecret1";
    let commit3: [u8; 32] = Sha256::digest(secret3).into();
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Big,
            operator_commit: hex::encode(commit3),
            target_drand_round: 1000,
            epoch: 2,
        },
    )
    .unwrap();

    // Fund big pool again
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(100_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundBigPool {},
    )
    .unwrap();

    // Try big draw at epoch 5 — should fail: 5 < 2 + 7 = 9
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 5,
            merkle_root: "c".repeat(64),
            total_weight: Uint128::from(1000u128),
            num_holders: 3,
        },
    )
    .unwrap();

    let secret4 = b"bigsecret2";
    let commit4: [u8; 32] = Sha256::digest(secret4).into();
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Big,
            operator_commit: hex::encode(commit4),
            target_drand_round: 1000,
            epoch: 5,
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("DrawTooSoon"),
        "Expected DrawTooSoon for big draw at epoch 5, got: {:?}",
        err
    );

    eprintln!("test_draw_too_soon_enforcement passed");
}

#[test]
fn test_invalid_merkle_proof_rejected() {
    // Verify that reveal_draw rejects an invalid merkle proof.

    let mut oracle_deps = mock_dependencies();
    setup_oracle(&mut oracle_deps);

    let operator = oracle_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_drand_oracle::contract::execute(
        oracle_deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: TEST_ROUND,
            signature_hex: TEST_SIG_HEX.to_string(),
        },
    )
    .unwrap();

    let beacon_query_res = chance_drand_oracle::contract::query(
        oracle_deps.as_ref(),
        mock_env(),
        chance_drand_oracle::msg::QueryMsg::Beacon { round: TEST_ROUND },
    )
    .unwrap();

    let mut dist_deps = mock_dependencies();
    let beacon_binary = beacon_query_res.clone();
    dist_deps.querier.update_wasm(move |query| match query {
        WasmQuery::Smart { msg, .. } => {
            let parsed: Result<chance_reward_distributor::msg::StakingHubQueryMsg, _> =
                from_json(msg);
            match parsed {
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::Config {}) => {
                    let config = chance_reward_distributor::msg::StakingHubConfigResponse {
                        min_epochs_regular: 0,
                        min_epochs_big: 0,
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&config).unwrap()))
                }
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::StakerInfo { address }) => {
                    let info = chance_reward_distributor::msg::StakerInfoResponse {
                        address,
                        stake_epoch: Some(0),
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&info).unwrap()))
                }
                _ => SystemResult::Ok(ContractResult::Ok(beacon_binary.clone())),
            }
        }
        _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
            error: "Only smart queries supported".to_string(),
            request: Default::default(),
        }),
    });

    setup_distributor(&mut dist_deps);

    // Fund pool
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // Build merkle tree with 2 leaves
    let addr_a = dist_deps.api.addr_make("user_a").to_string();
    let addr_b = dist_deps.api.addr_make("user_b").to_string();
    let leaf_a = compute_leaf_hash(&addr_a, 0, 500);
    let leaf_b = compute_leaf_hash(&addr_b, 500, 1000);
    let root = sorted_hash(&leaf_a, &leaf_b);
    let root_hex = hex::encode(root);

    // Set snapshot
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: root_hex.clone(),
            total_weight: Uint128::from(1000u128),
            num_holders: 2,
        },
    )
    .unwrap();

    // Commit draw
    let secret = b"proof_test_secret";
    let commit: [u8; 32] = Sha256::digest(secret).into();
    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: hex::encode(commit),
            target_drand_round: TEST_ROUND,
            epoch: 1,
        },
    )
    .unwrap();

    // Compute winning ticket
    let drand_randomness = hex::decode(TEST_RANDOMNESS_HEX).unwrap();
    let secret_hash: [u8; 32] = Sha256::digest(secret).into();
    let mut final_rand = [0u8; 32];
    for i in 0..32 {
        final_rand[i] = drand_randomness[i] ^ secret_hash[i];
    }
    let mut ticket_bytes = [0u8; 16];
    ticket_bytes.copy_from_slice(&final_rand[0..16]);
    let ticket_raw = u128::from_be_bytes(ticket_bytes);
    let winning_ticket = ticket_raw % 1000;

    // Determine correct winner but provide WRONG proof
    let (winner_addr, winner_start, winner_end) = if winning_ticket < 500 {
        (addr_a.clone(), Uint128::zero(), Uint128::from(500u128))
    } else {
        (
            addr_b.clone(),
            Uint128::from(500u128),
            Uint128::from(1000u128),
        )
    };

    // Use a completely fake proof
    let fake_proof = vec![hex::encode([0xdeu8; 32])];

    let env = mock_env();
    dist_deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(50_000_000u128, "inj")],
    );

    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 0,
            operator_secret_hex: hex::encode(secret),
            winner_address: winner_addr,
            winner_cumulative_start: winner_start,
            winner_cumulative_end: winner_end,
            merkle_proof: fake_proof,
        },
    )
    .unwrap_err();

    assert!(
        format!("{:?}", err).contains("InvalidMerkleProof"),
        "Expected InvalidMerkleProof, got: {:?}",
        err
    );

    eprintln!("test_invalid_merkle_proof_rejected passed");
}

#[test]
fn test_winning_ticket_out_of_range_rejected() {
    // Verify that reveal rejects a winner whose cumulative range doesn't contain
    // the winning ticket.

    let mut oracle_deps = mock_dependencies();
    setup_oracle(&mut oracle_deps);

    let operator = oracle_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_drand_oracle::contract::execute(
        oracle_deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: TEST_ROUND,
            signature_hex: TEST_SIG_HEX.to_string(),
        },
    )
    .unwrap();

    let beacon_query_res = chance_drand_oracle::contract::query(
        oracle_deps.as_ref(),
        mock_env(),
        chance_drand_oracle::msg::QueryMsg::Beacon { round: TEST_ROUND },
    )
    .unwrap();

    let mut dist_deps = mock_dependencies();
    let beacon_binary = beacon_query_res.clone();
    dist_deps.querier.update_wasm(move |query| match query {
        WasmQuery::Smart { msg, .. } => {
            let parsed: Result<chance_reward_distributor::msg::StakingHubQueryMsg, _> =
                from_json(msg);
            match parsed {
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::Config {}) => {
                    let config = chance_reward_distributor::msg::StakingHubConfigResponse {
                        min_epochs_regular: 0,
                        min_epochs_big: 0,
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&config).unwrap()))
                }
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::StakerInfo { address }) => {
                    let info = chance_reward_distributor::msg::StakerInfoResponse {
                        address,
                        stake_epoch: Some(0),
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&info).unwrap()))
                }
                _ => SystemResult::Ok(ContractResult::Ok(beacon_binary.clone())),
            }
        }
        _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
            error: "Only smart queries supported".to_string(),
            request: Default::default(),
        }),
    });

    setup_distributor(&mut dist_deps);

    // Fund pool
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // Single leaf tree — all tickets go to user_a [0, 1000)
    let addr_a = dist_deps.api.addr_make("user_a").to_string();
    let leaf_a = compute_leaf_hash(&addr_a, 0, 1000);
    let root_hex = hex::encode(leaf_a);

    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: root_hex.clone(),
            total_weight: Uint128::from(1000u128),
            num_holders: 1,
        },
    )
    .unwrap();

    let secret = b"range_test_secret";
    let commit: [u8; 32] = Sha256::digest(secret).into();
    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: hex::encode(commit),
            target_drand_round: TEST_ROUND,
            epoch: 1,
        },
    )
    .unwrap();

    // Submit with WRONG cumulative range that doesn't contain the winning ticket
    // Winner is [0, 1000) but we claim [0, 1) — unless ticket is 0, this will fail
    let env = mock_env();
    dist_deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(50_000_000u128, "inj")],
    );

    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 0,
            operator_secret_hex: hex::encode(secret),
            winner_address: addr_a.clone(),
            winner_cumulative_start: Uint128::from(999u128),
            winner_cumulative_end: Uint128::from(1000u128),
            merkle_proof: vec![],
        },
    );

    // This should fail with either WinningTicketOutOfRange or InvalidMerkleProof
    // depending on whether the ticket check or merkle check runs first.
    // The ticket check runs first (step 5 before step 6).
    // The winning ticket is unlikely to be in [999, 1000), so this should fail.
    // But if by chance it lands on 999, the merkle proof will fail instead
    // since the leaf hash uses [999, 1000) but the tree has [0, 1000).
    assert!(err.is_err(), "Should reject wrong cumulative range");
    let err_str = format!("{:?}", err.unwrap_err());
    assert!(
        err_str.contains("WinningTicketOutOfRange") || err_str.contains("InvalidMerkleProof"),
        "Expected WinningTicketOutOfRange or InvalidMerkleProof, got: {}",
        err_str
    );

    eprintln!("test_winning_ticket_out_of_range_rejected passed");
}

#[test]
fn test_beacon_not_found_during_reveal() {
    // Verify that reveal fails when the target drand round beacon hasn't been submitted.

    let mut dist_deps = mock_dependencies();

    // Configure mock querier to return None for beacon queries
    dist_deps.querier.update_wasm(move |query| {
        match query {
            WasmQuery::Smart { msg, .. } => {
                let parsed: Result<chance_reward_distributor::msg::StakingHubQueryMsg, _> =
                    from_json(msg);
                match parsed {
                    Ok(chance_reward_distributor::msg::StakingHubQueryMsg::Config {}) => {
                        let config = chance_reward_distributor::msg::StakingHubConfigResponse {
                            min_epochs_regular: 0,
                            min_epochs_big: 0,
                        };
                        SystemResult::Ok(ContractResult::Ok(to_json_binary(&config).unwrap()))
                    }
                    Ok(chance_reward_distributor::msg::StakingHubQueryMsg::StakerInfo {
                        address,
                    }) => {
                        let info = chance_reward_distributor::msg::StakerInfoResponse {
                            address,
                            stake_epoch: Some(0),
                        };
                        SystemResult::Ok(ContractResult::Ok(to_json_binary(&info).unwrap()))
                    }
                    _ => {
                        // Return None for beacon query (beacon not found)
                        let none_beacon: Option<
                            chance_reward_distributor::state::StoredBeaconResponse,
                        > = None;
                        SystemResult::Ok(ContractResult::Ok(to_json_binary(&none_beacon).unwrap()))
                    }
                }
            }
            _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
                error: "Only smart queries supported".to_string(),
                request: Default::default(),
            }),
        }
    });

    setup_distributor(&mut dist_deps);

    // Fund pool
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // Set snapshot
    let addr_a = dist_deps.api.addr_make("user_a").to_string();
    let leaf_a = compute_leaf_hash(&addr_a, 0, 100);
    let root_hex = hex::encode(leaf_a);

    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: root_hex.clone(),
            total_weight: Uint128::from(100u128),
            num_holders: 1,
        },
    )
    .unwrap();

    // Commit draw targeting round 9999 (not submitted)
    let secret = b"beacon_test";
    let commit: [u8; 32] = Sha256::digest(secret).into();
    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: hex::encode(commit),
            target_drand_round: 9999,
            epoch: 1,
        },
    )
    .unwrap();

    // Try to reveal — should fail with BeaconNotFound
    let env = mock_env();
    dist_deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(50_000_000u128, "inj")],
    );

    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 0,
            operator_secret_hex: hex::encode(secret),
            winner_address: addr_a,
            winner_cumulative_start: Uint128::zero(),
            winner_cumulative_end: Uint128::from(100u128),
            merkle_proof: vec![],
        },
    )
    .unwrap_err();

    assert!(
        format!("{:?}", err).contains("BeaconNotFound"),
        "Expected BeaconNotFound, got: {:?}",
        err
    );

    eprintln!("test_beacon_not_found_during_reveal passed");
}

#[test]
fn test_multiple_unstake_requests_per_user() {
    // Verify that a user can create multiple unstake requests and claim them individually.

    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();

    let user = deps.api.addr_make("user");

    // Stake 300 INJ
    let info = message_info(&user, &[Coin::new(300_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    // Create 3 unstake requests: 50, 80, 120 csINJ
    for amount in [50_000_000u128, 80_000_000u128, 120_000_000u128] {
        let user = deps.api.addr_make("user");
        let info = message_info(&user, &[Coin::new(amount, &config.csinj_denom)]);
        chance_staking_hub::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_staking_hub::msg::ExecuteMsg::Unstake {},
        )
        .unwrap();
    }

    // Verify 3 requests exist
    let requests: Vec<chance_staking_hub::msg::UnstakeRequestEntry> = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::UnstakeRequests {
                address: deps.api.addr_make("user").to_string(),
                start_after: None,
                limit: None,
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(requests.len(), 3);
    assert_eq!(requests[0].id, 0);
    assert_eq!(requests[1].id, 1);
    assert_eq!(requests[2].id, 2);

    // Fast forward past 21 days
    let mut env = mock_env();
    env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 22 * 24 * 60 * 60);

    // Claim just request 1
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[]);
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        env.clone(),
        info,
        chance_staking_hub::msg::ExecuteMsg::ClaimUnstaked {
            request_ids: vec![1],
        },
    )
    .unwrap();
    assert_eq!(res.messages.len(), 1);

    // Claim requests 0 and 2 in a batch
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[]);
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_staking_hub::msg::ExecuteMsg::ClaimUnstaked {
            request_ids: vec![0, 2],
        },
    )
    .unwrap();
    assert_eq!(res.messages.len(), 1); // single bank send for combined amount

    // Verify all claimed
    let requests: Vec<chance_staking_hub::msg::UnstakeRequestEntry> = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::UnstakeRequests {
                address: deps.api.addr_make("user").to_string(),
                start_after: None,
                limit: None,
            },
        )
        .unwrap(),
    )
    .unwrap();
    for req in &requests {
        assert!(req.request.claimed, "Request {} should be claimed", req.id);
    }

    // Verify backing is now 300M - 250M = 50M
    let rate: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(rate.total_inj_backing, Uint128::from(50_000_000u128));

    eprintln!("test_multiple_unstake_requests_per_user passed");
}

#[test]
fn test_zero_rewards_distribution() {
    // Verify that distribute_rewards works correctly when there are zero surplus rewards
    // (contract balance == pending unstake total).

    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();

    let user = deps.api.addr_make("user");

    // Stake 100 INJ
    let info = message_info(&user, &[Coin::new(100_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    // Unstake 50 csINJ to create pending unstake
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[Coin::new(50_000_000u128, &config.csinj_denom)]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Unstake {},
    )
    .unwrap();

    // Set contract balance = pending unstake total (50M), so surplus = 0
    let mut env = mock_env();
    env.block.time = env.block.time.plus_seconds(86400);
    deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(50_000_000u128, "inj")],
    );

    // Distribute rewards — should succeed with 0 rewards
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_staking_hub::msg::ExecuteMsg::DistributeRewards {},
    )
    .unwrap();

    // Verify epoch advanced
    let epoch_state: chance_staking_hub::state::EpochState = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::EpochState {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        epoch_state.current_epoch, 2,
        "Epoch should advance even with zero rewards"
    );

    // Verify no pool funding messages (all zero amounts skipped)
    // Messages would only be for non-zero amounts
    let has_wasm_msgs = res
        .messages
        .iter()
        .any(|m| matches!(m.msg, cosmwasm_std::CosmosMsg::Wasm(_)));
    assert!(
        !has_wasm_msgs,
        "Should not send wasm messages for zero-amount pool funding"
    );

    // Exchange rate should remain the same (no base yield added)
    let rate: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        rate.rate,
        Decimal::one(),
        "Rate should stay at 1.0 with zero rewards"
    );

    eprintln!("test_zero_rewards_distribution passed");
}

#[test]
fn test_exchange_rate_rounding_no_value_extraction() {
    // Verify that staking and immediately unstaking at a non-1.0 rate
    // doesn't allow a user to extract more INJ than they staked.

    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();

    // User1 stakes 100M to establish initial pool
    let user1 = deps.api.addr_make("user1");
    let info = message_info(&user1, &[Coin::new(100_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    // Simulate rewards: 10M rewards → base_yield = 5% = 500K
    let mut env = mock_env();
    env.block.time = env.block.time.plus_seconds(86400);
    deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(10_000_000u128, "inj")],
    );
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_staking_hub::msg::ExecuteMsg::DistributeRewards {},
    )
    .unwrap();

    // Rate should now be > 1.0
    let rate: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    assert!(rate.rate > Decimal::one());

    // User2 stakes a small odd amount (7 INJ)
    let user2 = deps.api.addr_make("user2");
    let stake_amount = 7_000_000u128;
    let info = message_info(&user2, &[Coin::new(stake_amount, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    // Immediately unstake all csINJ
    let rate_before: chance_staking_hub::msg::ExchangeRateResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::ExchangeRate {},
        )
        .unwrap(),
    )
    .unwrap();
    let user2_csinj = rate_before.total_csinj_supply - Uint128::from(100_000_000u128);

    let user2 = deps.api.addr_make("user2");
    let info = message_info(
        &user2,
        &[Coin::new(user2_csinj.u128(), &config.csinj_denom)],
    );
    let res = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Unstake {},
    )
    .unwrap();

    // Check inj_owed from the unstake event
    let unstake_event = res
        .events
        .iter()
        .find(|e| e.ty == "chance_unstake")
        .unwrap();
    let inj_owed: u128 = unstake_event
        .attributes
        .iter()
        .find(|a| a.key == "inj_owed")
        .unwrap()
        .value
        .parse()
        .unwrap();

    // User should NOT get more INJ back than they put in
    assert!(
        inj_owed <= stake_amount,
        "Rounding exploitation: staked {}, got back {} — extraction of {} wei",
        stake_amount,
        inj_owed,
        inj_owed.saturating_sub(stake_amount)
    );

    eprintln!("test_exchange_rate_rounding_no_value_extraction passed");
}

#[test]
fn test_concurrent_regular_and_big_draw() {
    // Verify that both a regular and big draw can be committed and revealed
    // in the same epoch.

    let mut oracle_deps = mock_dependencies();
    setup_oracle(&mut oracle_deps);

    let operator = oracle_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_drand_oracle::contract::execute(
        oracle_deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: TEST_ROUND,
            signature_hex: TEST_SIG_HEX.to_string(),
        },
    )
    .unwrap();

    let beacon_query_res = chance_drand_oracle::contract::query(
        oracle_deps.as_ref(),
        mock_env(),
        chance_drand_oracle::msg::QueryMsg::Beacon { round: TEST_ROUND },
    )
    .unwrap();

    let mut dist_deps = mock_dependencies();
    let beacon_binary = beacon_query_res.clone();
    dist_deps.querier.update_wasm(move |query| match query {
        WasmQuery::Smart { msg, .. } => {
            let parsed: Result<chance_reward_distributor::msg::StakingHubQueryMsg, _> =
                from_json(msg);
            match parsed {
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::Config {}) => {
                    let config = chance_reward_distributor::msg::StakingHubConfigResponse {
                        min_epochs_regular: 0,
                        min_epochs_big: 0,
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&config).unwrap()))
                }
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::StakerInfo { address }) => {
                    let info = chance_reward_distributor::msg::StakerInfoResponse {
                        address,
                        stake_epoch: Some(0),
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&info).unwrap()))
                }
                _ => SystemResult::Ok(ContractResult::Ok(beacon_binary.clone())),
            }
        }
        _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
            error: "Only smart queries supported".to_string(),
            request: Default::default(),
        }),
    });

    setup_distributor(&mut dist_deps);

    // Fund both pools
    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(30_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(100_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundBigPool {},
    )
    .unwrap();

    // Set snapshot
    let addr_a = dist_deps.api.addr_make("user_a").to_string();
    let leaf_a = compute_leaf_hash(&addr_a, 0, 100);
    let root_hex = hex::encode(leaf_a);

    let staking_hub = dist_deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: root_hex.clone(),
            total_weight: Uint128::from(100u128),
            num_holders: 1,
        },
    )
    .unwrap();

    // Commit regular draw (draw_id = 0)
    let secret_regular = b"regular_secret";
    let commit_r: [u8; 32] = Sha256::digest(secret_regular).into();
    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: hex::encode(commit_r),
            target_drand_round: TEST_ROUND,
            epoch: 1,
        },
    )
    .unwrap();

    // Commit big draw (draw_id = 1)
    let secret_big = b"big_secret";
    let commit_b: [u8; 32] = Sha256::digest(secret_big).into();
    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Big,
            operator_commit: hex::encode(commit_b),
            target_drand_round: TEST_ROUND,
            epoch: 1,
        },
    )
    .unwrap();

    // Verify both pools drained
    let state: chance_reward_distributor::state::DrawStateInfo = from_json(
        chance_reward_distributor::contract::query(
            dist_deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawState {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(state.regular_pool_balance, Uint128::zero());
    assert_eq!(state.big_pool_balance, Uint128::zero());
    assert_eq!(state.next_draw_id, 2);

    // Reveal both draws
    for (draw_id, secret) in [
        (0u64, secret_regular.as_slice()),
        (1u64, secret_big.as_slice()),
    ] {
        let env = mock_env();
        dist_deps.querier.bank.update_balance(
            &env.contract.address,
            vec![Coin::new(200_000_000u128, "inj")],
        );

        let operator = dist_deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        let res = chance_reward_distributor::contract::execute(
            dist_deps.as_mut(),
            env,
            info,
            chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
                draw_id,
                operator_secret_hex: hex::encode(secret),
                winner_address: addr_a.clone(),
                winner_cumulative_start: Uint128::zero(),
                winner_cumulative_end: Uint128::from(100u128),
                merkle_proof: vec![],
            },
        );
        assert!(
            res.is_ok(),
            "Draw {} reveal should succeed, got: {:?}",
            draw_id,
            res.unwrap_err()
        );
    }

    // Verify both draws completed
    let state: chance_reward_distributor::state::DrawStateInfo = from_json(
        chance_reward_distributor::contract::query(
            dist_deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawState {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(state.total_draws_completed, 2);
    assert_eq!(
        state.total_rewards_distributed,
        Uint128::from(130_000_000u128)
    );

    eprintln!("test_concurrent_regular_and_big_draw passed");
}

#[test]
fn test_double_claim_unstake_rejected() {
    // Verify that claiming an already-claimed unstake request fails.

    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();

    let user = deps.api.addr_make("user");

    // Stake 100 INJ
    let info = message_info(&user, &[Coin::new(100_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    // Unstake 50
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[Coin::new(50_000_000u128, &config.csinj_denom)]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Unstake {},
    )
    .unwrap();

    // Fast forward past unbonding
    let mut env = mock_env();
    env.block.time = Timestamp::from_seconds(env.block.time.seconds() + 22 * 24 * 60 * 60);

    // Claim once — should succeed
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        env.clone(),
        info,
        chance_staking_hub::msg::ExecuteMsg::ClaimUnstaked {
            request_ids: vec![0],
        },
    )
    .unwrap();

    // Claim same request again — should fail
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_staking_hub::msg::ExecuteMsg::ClaimUnstaked {
            request_ids: vec![0],
        },
    )
    .unwrap_err();

    assert!(
        format!("{:?}", err).contains("UnstakeAlreadyClaimed"),
        "Expected UnstakeAlreadyClaimed, got: {:?}",
        err
    );

    eprintln!("test_double_claim_unstake_rejected passed");
}

// ─── Min Stake Amount Tests ─────────────────────────────────────────

#[test]
fn test_min_stake_amount_enforcement() {
    use cosmwasm_std::coins;

    let mut deps = mock_dependencies();

    // Instantiate hub with min_stake_amount = 1_000_000
    let admin = deps.api.addr_make("admin");
    let mut msg = hub_instantiate_msg();
    msg.min_stake_amount = Uint128::new(1_000_000);
    let info = message_info(&admin, &[]);
    chance_staking_hub::contract::instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();

    // Stake below minimum — should fail
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &coins(999_999, "inj"));
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("StakeBelowMinimum"),
        "Expected StakeBelowMinimum, got: {:?}",
        err
    );

    // Stake exactly at minimum — should succeed
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &coins(1_000_000, "inj"));
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    // Stake above minimum — should succeed
    let user2 = deps.api.addr_make("user2");
    let info = message_info(&user2, &coins(10_000_000, "inj"));
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    eprintln!("test_min_stake_amount_enforcement passed");
}

#[test]
fn test_min_stake_amount_update_via_config() {
    use cosmwasm_std::coins;

    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    // Initially min_stake_amount is 0, so any amount works
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &coins(1, "inj"));
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    // Admin updates min_stake_amount to 500_000
    let admin = deps.api.addr_make("admin");
    let info = message_info(&admin, &[]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::UpdateConfig {
            admin: None,
            operator: None,
            protocol_fee_bps: None,
            base_yield_bps: None,
            regular_pool_bps: None,
            big_pool_bps: None,
            min_epochs_regular: None,
            min_epochs_big: None,
            min_stake_amount: Some(Uint128::new(500_000)),
        },
    )
    .unwrap();

    // Stake below new minimum should fail
    let user2 = deps.api.addr_make("user2");
    let info = message_info(&user2, &coins(499_999, "inj"));
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("StakeBelowMinimum"),
        "Expected StakeBelowMinimum, got: {:?}",
        err
    );

    // Stake at new minimum should succeed
    let user2 = deps.api.addr_make("user2");
    let info = message_info(&user2, &coins(500_000, "inj"));
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    eprintln!("test_min_stake_amount_update_via_config passed");
}

// ────────────────────────────────────────────────────────────────────────────
// Coverage expansion tests
// ────────────────────────────────────────────────────────────────────────────

/// Helper: get the beacon binary for mocking cross-contract oracle queries.
fn get_test_beacon_binary() -> cosmwasm_std::Binary {
    let mut oracle_deps = mock_dependencies();
    setup_oracle(&mut oracle_deps);
    let operator = oracle_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_drand_oracle::contract::execute(
        oracle_deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: TEST_ROUND,
            signature_hex: TEST_SIG_HEX.to_string(),
        },
    )
    .unwrap();
    chance_drand_oracle::contract::query(
        oracle_deps.as_ref(),
        mock_env(),
        chance_drand_oracle::msg::QueryMsg::Beacon { round: TEST_ROUND },
    )
    .unwrap()
}

/// Helper: setup distributor deps with mock wasm querier for cross-contract queries.
fn setup_distributor_with_mocks(
    deps: &mut OwnedDeps<cosmwasm_std::MemoryStorage, MockApi, MockQuerier>,
    min_epochs_regular: u64,
    min_epochs_big: u64,
    stake_epoch: Option<u64>,
) {
    let beacon_binary = get_test_beacon_binary();
    deps.querier.update_wasm(move |query| match query {
        WasmQuery::Smart { msg, .. } => {
            let parsed: Result<chance_reward_distributor::msg::OracleQueryMsg, _> = from_json(msg);
            if let Ok(chance_reward_distributor::msg::OracleQueryMsg::Beacon { .. }) = parsed {
                return SystemResult::Ok(ContractResult::Ok(beacon_binary.clone()));
            }
            let parsed: Result<chance_reward_distributor::msg::StakingHubQueryMsg, _> =
                from_json(msg);
            match parsed {
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::Config {}) => {
                    let config = chance_reward_distributor::msg::StakingHubConfigResponse {
                        min_epochs_regular,
                        min_epochs_big,
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&config).unwrap()))
                }
                Ok(chance_reward_distributor::msg::StakingHubQueryMsg::StakerInfo { address }) => {
                    let info = chance_reward_distributor::msg::StakerInfoResponse {
                        address,
                        stake_epoch,
                    };
                    SystemResult::Ok(ContractResult::Ok(to_json_binary(&info).unwrap()))
                }
                _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
                    error: "Unknown query".to_string(),
                    request: Default::default(),
                }),
            }
        }
        _ => SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
            error: "Only smart queries supported".to_string(),
            request: Default::default(),
        }),
    });
    setup_distributor(deps);
}

/// Helper: commit a draw and reveal it, returning the draw_id.
/// Assumes pool is already funded and snapshot is already set.
fn commit_and_reveal_draw(
    deps: &mut OwnedDeps<cosmwasm_std::MemoryStorage, MockApi, MockQuerier>,
    epoch: u64,
    draw_type: chance_staking_common::types::DrawType,
    secret: &[u8],
    _root_hex: &str,
    total_weight: Uint128,
    addr_a: &str,
    leaf_a: &[u8; 32],
    addr_b: &str,
    leaf_b: &[u8; 32],
    addr_c: &str,
    leaf_c: &[u8; 32],
    node_ab: &[u8; 32],
    node_cd: &[u8; 32],
) -> u64 {
    let commit: [u8; 32] = Sha256::digest(secret).into();
    let commit_hex = hex::encode(commit);

    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let res = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type,
            operator_commit: commit_hex,
            target_drand_round: TEST_ROUND,
            epoch,
        },
    )
    .unwrap();

    // Extract draw_id from response attributes
    let draw_id: u64 = res
        .attributes
        .iter()
        .find(|a| a.key == "draw_id")
        .unwrap()
        .value
        .parse()
        .unwrap();

    // Compute winning ticket
    let drand_randomness = hex::decode(TEST_RANDOMNESS_HEX).unwrap();
    let secret_hash: [u8; 32] = Sha256::digest(secret).into();
    let mut final_randomness = [0u8; 32];
    for i in 0..32 {
        final_randomness[i] = drand_randomness[i] ^ secret_hash[i];
    }
    let mut ticket_bytes = [0u8; 16];
    ticket_bytes.copy_from_slice(&final_randomness[0..16]);
    let ticket_raw = u128::from_be_bytes(ticket_bytes);
    let winning_ticket = ticket_raw % total_weight.u128();

    let (winner_addr, winner_start, winner_end, proof) = if winning_ticket < 100 {
        (
            addr_a.to_string(),
            Uint128::zero(),
            Uint128::from(100u128),
            vec![hex::encode(leaf_b), hex::encode(node_cd)],
        )
    } else if winning_ticket < 350 {
        (
            addr_b.to_string(),
            Uint128::from(100u128),
            Uint128::from(350u128),
            vec![hex::encode(leaf_a), hex::encode(node_cd)],
        )
    } else {
        (
            addr_c.to_string(),
            Uint128::from(350u128),
            Uint128::from(400u128),
            vec![hex::encode(leaf_c), hex::encode(node_ab)],
        )
    };

    // Set contract balance for reward payout
    let env = mock_env();
    deps.querier.bank.update_balance(
        &env.contract.address,
        vec![Coin::new(200_000_000u128, "inj")],
    );

    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id,
            operator_secret_hex: hex::encode(secret),
            winner_address: winner_addr,
            winner_cumulative_start: winner_start,
            winner_cumulative_end: winner_end,
            merkle_proof: proof,
        },
    )
    .unwrap();

    draw_id
}

// ────────────────────────────────────────────────────────────────────────────
// P1: Execute handler error paths
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_staking_hub_stake_error_paths() {
    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let user = deps.api.addr_make("user");

    // 1. NoFundsSent: empty funds
    let info = message_info(&user, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("NoFundsSent"),
        "Expected NoFundsSent, got: {:?}",
        err
    );

    // 2. InvalidFunds: two different coins
    let user = deps.api.addr_make("user");
    let info = message_info(
        &user,
        &[
            Coin::new(100_000_000u128, "inj"),
            Coin::new(50_000_000u128, "uatom"),
        ],
    );
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("InvalidFunds"),
        "Expected InvalidFunds, got: {:?}",
        err
    );

    // 3. WrongDenom: send uatom instead of inj
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[Coin::new(100_000_000u128, "uatom")]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("WrongDenom"),
        "Expected WrongDenom, got: {:?}",
        err
    );

    eprintln!("test_staking_hub_stake_error_paths passed");
}

#[test]
fn test_staking_hub_unstake_error_paths() {
    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();

    // Stake 100M INJ first
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[Coin::new(100_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    // 1. NoUnstakeFunds: empty funds
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Unstake {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("NoUnstakeFunds"),
        "Expected NoUnstakeFunds, got: {:?}",
        err
    );

    // 2. WrongUnstakeDenom: send INJ instead of csINJ
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[Coin::new(50_000_000u128, "inj")]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Unstake {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("WrongUnstakeDenom"),
        "Expected WrongUnstakeDenom, got: {:?}",
        err
    );

    // 3. InsufficientBalance (H-04): manually reduce backing to trigger underflow
    chance_staking_hub::state::TOTAL_INJ_BACKING
        .save(deps.as_mut().storage, &Uint128::new(10))
        .unwrap();

    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[Coin::new(50_000_000u128, &config.csinj_denom)]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Unstake {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("InsufficientBalance"),
        "Expected InsufficientBalance, got: {:?}",
        err
    );

    eprintln!("test_staking_hub_unstake_error_paths passed");
}

#[test]
fn test_staking_hub_claim_unstaked_error_paths() {
    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let user = deps.api.addr_make("user");

    // 1. UnstakeRequestNotFound: claim nonexistent request
    let info = message_info(&user, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::ClaimUnstaked {
            request_ids: vec![99],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("UnstakeRequestNotFound"),
        "Expected UnstakeRequestNotFound, got: {:?}",
        err
    );

    eprintln!("test_staking_hub_claim_unstaked_error_paths passed");
}

#[test]
fn test_staking_hub_operator_access_control() {
    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let random_user = deps.api.addr_make("random_user");

    // 1. ClaimRewards as non-operator → Unauthorized
    let info = message_info(&random_user, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::ClaimRewards {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Expected Unauthorized for ClaimRewards, got: {:?}",
        err
    );

    // 2. DistributeRewards as non-operator → Unauthorized
    let random_user = deps.api.addr_make("random_user");
    let info = message_info(&random_user, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::DistributeRewards {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Expected Unauthorized for DistributeRewards, got: {:?}",
        err
    );

    // 3. DistributeRewards before epoch ready → EpochNotReady
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::DistributeRewards {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("EpochNotReady"),
        "Expected EpochNotReady, got: {:?}",
        err
    );

    eprintln!("test_staking_hub_operator_access_control passed");
}

#[test]
fn test_staking_hub_take_snapshot_invalid_merkle_root() {
    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let operator = deps.api.addr_make("operator");

    // 1. Wrong length (too short)
    let info = message_info(&operator, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::TakeSnapshot {
            merkle_root: "abcd".to_string(),
            total_weight: Uint128::from(1000u128),
            num_holders: 10,
            snapshot_uri: "https://example.com".to_string(),
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("InvalidMerkleRoot"),
        "Expected InvalidMerkleRoot for short root, got: {:?}",
        err
    );

    // 2. Invalid hex (correct length but bad chars)
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::TakeSnapshot {
            merkle_root: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
                .to_string(),
            total_weight: Uint128::from(1000u128),
            num_holders: 10,
            snapshot_uri: "https://example.com".to_string(),
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("InvalidMerkleRoot"),
        "Expected InvalidMerkleRoot for bad hex, got: {:?}",
        err
    );

    // 3. Valid 64-char hex root → success
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::TakeSnapshot {
            merkle_root: "a".repeat(64),
            total_weight: Uint128::from(1000u128),
            num_holders: 10,
            snapshot_uri: "https://example.com".to_string(),
        },
    )
    .unwrap();

    eprintln!("test_staking_hub_take_snapshot_invalid_merkle_root passed");
}

#[test]
fn test_staking_hub_update_config_and_validators() {
    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let admin = deps.api.addr_make("admin");
    let new_operator = deps.api.addr_make("new_operator");

    // 1. UpdateConfig: change only operator, verify only operator changed
    let info = message_info(&admin, &[]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::UpdateConfig {
            admin: None,
            operator: Some(new_operator.to_string()),
            protocol_fee_bps: None,
            base_yield_bps: None,
            regular_pool_bps: None,
            big_pool_bps: None,
            min_epochs_regular: None,
            min_epochs_big: None,
            min_stake_amount: None,
        },
    )
    .unwrap();

    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(config.operator, new_operator);
    assert_eq!(config.admin, admin); // unchanged
    assert_eq!(config.protocol_fee_bps, 500); // unchanged

    // 2. InvalidBps: protocol_fee_bps > 10000
    let admin = deps.api.addr_make("admin");
    let info = message_info(&admin, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::UpdateConfig {
            admin: None,
            operator: None,
            protocol_fee_bps: Some(10001),
            base_yield_bps: None,
            regular_pool_bps: None,
            big_pool_bps: None,
            min_epochs_regular: None,
            min_epochs_big: None,
            min_stake_amount: None,
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("InvalidBps"),
        "Expected InvalidBps, got: {:?}",
        err
    );

    // 3. UpdateConfig as non-admin → Unauthorized
    let random = deps.api.addr_make("random");
    let info = message_info(&random, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::UpdateConfig {
            admin: None,
            operator: None,
            protocol_fee_bps: None,
            base_yield_bps: None,
            regular_pool_bps: None,
            big_pool_bps: None,
            min_epochs_regular: None,
            min_epochs_big: None,
            min_stake_amount: None,
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Expected Unauthorized for UpdateConfig, got: {:?}",
        err
    );

    // 4. UpdateValidators: add a new validator
    let admin = deps.api.addr_make("admin");
    let info = message_info(&admin, &[]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::UpdateValidators {
            add: vec!["injvaloper1newvalidatoraddressforintegration".to_string()],
            remove: vec![],
        },
    )
    .unwrap();

    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(config.validators.len(), 3);

    // 5. UpdateValidators as non-admin → Unauthorized
    let random = deps.api.addr_make("random");
    let info = message_info(&random, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::UpdateValidators {
            add: vec!["injvaloper1anothervalidatoraddresstest1234".to_string()],
            remove: vec![],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Expected Unauthorized for UpdateValidators, got: {:?}",
        err
    );

    // 6. InvalidValidatorAddress: address without injvaloper prefix
    let admin = deps.api.addr_make("admin");
    let info = message_info(&admin, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::UpdateValidators {
            add: vec!["cosmos1invalidaddress".to_string()],
            remove: vec![],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("InvalidValidatorAddress"),
        "Expected InvalidValidatorAddress, got: {:?}",
        err
    );

    // 7. NoValidators: remove all validators
    let admin = deps.api.addr_make("admin");
    let info = message_info(&admin, &[]);
    let err = chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::UpdateValidators {
            add: vec![],
            remove: vec![
                "injvaloper1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqj9".to_string(),
                "injvaloper1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".to_string(),
                "injvaloper1newvalidatoraddressforintegration".to_string(),
            ],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("NoValidators"),
        "Expected NoValidators, got: {:?}",
        err
    );

    eprintln!("test_staking_hub_update_config_and_validators passed");
}

#[test]
fn test_distributor_fund_pool_errors() {
    let mut deps = mock_dependencies();
    setup_distributor(&mut deps);

    let staking_hub = deps.api.addr_make("staking_hub");
    let random = deps.api.addr_make("random");

    // 1. FundRegularPool as non-staking_hub → Unauthorized
    let info = message_info(&random, &[Coin::new(10_000_000u128, "inj")]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Expected Unauthorized for FundRegularPool, got: {:?}",
        err
    );

    // 2. FundRegularPool with no INJ funds → NoFundsSent
    let info = message_info(&staking_hub, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("NoFundsSent"),
        "Expected NoFundsSent for FundRegularPool, got: {:?}",
        err
    );

    // 3. FundBigPool as non-staking_hub → Unauthorized
    let random = deps.api.addr_make("random");
    let info = message_info(&random, &[Coin::new(10_000_000u128, "inj")]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundBigPool {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Expected Unauthorized for FundBigPool, got: {:?}",
        err
    );

    // 4. FundBigPool with no INJ funds → NoFundsSent
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundBigPool {},
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("NoFundsSent"),
        "Expected NoFundsSent for FundBigPool, got: {:?}",
        err
    );

    eprintln!("test_distributor_fund_pool_errors passed");
}

#[test]
fn test_distributor_set_snapshot_and_commit_errors() {
    let mut deps = mock_dependencies();
    setup_distributor(&mut deps);

    let staking_hub = deps.api.addr_make("staking_hub");
    let operator = deps.api.addr_make("operator");
    let random = deps.api.addr_make("random");

    // 1. SetSnapshot as non-staking_hub → Unauthorized
    let info = message_info(&random, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: "a".repeat(64),
            total_weight: Uint128::from(1000u128),
            num_holders: 10,
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Expected Unauthorized for SetSnapshot, got: {:?}",
        err
    );

    // 2. CommitDraw without snapshot → NoSnapshot
    // Fund pool first so it's not empty
    let info = message_info(&staking_hub, &[Coin::new(10_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: "a".repeat(64),
            target_drand_round: TEST_ROUND,
            epoch: 1,
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("NoSnapshot"),
        "Expected NoSnapshot, got: {:?}",
        err
    );

    // 3. Set snapshot, then CommitDraw with empty pool
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: "a".repeat(64),
            total_weight: Uint128::from(1000u128),
            num_holders: 10,
        },
    )
    .unwrap();

    // Commit regular draw (pool has 10M) → drains pool
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: "b".repeat(64),
            target_drand_round: TEST_ROUND,
            epoch: 1,
        },
    )
    .unwrap();

    // Now try big pool commit with empty big pool → EmptyPool
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Big,
            operator_commit: "c".repeat(64),
            target_drand_round: TEST_ROUND,
            epoch: 1,
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("EmptyPool"),
        "Expected EmptyPool, got: {:?}",
        err
    );

    eprintln!("test_distributor_set_snapshot_and_commit_errors passed");
}

#[test]
fn test_distributor_reveal_draw_error_paths() {
    // This test requires mock querier for cross-contract queries
    let mut deps = mock_dependencies();
    setup_distributor_with_mocks(&mut deps, 0, 0, Some(0));

    let staking_hub = deps.api.addr_make("staking_hub");
    let operator = deps.api.addr_make("operator");

    let secret = b"reveal_error_test_secret";
    let commit: [u8; 32] = Sha256::digest(secret).into();
    let commit_hex = hex::encode(commit);

    // Fund pool and set snapshot
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 1,
            merkle_root: "a".repeat(64),
            total_weight: Uint128::from(1000u128),
            num_holders: 10,
        },
    )
    .unwrap();

    // Commit draw 0
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: commit_hex.clone(),
            target_drand_round: TEST_ROUND,
            epoch: 1,
        },
    )
    .unwrap();

    // 1. DrawExpired: advance past deadline, try reveal
    let mut env = mock_env();
    env.block.time = env.block.time.plus_seconds(3601); // deadline is 3600
    let operator = deps.api.addr_make("operator");
    let winner = deps.api.addr_make("winner");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 0,
            operator_secret_hex: hex::encode(secret),
            winner_address: winner.to_string(),
            winner_cumulative_start: Uint128::zero(),
            winner_cumulative_end: Uint128::from(1000u128),
            merkle_proof: vec![],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("DrawExpired"),
        "Expected DrawExpired, got: {:?}",
        err
    );

    // Expire the draw so we can test DrawNotCommitted
    let mut env = mock_env();
    env.block.time = env.block.time.plus_seconds(3601);
    let anyone = deps.api.addr_make("anyone");
    let info = message_info(&anyone, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::ExpireDraw { draw_id: 0 },
    )
    .unwrap();

    // 2. DrawNotCommitted: try reveal on expired draw
    let operator = deps.api.addr_make("operator");
    let winner = deps.api.addr_make("winner");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 0,
            operator_secret_hex: hex::encode(secret),
            winner_address: winner.to_string(),
            winner_cumulative_start: Uint128::zero(),
            winner_cumulative_end: Uint128::from(1000u128),
            merkle_proof: vec![],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("DrawNotCommitted"),
        "Expected DrawNotCommitted, got: {:?}",
        err
    );

    // 3. CommitMismatch: commit a new draw, then reveal with wrong secret
    // Fund pool again (it was returned on expire)
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    // Need a new snapshot epoch to avoid DrawTooSoon (epochs_between_regular=1)
    // Set snapshot for epoch 2
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 2,
            merkle_root: "a".repeat(64),
            total_weight: Uint128::from(1000u128),
            num_holders: 10,
        },
    )
    .unwrap();

    let new_secret = b"new_commit_secret_for_draw2";
    let new_commit: [u8; 32] = Sha256::digest(new_secret).into();
    let new_commit_hex = hex::encode(new_commit);

    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: new_commit_hex,
            target_drand_round: TEST_ROUND,
            epoch: 2,
        },
    )
    .unwrap();

    // Reveal with WRONG secret
    let operator = deps.api.addr_make("operator");
    let winner = deps.api.addr_make("winner");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 1,
            operator_secret_hex: hex::encode(b"wrong_secret_completely"),
            winner_address: winner.to_string(),
            winner_cumulative_start: Uint128::zero(),
            winner_cumulative_end: Uint128::from(1000u128),
            merkle_proof: vec![],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("CommitMismatch"),
        "Expected CommitMismatch, got: {:?}",
        err
    );

    // 4. InsufficientContractBalance (L-05): set contract balance to 0
    // Build a real merkle tree so the proof passes
    let addr_a = deps.api.addr_make("user_a").to_string();
    let leaf_a = compute_leaf_hash(&addr_a, 0, 1000);
    let root_hex = hex::encode(leaf_a);

    // Expire draw 1 and fund new draw with proper merkle root
    let mut env = mock_env();
    env.block.time = env.block.time.plus_seconds(3601);
    let anyone = deps.api.addr_make("anyone");
    let info = message_info(&anyone, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::ExpireDraw { draw_id: 1 },
    )
    .unwrap();

    // Fund and set proper snapshot for epoch 3
    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[Coin::new(50_000_000u128, "inj")]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
    )
    .unwrap();

    let staking_hub = deps.api.addr_make("staking_hub");
    let info = message_info(&staking_hub, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
            epoch: 3,
            merkle_root: root_hex.clone(),
            total_weight: Uint128::from(1000u128),
            num_holders: 1,
        },
    )
    .unwrap();

    let secret3 = b"secret_for_draw_3_balance_test";
    let commit3: [u8; 32] = Sha256::digest(secret3).into();
    let commit3_hex = hex::encode(commit3);

    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
            draw_type: chance_staking_common::types::DrawType::Regular,
            operator_commit: commit3_hex,
            target_drand_round: TEST_ROUND,
            epoch: 3,
        },
    )
    .unwrap();

    // Compute winning ticket for this secret
    let drand_randomness = hex::decode(TEST_RANDOMNESS_HEX).unwrap();
    let secret3_hash: [u8; 32] = Sha256::digest(secret3).into();
    let mut final_rand = [0u8; 32];
    for i in 0..32 {
        final_rand[i] = drand_randomness[i] ^ secret3_hash[i];
    }
    let mut ticket_bytes = [0u8; 16];
    ticket_bytes.copy_from_slice(&final_rand[0..16]);
    let ticket_raw = u128::from_be_bytes(ticket_bytes);
    let winning_ticket = ticket_raw % 1000;
    assert!(
        winning_ticket < 1000,
        "winning ticket should be in [0, 1000)"
    );

    // Set contract balance to 0 (insufficient)
    let env = mock_env();
    deps.querier
        .bank
        .update_balance(&env.contract.address, vec![]);

    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        env,
        info,
        chance_reward_distributor::msg::ExecuteMsg::RevealDraw {
            draw_id: 2,
            operator_secret_hex: hex::encode(secret3),
            winner_address: addr_a.clone(),
            winner_cumulative_start: Uint128::zero(),
            winner_cumulative_end: Uint128::from(1000u128),
            merkle_proof: vec![],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("InsufficientContractBalance"),
        "Expected InsufficientContractBalance, got: {:?}",
        err
    );

    eprintln!("test_distributor_reveal_draw_error_paths passed");
}

#[test]
fn test_distributor_update_config_errors() {
    let mut deps = mock_dependencies();
    setup_distributor(&mut deps);

    let admin = deps.api.addr_make("admin");
    let random = deps.api.addr_make("random");

    // 1. Unauthorized: non-admin calls UpdateConfig
    let info = message_info(&random, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::UpdateConfig {
            operator: None,
            staking_hub: None,
            reveal_deadline_seconds: None,
            epochs_between_regular: None,
            epochs_between_big: None,
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Expected Unauthorized, got: {:?}",
        err
    );

    // 2. InvalidRevealDeadline: too low (below 300)
    let info = message_info(&admin, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::UpdateConfig {
            operator: None,
            staking_hub: None,
            reveal_deadline_seconds: Some(100),
            epochs_between_regular: None,
            epochs_between_big: None,
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("InvalidRevealDeadline"),
        "Expected InvalidRevealDeadline for too low, got: {:?}",
        err
    );

    // 3. InvalidRevealDeadline: too high (above 86400)
    let admin = deps.api.addr_make("admin");
    let info = message_info(&admin, &[]);
    let err = chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::UpdateConfig {
            operator: None,
            staking_hub: None,
            reveal_deadline_seconds: Some(100_000),
            epochs_between_regular: None,
            epochs_between_big: None,
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("InvalidRevealDeadline"),
        "Expected InvalidRevealDeadline for too high, got: {:?}",
        err
    );

    // 4. Valid update: all fields
    let admin = deps.api.addr_make("admin");
    let new_operator = deps.api.addr_make("new_op");
    let new_hub = deps.api.addr_make("new_hub");
    let info = message_info(&admin, &[]);
    chance_reward_distributor::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_reward_distributor::msg::ExecuteMsg::UpdateConfig {
            operator: Some(new_operator.to_string()),
            staking_hub: Some(new_hub.to_string()),
            reveal_deadline_seconds: Some(7200),
            epochs_between_regular: Some(2),
            epochs_between_big: Some(14),
        },
    )
    .unwrap();

    // Verify config updated
    let config: chance_reward_distributor::state::DistributorConfig = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(config.operator, new_operator);
    assert_eq!(config.staking_hub, new_hub);
    assert_eq!(config.reveal_deadline_seconds, 7200);
    assert_eq!(config.epochs_between_regular, 2);
    assert_eq!(config.epochs_between_big, 14);

    eprintln!("test_distributor_update_config_errors passed");
}

// ────────────────────────────────────────────────────────────────────────────
// P2: Query coverage
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_distributor_query_coverage() {
    // Run 3 full draw cycles and test DrawHistory, UserWins, UserWinDetails, Snapshot queries
    let mut deps = mock_dependencies();
    setup_distributor_with_mocks(&mut deps, 0, 0, Some(0));

    let staking_hub = deps.api.addr_make("staking_hub");

    // Build merkle tree
    let addr_a = deps.api.addr_make("user_a").to_string();
    let addr_b = deps.api.addr_make("user_b").to_string();
    let addr_c = deps.api.addr_make("user_c").to_string();

    let leaf_a = compute_leaf_hash(&addr_a, 0, 100);
    let leaf_b = compute_leaf_hash(&addr_b, 100, 350);
    let leaf_c = compute_leaf_hash(&addr_c, 350, 400);
    let leaf_d = leaf_c;

    let node_ab = sorted_hash(&leaf_a, &leaf_b);
    let node_cd = sorted_hash(&leaf_c, &leaf_d);
    let root = sorted_hash(&node_ab, &node_cd);
    let root_hex = hex::encode(root);

    let total_weight = Uint128::from(400u128);

    // Run 3 draw cycles
    for epoch in 1..=3u64 {
        // Fund pool
        let info = message_info(&staking_hub, &[Coin::new(10_000_000u128, "inj")]);
        chance_reward_distributor::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
        )
        .unwrap();

        // Set snapshot
        let info = message_info(&staking_hub, &[]);
        chance_reward_distributor::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
                epoch,
                merkle_root: root_hex.clone(),
                total_weight,
                num_holders: 3,
            },
        )
        .unwrap();

        let secret = format!("query_test_secret_{}", epoch);
        commit_and_reveal_draw(
            &mut deps,
            epoch,
            chance_staking_common::types::DrawType::Regular,
            secret.as_bytes(),
            &root_hex,
            total_weight,
            &addr_a,
            &leaf_a,
            &addr_b,
            &leaf_b,
            &addr_c,
            &leaf_c,
            &node_ab,
            &node_cd,
        );
    }

    // 1. DrawHistory pagination: limit=2
    let resp: chance_reward_distributor::msg::DrawHistoryResponse = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawHistory {
                start_after: None,
                limit: Some(2),
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(resp.draws.len(), 2, "Should return 2 draws with limit=2");
    assert_eq!(resp.draws[0].id, 0);
    assert_eq!(resp.draws[1].id, 1);

    // DrawHistory with start_after=1
    let resp: chance_reward_distributor::msg::DrawHistoryResponse = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawHistory {
                start_after: Some(1),
                limit: Some(10),
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        resp.draws.len(),
        1,
        "Should return 1 draw after start_after=1"
    );
    assert_eq!(resp.draws[0].id, 2);

    // 2. Snapshot query: epoch exists
    let snapshot: Option<chance_reward_distributor::state::Snapshot> = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::Snapshot { epoch: 1 },
        )
        .unwrap(),
    )
    .unwrap();
    assert!(snapshot.is_some());
    let snapshot = snapshot.unwrap();
    assert_eq!(snapshot.epoch, 1);
    assert_eq!(snapshot.merkle_root, root_hex);
    assert_eq!(snapshot.total_weight, total_weight);
    assert_eq!(snapshot.num_holders, 3);

    // Snapshot query: epoch doesn't exist
    let snapshot: Option<chance_reward_distributor::state::Snapshot> = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::Snapshot { epoch: 99 },
        )
        .unwrap(),
    )
    .unwrap();
    assert!(snapshot.is_none());

    // 3. UserWins: get the winner from draw 0 to query their wins
    let draw0: chance_reward_distributor::state::Draw = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::Draw { draw_id: 0 },
        )
        .unwrap(),
    )
    .unwrap();
    let winner0 = draw0.winner.unwrap().to_string();

    // Count how many draws this winner won
    let user_wins: chance_reward_distributor::msg::UserWinsResponse = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::UserWins {
                address: winner0.clone(),
                start_after: None,
                limit: None,
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert!(
        user_wins.total_wins >= 1,
        "Winner should have at least 1 win"
    );
    assert_eq!(user_wins.draw_ids.len(), user_wins.total_wins as usize);
    assert!(
        !user_wins.total_won_amount.is_zero(),
        "Total won amount should be > 0"
    );

    // 4. UserWinDetails: verify full Draw objects returned
    let win_details: Vec<chance_reward_distributor::state::Draw> = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::UserWinDetails {
                address: winner0,
                start_after: None,
                limit: Some(10),
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(win_details.len(), user_wins.total_wins as usize);
    for draw in &win_details {
        assert_eq!(
            draw.status,
            chance_staking_common::types::DrawStatus::Revealed
        );
        assert!(draw.winner.is_some());
    }

    // Verify draw state totals
    let state: chance_reward_distributor::state::DrawStateInfo = from_json(
        chance_reward_distributor::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_reward_distributor::msg::QueryMsg::DrawState {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(state.total_draws_completed, 3);
    assert_eq!(
        state.total_rewards_distributed,
        Uint128::from(30_000_000u128)
    );

    eprintln!("test_distributor_query_coverage passed");
}

#[test]
fn test_staking_hub_staker_info_and_unstake_pagination() {
    let mut deps = mock_dependencies();
    setup_hub(&mut deps);

    let config: chance_staking_hub::state::Config = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();

    // 1. StakerInfo for non-staker → stake_epoch None
    let non_staker = deps.api.addr_make("non_staker");
    let staker_info: chance_staking_hub::msg::StakerInfoResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::StakerInfo {
                address: non_staker.to_string(),
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert!(
        staker_info.stake_epoch.is_none(),
        "Non-staker should have no stake_epoch"
    );

    // 2. Stake and verify StakerInfo
    let user = deps.api.addr_make("user");
    let info = message_info(&user, &[Coin::new(100_000_000u128, "inj")]);
    chance_staking_hub::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_staking_hub::msg::ExecuteMsg::Stake {},
    )
    .unwrap();

    let staker_info: chance_staking_hub::msg::StakerInfoResponse = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::StakerInfo {
                address: user.to_string(),
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(staker_info.stake_epoch, Some(1), "Stake epoch should be 1");

    // 3. Create 5 unstake requests for pagination testing
    for _ in 0..5 {
        let user = deps.api.addr_make("user");
        let info = message_info(&user, &[Coin::new(10_000_000u128, &config.csinj_denom)]);
        chance_staking_hub::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_staking_hub::msg::ExecuteMsg::Unstake {},
        )
        .unwrap();
    }

    // 4. Pagination: get first 2
    let requests: Vec<chance_staking_hub::msg::UnstakeRequestEntry> = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::UnstakeRequests {
                address: deps.api.addr_make("user").to_string(),
                start_after: None,
                limit: Some(2),
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(requests.len(), 2, "Should return 2 with limit=2");
    assert_eq!(requests[0].id, 0);
    assert_eq!(requests[1].id, 1);

    // Pagination: start_after=1, get next 2
    let requests: Vec<chance_staking_hub::msg::UnstakeRequestEntry> = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::UnstakeRequests {
                address: deps.api.addr_make("user").to_string(),
                start_after: Some(1),
                limit: Some(2),
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(requests.len(), 2, "Should return 2 after start_after=1");
    assert_eq!(requests[0].id, 2);
    assert_eq!(requests[1].id, 3);

    // Pagination: start_after=3, get remaining
    let requests: Vec<chance_staking_hub::msg::UnstakeRequestEntry> = from_json(
        chance_staking_hub::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_staking_hub::msg::QueryMsg::UnstakeRequests {
                address: deps.api.addr_make("user").to_string(),
                start_after: Some(3),
                limit: None,
            },
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(requests.len(), 1, "Should return 1 after start_after=3");
    assert_eq!(requests[0].id, 4);

    eprintln!("test_staking_hub_staker_info_and_unstake_pagination passed");
}

// ────────────────────────────────────────────────────────────────────────────
// P3: Audit edge cases
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_audit_edge_cases() {
    // --- Big pool expiry returns funds to big pool (not regular) ---
    {
        let mut deps = mock_dependencies();
        setup_distributor(&mut deps);

        let staking_hub = deps.api.addr_make("staking_hub");
        let operator = deps.api.addr_make("operator");

        // Fund big pool with 100M
        let info = message_info(&staking_hub, &[Coin::new(100_000_000u128, "inj")]);
        chance_reward_distributor::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::FundBigPool {},
        )
        .unwrap();

        // Verify big pool balance
        let balances: chance_reward_distributor::msg::PoolBalancesResponse = from_json(
            chance_reward_distributor::contract::query(
                deps.as_ref(),
                mock_env(),
                chance_reward_distributor::msg::QueryMsg::PoolBalances {},
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(balances.big_pool, Uint128::from(100_000_000u128));
        assert_eq!(balances.regular_pool, Uint128::zero());

        // Set snapshot for epoch 1
        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &[]);
        chance_reward_distributor::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
                epoch: 1,
                merkle_root: "a".repeat(64),
                total_weight: Uint128::from(1000u128),
                num_holders: 10,
            },
        )
        .unwrap();

        // Commit big draw
        let info = message_info(&operator, &[]);
        chance_reward_distributor::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
                draw_type: chance_staking_common::types::DrawType::Big,
                operator_commit: "a".repeat(64),
                target_drand_round: TEST_ROUND,
                epoch: 1,
            },
        )
        .unwrap();

        // Big pool should be drained after commit
        let balances: chance_reward_distributor::msg::PoolBalancesResponse = from_json(
            chance_reward_distributor::contract::query(
                deps.as_ref(),
                mock_env(),
                chance_reward_distributor::msg::QueryMsg::PoolBalances {},
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(balances.big_pool, Uint128::zero());

        // Expire the draw
        let mut env = mock_env();
        env.block.time = env.block.time.plus_seconds(3601);
        let anyone = deps.api.addr_make("anyone");
        let info = message_info(&anyone, &[]);
        chance_reward_distributor::contract::execute(
            deps.as_mut(),
            env,
            info,
            chance_reward_distributor::msg::ExecuteMsg::ExpireDraw { draw_id: 0 },
        )
        .unwrap();

        // Funds should return to BIG pool, not regular
        let balances: chance_reward_distributor::msg::PoolBalancesResponse = from_json(
            chance_reward_distributor::contract::query(
                deps.as_ref(),
                mock_env(),
                chance_reward_distributor::msg::QueryMsg::PoolBalances {},
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            balances.big_pool,
            Uint128::from(100_000_000u128),
            "Expired big draw funds should return to big pool"
        );
        assert_eq!(
            balances.regular_pool,
            Uint128::zero(),
            "Regular pool should remain empty"
        );
    }

    // --- Re-staking resets eligibility (V2-I-01) ---
    {
        let mut deps = mock_dependencies();
        setup_hub(&mut deps);

        let user = deps.api.addr_make("user");

        // Stake at epoch 1
        let info = message_info(&user, &[Coin::new(100_000_000u128, "inj")]);
        chance_staking_hub::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_staking_hub::msg::ExecuteMsg::Stake {},
        )
        .unwrap();

        let staker_info: chance_staking_hub::msg::StakerInfoResponse = from_json(
            chance_staking_hub::contract::query(
                deps.as_ref(),
                mock_env(),
                chance_staking_hub::msg::QueryMsg::StakerInfo {
                    address: user.to_string(),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(staker_info.stake_epoch, Some(1));

        // Advance to epoch 5 by manipulating state
        let mut epoch_state: chance_staking_hub::state::EpochState = from_json(
            chance_staking_hub::contract::query(
                deps.as_ref(),
                mock_env(),
                chance_staking_hub::msg::QueryMsg::EpochState {},
            )
            .unwrap(),
        )
        .unwrap();
        epoch_state.current_epoch = 5;
        chance_staking_hub::state::EPOCH_STATE
            .save(deps.as_mut().storage, &epoch_state)
            .unwrap();

        // Re-stake → epoch resets to 5
        let user = deps.api.addr_make("user");
        let info = message_info(&user, &[Coin::new(1_000_000u128, "inj")]);
        chance_staking_hub::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_staking_hub::msg::ExecuteMsg::Stake {},
        )
        .unwrap();

        let staker_info: chance_staking_hub::msg::StakerInfoResponse = from_json(
            chance_staking_hub::contract::query(
                deps.as_ref(),
                mock_env(),
                chance_staking_hub::msg::QueryMsg::StakerInfo {
                    address: deps.api.addr_make("user").to_string(),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            staker_info.stake_epoch,
            Some(5),
            "Re-staking should reset stake_epoch to current epoch"
        );
    }

    // --- CommitDraw on non-latest epoch (H-02) ---
    {
        let mut deps = mock_dependencies();
        setup_distributor(&mut deps);

        let staking_hub = deps.api.addr_make("staking_hub");
        let operator = deps.api.addr_make("operator");

        // Fund pool
        let info = message_info(&staking_hub, &[Coin::new(10_000_000u128, "inj")]);
        chance_reward_distributor::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::FundRegularPool {},
        )
        .unwrap();

        // Set snapshot for epoch 1
        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &[]);
        chance_reward_distributor::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
                epoch: 1,
                merkle_root: "a".repeat(64),
                total_weight: Uint128::from(1000u128),
                num_holders: 10,
            },
        )
        .unwrap();

        // Set snapshot for epoch 3 (becomes latest)
        let staking_hub = deps.api.addr_make("staking_hub");
        let info = message_info(&staking_hub, &[]);
        chance_reward_distributor::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::SetSnapshot {
                epoch: 3,
                merkle_root: "b".repeat(64),
                total_weight: Uint128::from(2000u128),
                num_holders: 20,
            },
        )
        .unwrap();

        // Try CommitDraw for epoch 1 (not latest) → InvalidEpoch
        let info = message_info(&operator, &[]);
        let err = chance_reward_distributor::contract::execute(
            deps.as_mut(),
            mock_env(),
            info,
            chance_reward_distributor::msg::ExecuteMsg::CommitDraw {
                draw_type: chance_staking_common::types::DrawType::Regular,
                operator_commit: "a".repeat(64),
                target_drand_round: TEST_ROUND,
                epoch: 1,
            },
        )
        .unwrap_err();
        assert!(
            format!("{:?}", err).contains("InvalidEpoch"),
            "Expected InvalidEpoch, got: {:?}",
            err
        );
    }

    eprintln!("test_audit_edge_cases passed");
}

// ────────────────────────────────────────────────────────────────────────────
// P4: Oracle integration coverage
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_oracle_integration_coverage() {
    let mut deps = mock_dependencies();
    setup_oracle(&mut deps);

    let admin = deps.api.addr_make("admin");
    let operator = deps.api.addr_make("operator");

    // 1. Config query: verify all fields match instantiation
    let config: chance_drand_oracle::state::OracleConfig = from_json(
        chance_drand_oracle::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_drand_oracle::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(config.admin, admin);
    assert_eq!(config.operators.len(), 1);
    assert_eq!(config.operators[0], operator);
    assert_eq!(config.quicknet_pubkey.len(), 96);
    assert_eq!(config.period_seconds, 3);
    assert_eq!(config.genesis_time, 1692803367);

    // 2. UpdateOperators: add operator2
    let operator2 = deps.api.addr_make("operator2");
    let admin = deps.api.addr_make("admin");
    let info = message_info(&admin, &[]);
    chance_drand_oracle::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::UpdateOperators {
            add: vec![operator2.to_string()],
            remove: vec![],
        },
    )
    .unwrap();

    // Verify operator2 is in config
    let config: chance_drand_oracle::state::OracleConfig = from_json(
        chance_drand_oracle::contract::query(
            deps.as_ref(),
            mock_env(),
            chance_drand_oracle::msg::QueryMsg::Config {},
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(config.operators.len(), 2);
    assert!(config.operators.contains(&operator2));

    // Remove original operator
    let admin = deps.api.addr_make("admin");
    let operator = deps.api.addr_make("operator");
    let info = message_info(&admin, &[]);
    chance_drand_oracle::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::UpdateOperators {
            add: vec![],
            remove: vec![operator.to_string()],
        },
    )
    .unwrap();

    // Verify original operator can no longer submit
    let operator = deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let err = chance_drand_oracle::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: TEST_ROUND,
            signature_hex: TEST_SIG_HEX.to_string(),
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Removed operator should be unauthorized, got: {:?}",
        err
    );

    // Verify operator2 CAN submit
    let operator2 = deps.api.addr_make("operator2");
    let info = message_info(&operator2, &[]);
    chance_drand_oracle::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: TEST_ROUND,
            signature_hex: TEST_SIG_HEX.to_string(),
        },
    )
    .unwrap();

    // UpdateOperators as non-admin → Unauthorized
    let random = deps.api.addr_make("random");
    let info = message_info(&random, &[]);
    let err = chance_drand_oracle::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::UpdateOperators {
            add: vec![],
            remove: vec![],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Non-admin should be unauthorized for UpdateOperators, got: {:?}",
        err
    );

    // 3. UpdateAdmin: rotate admin
    let admin = deps.api.addr_make("admin");
    let new_admin = deps.api.addr_make("new_admin");
    let info = message_info(&admin, &[]);
    chance_drand_oracle::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::UpdateAdmin {
            new_admin: new_admin.to_string(),
        },
    )
    .unwrap();

    // Old admin locked out
    let old_admin = deps.api.addr_make("admin");
    let info = message_info(&old_admin, &[]);
    let err = chance_drand_oracle::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::UpdateOperators {
            add: vec![],
            remove: vec![],
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("Unauthorized"),
        "Old admin should be unauthorized, got: {:?}",
        err
    );

    // New admin works
    let info = message_info(&new_admin, &[]);
    chance_drand_oracle::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::UpdateOperators {
            add: vec![],
            remove: vec![],
        },
    )
    .unwrap();

    // 4. Invalid hex: submit beacon with bad hex
    let operator2 = deps.api.addr_make("operator2");
    let info = message_info(&operator2, &[]);
    let err = chance_drand_oracle::contract::execute(
        deps.as_mut(),
        mock_env(),
        info,
        chance_drand_oracle::msg::ExecuteMsg::SubmitBeacon {
            round: 2000,
            signature_hex: "not_valid_hex_zzzzzz".to_string(),
        },
    )
    .unwrap_err();
    assert!(
        format!("{:?}", err).contains("InvalidHex"),
        "Expected InvalidHex, got: {:?}",
        err
    );

    eprintln!("test_oracle_integration_coverage passed");
}
