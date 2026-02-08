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
fn sorted_hash(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
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
    let msg = oracle_instantiate_msg(&operator.to_string());
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
        validators: vec!["val1".to_string(), "val2".to_string()],
        epoch_duration_seconds: 86400,
        protocol_fee_bps: 500,
        treasury: mock_api.addr_make("treasury").to_string(),
        base_yield_bps: 500,
        regular_pool_bps: 7000,
        big_pool_bps: 2000,
        csinj_subdenom: "csINJ".to_string(),
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
    let env = mock_env();
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

    // Configure the mock querier to respond to drand oracle beacon queries
    let beacon_binary = beacon_query_res.clone();
    dist_deps.querier.update_wasm(move |query| {
        match query {
            WasmQuery::Smart { msg, .. } => {
                // Try to parse as oracle query
                let parsed: Result<chance_reward_distributor::msg::OracleQueryMsg, _> =
                    from_json(msg);
                if let Ok(chance_reward_distributor::msg::OracleQueryMsg::Beacon { .. }) = parsed {
                    SystemResult::Ok(ContractResult::Ok(beacon_binary.clone()))
                } else {
                    SystemResult::Err(cosmwasm_std::SystemError::InvalidRequest {
                        error: "Unknown query".to_string(),
                        request: Default::default(),
                    })
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
    let operator = dist_deps.api.addr_make("operator");
    let info = message_info(&operator, &[]);
    let res = chance_reward_distributor::contract::execute(
        dist_deps.as_mut(),
        mock_env(),
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
        WasmQuery::Smart { .. } => SystemResult::Ok(ContractResult::Ok(beacon_response.clone())),
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
        let operator = dist_deps.api.addr_make("operator");
        let info = message_info(&operator, &[]);
        chance_reward_distributor::contract::execute(
            dist_deps.as_mut(),
            mock_env(),
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
