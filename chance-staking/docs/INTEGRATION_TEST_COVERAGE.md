# Integration Test Coverage Report

## Summary

| Metric | Before | After |
|---|---|---|
| Integration tests | 28 | 42 |
| Unit tests | 54 | 54 |
| Total tests | 82 | 96 |
| Integration tests added | — | +14 |

## Full Integration Test Inventory

### Oracle Tests (2)
| Test | What it covers |
|---|---|
| `test_drand_beacon_verification` | Submit beacon, query, wrong round, duplicate, unauthorized |
| `test_oracle_integration_coverage` | **NEW** Config query, UpdateOperators (add/remove/dedup/ACL), UpdateAdmin (rotation/lockout), InvalidHex |

### Staking Hub Tests (18)
| Test | What it covers |
|---|---|
| `test_unstake_flow` | Full stake → unstake → claim lifecycle, unlock time enforcement |
| `test_exchange_rate_appreciation` | Rate increase from rewards, later stakers get fewer csINJ |
| `test_slashing_detection_via_sync_delegations` | SyncDelegations access control |
| `test_multi_epoch_base_yield_no_double_counting` | 5-epoch monotonic rate increase (C-01) |
| `test_bps_sum_validation_in_update_config` | BPS sum must = 10000 (C-02) |
| `test_large_stake_amounts_no_overflow` | 1B INJ stake without overflow |
| `test_cross_contract_balance_reconciliation` | Multi-user stake/unstake backing sync (H-04) |
| `test_multiple_unstake_requests_per_user` | 3 unstake requests, individual + batch claims |
| `test_zero_rewards_distribution` | Epoch advance with zero surplus |
| `test_min_stake_amount_enforcement` | Min stake below/at/above threshold |
| `test_min_stake_amount_update_via_config` | Dynamic min stake via admin config |
| `test_staking_hub_stake_error_paths` | **NEW** NoFundsSent, InvalidFunds, WrongDenom |
| `test_staking_hub_unstake_error_paths` | **NEW** NoUnstakeFunds, WrongUnstakeDenom, InsufficientBalance (H-04) |
| `test_staking_hub_claim_unstaked_error_paths` | **NEW** UnstakeRequestNotFound |
| `test_staking_hub_operator_access_control` | **NEW** ClaimRewards unauthorized, DistributeRewards unauthorized, EpochNotReady |
| `test_staking_hub_take_snapshot_invalid_merkle_root` | **NEW** InvalidMerkleRoot wrong length, bad hex, valid root (V2-L-01) |
| `test_staking_hub_update_config_and_validators` | **NEW** Individual field update, InvalidBps, UpdateValidators add/remove/ACL, InvalidValidatorAddress, NoValidators |
| `test_staking_hub_staker_info_and_unstake_pagination` | **NEW** StakerInfo query (staker/non-staker), UnstakeRequests pagination |

### Reward Distributor Tests (17)
| Test | What it covers |
|---|---|
| `test_expired_draw` | Draw expiry timing, funds returned to pool |
| `test_full_stake_and_draw_cycle` | Full e2e commit-reveal with real merkle tree |
| `test_merkle_proof_verification_e2e` | Merkle tree construction, proof verify/reject |
| `test_multiple_draws_across_epochs` | 3 epochs, pool drain/refund cycle |
| `test_big_pool_draw_cycle` | Full big pool commit-reveal-payout |
| `test_draw_too_soon_enforcement` | DrawTooSoon regular/big, H-02 latest snapshot |
| `test_invalid_merkle_proof_rejected` | Tampered proof rejection |
| `test_winning_ticket_out_of_range_rejected` | Wrong cumulative range |
| `test_beacon_not_found_during_reveal` | Missing drand beacon |
| `test_reveal_draw_rejects_ineligible_winner` | min_epochs eligibility fail |
| `test_reveal_draw_accepts_eligible_winner` | min_epochs eligibility pass |
| `test_concurrent_regular_and_big_draw` | Same-epoch regular + big draws |
| `test_double_claim_unstake_rejected` | Re-claim prevention |
| `test_distributor_fund_pool_errors` | **NEW** FundRegularPool/FundBigPool unauthorized + NoFundsSent |
| `test_distributor_set_snapshot_and_commit_errors` | **NEW** SetSnapshot unauthorized, CommitDraw NoSnapshot, EmptyPool |
| `test_distributor_reveal_draw_error_paths` | **NEW** DrawExpired, DrawNotCommitted, CommitMismatch, InsufficientContractBalance (L-05) |
| `test_distributor_update_config_errors` | **NEW** Unauthorized, InvalidRevealDeadline bounds (V2-M-03), valid update |

