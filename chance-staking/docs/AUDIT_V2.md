# Chance Staking — Security Audit V2

**Date:** 2026-02-12
**Scope:** All 3 smart contracts + shared common package
**Auditor:** Claude (AI-assisted review)
**Previous Audit:** AUDIT.md (17 findings, all remediated)

---

## Summary

This second-pass audit reviewed all contract logic post-V1 remediation, validated that V1 fixes are correctly implemented, and identified additional issues. The V1 fixes are confirmed correct. This audit found 3 Medium, 3 Low, and 1 Informational finding.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 3 |
| Informational | 1 |

---

## V1 Fix Verification

All 17 V1 findings were reviewed and confirmed correctly implemented:

- **C-01** (base yield double-counting): Base yield is now delegated to validators in `distribute_rewards`. Verified via `test_multi_epoch_base_yield_no_double_counting`.
- **C-02** (BPS invariant): BPS sum validated in `update_config`. Verified via `test_bps_sum_validation_in_update_config`.
- **H-01** (epoch duration): Time check enforced before `distribute_rewards`. Verified in integration tests.
- **H-02** (stale snapshot): `LATEST_SNAPSHOT_EPOCH` tracked and validated in `commit_draw`.
- **H-03** (zero weight): Zero total_weight rejected at commit time. Verified via `test_zero_total_weight_snapshot_rejected`.
- **H-04** (silent underflow): `checked_sub` with proper error handling in unstake and claim.
- **H-05** (slashing sync): `sync_delegations` function added with operator-only access control.
- **M-01** (snapshot overwrite): Duplicate check in `set_snapshot`. Verified via `test_snapshot_overwrite_prevented`.
- **M-02** (merkle domain separation): Leaf prefix `0x00`, internal node prefix `0x01` implemented in common package.
- **M-03** (migrate entry points): All 3 contracts have `migrate()` with version validation.
- **M-04** (validator validation): `injvaloper` prefix and length checks enforced.
- **L-01** (admin rotation): `UpdateAdmin` added to drand-oracle.
- **L-02** (operator discretion): Documented trade-off, no code fix needed.
- **L-03** (direct INJ transfers): Documented as feature.
- **L-04** (rounding dust): Treasury fee calculated as remainder.
- **L-05** (balance check): Contract balance verified before reward payout in `reveal_draw`.

---

## New Findings

### V2-M-01: `BpsSumMismatch` error truncates total to u16 [Medium]

**Location:** `contracts/staking-hub/src/error.rs:54`, `contracts/staking-hub/src/execute.rs:599`

**Description:**
The `BpsSumMismatch` error variant stores the `total` field as `u16`, but the BPS sum is computed as `u32` (line 587-590 of execute.rs). The cast `total_bps as u16` on line 599 silently truncates values exceeding 65535. While the logic check (`if total_bps != 10000`) correctly uses the `u32` value so the invariant is enforced, the error message displays an incorrect truncated total, making debugging difficult.

**Example:**
If an admin sets all four BPS fields summing to 70000, the error would report `total: 4464` (70000 mod 65536) instead of 70000.

**Impact:** Misleading error messages complicate debugging and operational monitoring.

**Fix:** Change `total` field from `u16` to `u32` and remove the truncating cast.

---

### V2-M-02: `sync_delegations` doesn't update `EPOCH_STATE.total_staked` [Medium]

**Location:** `contracts/staking-hub/src/execute.rs:672-723`

**Description:**
When `sync_delegations` reconciles `TOTAL_INJ_BACKING` with actual validator delegations after a slashing event, it updates `TOTAL_INJ_BACKING` and `EXCHANGE_RATE` but does **not** update `EPOCH_STATE.total_staked`. The `epoch_state` query returns this stale `total_staked` value to the frontend, which would display incorrect TVL data after a slashing event.

**Impact:** Frontend displays stale total staked amount after slashing. Could mislead users about protocol health.

**Fix:** Load `EPOCH_STATE`, update `total_staked = total_delegated`, and save back.

---

### V2-M-03: No validation on `reveal_deadline_seconds` in reward-distributor [Medium]

**Location:** `contracts/reward-distributor/src/execute.rs:604`

**Description:**
The `update_config` function in the reward-distributor allows setting `reveal_deadline_seconds` to any value without bounds checking:
- **Zero value:** Draws become immediately expirable after commit, making it impossible for the operator to reveal since `expire_draw` can be called by anyone.
- **Extremely high value:** Funds could be locked in committed (unrevealed) draws for an unreasonable period with no way to recover them until the deadline passes.

This also applies to the initial instantiation — no bounds check there either.

