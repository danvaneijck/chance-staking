# Audit V2 — Fixes Applied

**Date:** 2026-02-12

This document tracks all code changes made to remediate findings from AUDIT_V2.md.

---

## V2-M-01: `BpsSumMismatch` error truncates total to u16

**Status:** Fixed

**Files modified:**
- `contracts/staking-hub/src/error.rs` — Changed `total` field from `u16` to `u32`
- `contracts/staking-hub/src/contract.rs` — Changed instantiate BPS sum to use `u32` arithmetic
- `contracts/staking-hub/src/execute.rs` — Removed `as u16` truncating cast in `update_config`

**Changes:**
```rust
// error.rs — Before:
total: u16,
// error.rs — After:
total: u32,

// contract.rs (instantiate) — Before:
let total_bps = msg.regular_pool_bps + msg.big_pool_bps + ...;  // u16 arithmetic
// contract.rs (instantiate) — After:
let total_bps = msg.regular_pool_bps as u32 + msg.big_pool_bps as u32 + ...;  // u32 arithmetic

// execute.rs (update_config) — Before:
total: total_bps as u16,
// execute.rs (update_config) — After:
total: total_bps,
```

---

## V2-M-02: `sync_delegations` doesn't update `EPOCH_STATE.total_staked`

**Status:** Fixed

**Files modified:**
- `contracts/staking-hub/src/execute.rs` — Added `EPOCH_STATE.total_staked` update in `sync_delegations`

**Changes:**
```rust
// Added after TOTAL_INJ_BACKING.save():
let mut epoch_state = EPOCH_STATE.load(deps.storage)?;
epoch_state.total_staked = total_delegated;
EPOCH_STATE.save(deps.storage, &epoch_state)?;
```

---

## V2-M-03: No validation on `reveal_deadline_seconds`

**Status:** Fixed

**Files modified:**
- `contracts/reward-distributor/src/execute.rs` — Added `validate_reveal_deadline()` function with constants
- `contracts/reward-distributor/src/contract.rs` — Added validation call in `instantiate`
- `contracts/reward-distributor/src/error.rs` — Added `InvalidRevealDeadline` error variant

**Changes:**
- Minimum: 300 seconds (5 minutes)
- Maximum: 86,400 seconds (24 hours)
- Enforced in both `instantiate` and `update_config`

```rust
pub const MIN_REVEAL_DEADLINE_SECS: u64 = 300;
pub const MAX_REVEAL_DEADLINE_SECS: u64 = 86400;

pub fn validate_reveal_deadline(value: u64) -> Result<(), ContractError> {
    if !(MIN_REVEAL_DEADLINE_SECS..=MAX_REVEAL_DEADLINE_SECS).contains(&value) {
        return Err(ContractError::InvalidRevealDeadline { value, min, max });
    }
    Ok(())
}
```

---

## V2-L-01: `take_snapshot` doesn't validate merkle_root format

**Status:** Fixed

**Files modified:**
- `contracts/staking-hub/src/execute.rs` — Added hex + length validation in `take_snapshot`
- `contracts/staking-hub/src/error.rs` — Added `InvalidMerkleRoot` error variant

**Changes:**
```rust
// Added at start of take_snapshot():
if merkle_root.len() != 64 {
    return Err(ContractError::InvalidMerkleRoot {
        reason: format!("expected 64 hex chars, got {}", merkle_root.len()),
    });
}
if hex::decode(&merkle_root).is_err() {
    return Err(ContractError::InvalidMerkleRoot {
        reason: "invalid hex encoding".to_string(),
    });
}
```

**Side effects:** Updated existing unit tests to use valid 64-character hex merkle roots.

---

## V2-L-02: Treasury fee uses `unwrap_or(zero)` instead of explicit math

**Status:** Fixed

**Files modified:**
- `contracts/staking-hub/src/execute.rs` — Changed to `saturating_sub` chain

**Changes:**
```rust
// Before:
let treasury_fee = total_rewards
    .checked_sub(regular_amount).unwrap_or(Uint128::zero())
    .checked_sub(big_amount).unwrap_or(Uint128::zero())
    .checked_sub(base_yield).unwrap_or(Uint128::zero());

// After:
let treasury_fee = total_rewards
    .saturating_sub(regular_amount)
    .saturating_sub(big_amount)
    .saturating_sub(base_yield);
```

---

## V2-L-03: No minimum stake amount

**Status:** Documented (no code fix)

This is a design consideration. Winning probability is proportional to stake weight, so the expected value for dust stakes is negligible. Adding a minimum would be a product decision rather than a security fix.

---

## V2-I-01: Re-staking resets eligibility

**Status:** Documented (by design)

This behavior is intentional per the existing code comments. Frontend should communicate this to users.

---

## Test Coverage Added

**Total tests: 77** (was 61)

### New unit tests (4):
| Contract | Test | Verifies |
|----------|------|----------|
| drand-oracle | `test_update_operators` | Add/remove operators, access control, deduplication |
| drand-oracle | `test_update_admin` | Admin rotation, old admin locked out |
| reward-distributor | `test_update_config` | Config updates, access control |
| reward-distributor | `test_reveal_deadline_bounds` | V2-M-03 fix — instantiate + update_config bounds |

### New integration tests (10):
| Test | Verifies |
|------|----------|
| `test_big_pool_draw_cycle` | Full big pool commit-reveal-payout cycle |
| `test_draw_too_soon_enforcement` | `DrawTooSoon` for both regular and big pools |
| `test_invalid_merkle_proof_rejected` | Tampered merkle proof → `InvalidMerkleProof` |
| `test_winning_ticket_out_of_range_rejected` | Wrong cumulative range → `WinningTicketOutOfRange` |
| `test_beacon_not_found_during_reveal` | Missing drand beacon → `BeaconNotFound` |
| `test_multiple_unstake_requests_per_user` | 3 unstake requests, individual + batch claim |
| `test_zero_rewards_distribution` | Epoch advances with zero surplus rewards |
| `test_exchange_rate_rounding_no_value_extraction` | No rounding profit from stake→unstake at rate > 1 |
| `test_concurrent_regular_and_big_draw` | Both draw types in same epoch |
| `test_double_claim_unstake_rejected` | `UnstakeAlreadyClaimed` on re-claim |