### Cross-cutting Tests (5)
| Test | What it covers |
|---|---|
| `test_exchange_rate_rounding_no_value_extraction` | Rounding exploit prevention |
| `test_zero_total_weight_snapshot_rejected` | Zero weight draw prevention (H-03) |
| `test_snapshot_overwrite_prevented` | Snapshot immutability (M-01) |
| `test_distributor_query_coverage` | **NEW** DrawHistory pagination, UserWins, UserWinDetails, Snapshot query |
| `test_audit_edge_cases` | **NEW** Big pool expiry → big pool refund, re-stake resets eligibility (V2-I-01), CommitDraw on non-latest epoch (H-02) |

---

## Execute Handler Coverage Matrix

### drand-oracle

| Handler | Happy Path | Error Paths | Covered |
|---|---|---|---|
| SubmitBeacon | ✅ | Unauthorized ✅, BeaconAlreadyExists ✅, VerificationFailed ✅, InvalidHex ✅ | Full |
| UpdateOperators | ✅ | Unauthorized ✅ | Full |
| UpdateAdmin | ✅ | Unauthorized ✅ | Full |

### staking-hub

| Handler | Happy Path | Error Paths | Covered |
|---|---|---|---|
| Stake | ✅ | NoFundsSent ✅, InvalidFunds ✅, WrongDenom ✅, StakeBelowMinimum ✅ | Full |
| Unstake | ✅ | NoUnstakeFunds ✅, WrongUnstakeDenom ✅, InsufficientBalance ✅ | Full |
| ClaimUnstaked | ✅ | UnstakeRequestNotFound ✅, UnstakeNotUnlocked ✅, UnstakeAlreadyClaimed ✅ | Full |
| ClaimRewards | ✅ | Unauthorized ✅ | Full* |
| DistributeRewards | ✅ | Unauthorized ✅, EpochNotReady ✅ | Full |
| TakeSnapshot | ✅ | Unauthorized ✅, SnapshotAlreadyTaken ✅, InvalidMerkleRoot ✅ | Full |
| UpdateConfig | ✅ | Unauthorized ✅, InvalidBps ✅, BpsSumMismatch ✅ | Full |
| UpdateValidators | ✅ | Unauthorized ✅, InvalidValidatorAddress ✅, NoValidators ✅ | Full |
| SyncDelegations | ✅ | Unauthorized ✅ | Partial** |

### reward-distributor

| Handler | Happy Path | Error Paths | Covered |
|---|---|---|---|
| FundRegularPool | ✅ | Unauthorized ✅, NoFundsSent ✅ | Full |
| FundBigPool | ✅ | Unauthorized ✅, NoFundsSent ✅ | Full |
| SetSnapshot | ✅ | Unauthorized ✅, SnapshotAlreadyExists ✅ | Full |
| CommitDraw | ✅ | Unauthorized ✅, NoSnapshot ✅, InvalidEpoch ✅, ZeroWeight ✅, DrawTooSoon ✅, EmptyPool ✅ | Full |
| RevealDraw | ✅ | DrawNotFound ✅, DrawNotCommitted ✅, DrawExpired ✅, CommitMismatch ✅, BeaconNotFound ✅, WinningTicketOutOfRange ✅, InvalidMerkleProof ✅, WinnerNotEligible ✅, InsufficientContractBalance ✅ | Full |
| ExpireDraw | ✅ | DrawNotCommitted ✅, DrawNotExpired ✅ | Full |
| UpdateConfig | ✅ | Unauthorized ✅, InvalidRevealDeadline ✅ | Full |

## Query Coverage Matrix