**Impact:** Misconfiguration could permanently lock pool funds or make draws impossible to complete.

**Fix:** Add minimum (300 seconds) and maximum (86400 seconds) bounds. Enforce in both `instantiate` and `update_config`.

---

### V2-L-01: `take_snapshot` doesn't validate merkle_root format [Low]

**Location:** `contracts/staking-hub/src/execute.rs:497`

**Description:**
The `merkle_root` parameter in `take_snapshot` is stored as a plain `String` without any validation. It should be:
- Valid hex encoding
- Exactly 64 characters (representing 32 bytes / SHA-256 hash)

An invalid merkle root (e.g., non-hex characters, wrong length) would be stored and forwarded to the reward-distributor. All subsequent `reveal_draw` calls referencing this snapshot would fail at merkle proof verification, with no clear error pointing to the root cause.

**Impact:** Operator misconfiguration would silently break draw reveals for the affected epoch. Funds committed to draws in that epoch would be locked until the reveal deadline expires, then returned to the pool.

**Fix:** Validate that merkle_root is valid hex and exactly 64 characters before storing.

---

### V2-L-02: Treasury fee calculation uses silent fallback instead of checked math [Low]

**Location:** `contracts/staking-hub/src/execute.rs:371-377`

**Description:**
The remainder calculation for treasury fee uses `unwrap_or(Uint128::zero())` on three chained `checked_sub` calls:

```rust
let treasury_fee = total_rewards
    .checked_sub(regular_amount)
    .unwrap_or(Uint128::zero())
    .checked_sub(big_amount)
    .unwrap_or(Uint128::zero())
    .checked_sub(base_yield)
    .unwrap_or(Uint128::zero());
```

Since `multiply_ratio` truncates (rounds down), the sum `regular + big + base_yield` should always be `<= total_rewards`, making the checked_sub calls safe. However, the `unwrap_or(Uint128::zero())` pattern silently swallows any underflow rather than surfacing it as an error. If a future code change introduces a rounding issue, the treasury would silently receive zero instead of the correct amount.

**Impact:** Low — current math is correct. Risk is that future changes could introduce silent bugs.

**Fix:** Replace `unwrap_or(Uint128::zero())` with `saturating_sub` to make the intent explicit, or use `checked_sub` with proper error propagation.

---

### V2-L-03: No minimum stake amount enforced [Low]

**Location:** `contracts/staking-hub/src/execute.rs:36-121`

**Description:**
Users can stake as little as 1 wei of INJ. This creates a valid position in the protocol but may result in:
- Zero-amount delegations to validators (which are skipped, so no chain error)
- A snapshot entry with essentially zero weight
- Marginal gas costs for the protocol to track these positions

The winning probability is proportional to stake weight, so tiny stakes have negligible chance of winning. However, at very large pool sizes, the expected value could exceed the gas cost of staking.

**Impact:** Low — no direct security risk. Dust positions add minor overhead.

**Note:** Consider whether to add a configurable minimum stake (e.g., 0.001 INJ) to reduce dust.

---

### V2-I-01: Re-staking resets eligibility clock entirely [Informational]

**Location:** `contracts/staking-hub/src/execute.rs:87`

**Description:**
When a user calls `stake()`, their `USER_STAKE_EPOCH` is unconditionally overwritten with the current epoch. This means a user who has been staking since epoch 1 and adds any amount (even 1 wei) at epoch 50 will have their eligibility clock reset to epoch 50.

This is documented as intentional ("resets on every stake so that newly added funds must also satisfy the min_epochs eligibility requirement"), but the UX implication is significant: users must be clearly warned that any additional stake resets their draw eligibility timer.

**Impact:** Informational — by design, but could frustrate users who are unaware.

**Recommendation:** Ensure frontend clearly communicates this behavior before allowing additional stakes.

---

## Test Coverage Gaps Identified

The following scenarios were not covered by existing tests and have been added:

| # | Test | Status |
|---|------|--------|
| 1 | Big pool draw full cycle | Added |
| 2 | `DrawTooSoon` epoch spacing enforcement | Added |
| 3 | Invalid merkle proof rejection in reveal | Added |
| 4 | Winning ticket out of range rejection | Added |
| 5 | Beacon not found during reveal | Added |
| 6 | Multiple unstake requests per user | Added |
| 7 | Zero rewards distribution (epoch advances with no surplus) | Added |
| 8 | Exchange rate rounding — no value extraction | Added |
| 9 | Concurrent regular + big draw in same epoch | Added |
| 10 | Double claim unstake rejection | Added |
| 11 | Drand oracle: UpdateOperators + UpdateAdmin | Added |
| 12 | Reward distributor: UpdateConfig | Added |