### staking-hub

| Query | Tested | Notes |
|---|---|---|
| Config | ✅ | Multiple tests |
| EpochState | ✅ | Multiple tests |
| ExchangeRate | ✅ | Multiple tests |
| UnstakeRequests | ✅ | Including pagination (start_after, limit) |
| StakerInfo | ✅ | Staker and non-staker cases |

### reward-distributor

| Query | Tested | Notes |
|---|---|---|
| Config | ✅ | After update_config |
| DrawState | ✅ | Multiple tests |
| Draw | ✅ | By draw_id |
| DrawHistory | ✅ | With pagination (limit, start_after) |
| PoolBalances | ✅ | Multiple tests |
| UserWins | ✅ | After multi-draw cycles |
| UserWinDetails | ✅ | Full Draw objects returned |
| VerifyInclusion | ✅ | Valid and invalid proofs |
| Snapshot | ✅ | Existing and non-existing epochs |

### drand-oracle

| Query | Tested | Notes |
|---|---|---|
| Config | ✅ | Field verification after instantiate |
| Beacon | ✅ | After submission |
| LatestRound | ✅ | After submission |

## Audit Finding Coverage

| Finding | Severity | Test Coverage |
|---|---|---|
| C-01: Base yield double-counting | Critical | `test_multi_epoch_base_yield_no_double_counting` |
| C-02: BPS invariant not enforced | Critical | `test_bps_sum_validation_in_update_config` |
| H-01: Epoch duration not checked | High | `test_staking_hub_operator_access_control` (EpochNotReady) |
| H-02: Stale snapshot issue | High | `test_draw_too_soon_enforcement`, `test_audit_edge_cases` (InvalidEpoch) |
| H-03: Zero weight snapshot | High | `test_zero_total_weight_snapshot_rejected` |
| H-04: Silent underflow in unstake | High | `test_staking_hub_unstake_error_paths` (InsufficientBalance), `test_cross_contract_balance_reconciliation` |
| H-05: Slashing not synced | High | `test_slashing_detection_via_sync_delegations` |
| M-01: Snapshot overwrite | Medium | `test_snapshot_overwrite_prevented` |
| M-02: Merkle domain separation | Medium | All merkle tests use 0x01 prefix |
| M-04: Validator validation | Medium | `test_staking_hub_update_config_and_validators` (InvalidValidatorAddress) |
| L-01: Admin rotation | Low | `test_oracle_integration_coverage` (UpdateAdmin) |
| L-04: Rounding dust | Low | `test_exchange_rate_rounding_no_value_extraction` |
| L-05: Balance check | Low | `test_distributor_reveal_draw_error_paths` (InsufficientContractBalance) |
| V2-M-01: BpsSumMismatch truncation | Medium | `test_bps_sum_validation_in_update_config` |
| V2-M-02: sync_delegations total_staked | Medium | `test_slashing_detection_via_sync_delegations` |
| V2-M-03: reveal_deadline bounds | Medium | `test_distributor_update_config_errors` (InvalidRevealDeadline) |
| V2-L-01: merkle_root validation | Low | `test_staking_hub_take_snapshot_invalid_merkle_root` |
| V2-I-01: Re-stake resets eligibility | Info | `test_audit_edge_cases` (stake_epoch reset) |

## Remaining Gaps

These are paths that **cannot be tested** via mock-based integration tests:

1. **NoValidators in ClaimRewards**: Requires clearing validators after instantiation via direct state manipulation, but already covered by unit test `test_claim_rewards_unauthorized` indirectly.
2. **Actual delegation queries in SyncDelegations**: MockQuerier doesn't support staking queries out of the box. The unit test `test_update_validators_with_redelegation` covers redelegation logic.
3. **Token Factory mint/burn**: Injective-specific messages are tested as submessages in the response but not executed in mock environment.
4. **Real cross-contract message execution**: Mock-based tests verify messages are produced but don't execute them across contracts.

*\* ClaimRewards NoValidators error requires direct state manipulation; covered by unit test.*
*\*\* SyncDelegations actual sync logic requires staking query mocks not available in standard MockQuerier.*
