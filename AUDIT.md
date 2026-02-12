# Chance Staking Security Audit Report

**Date:** 2026-02-12
**Scope:** All 3 smart contracts + shared package
- `contracts/drand-oracle/`
- `contracts/staking-hub/`
- `contracts/reward-distributor/`
- `packages/chance-staking-common/`

**Methodology:** Manual code review of all Rust source files, cross-contract interaction analysis, integration test review.

---

## Summary of Findings

| ID | Severity | Contract | Title |
|----|----------|----------|-------|
| C-01 | Critical | staking-hub | Base yield INJ double-counted across epochs |
| C-02 | Critical | staking-hub | BPS invariant not enforced in `update_config` |
| H-01 | High | staking-hub | No epoch duration enforcement |
| H-02 | High | reward-distributor | `commit_draw` does not validate epoch is current |
| H-03 | High | reward-distributor | Zero `total_weight` snapshot causes division-by-zero panic |
| H-04 | High | staking-hub | Silent underflow in `unstake` accounting |
| H-05 | High | staking-hub | No slashing detection or accounting |
| M-01 | Medium | reward-distributor | Snapshots can be overwritten after draw commit |
| M-02 | Medium | common | No domain separation in merkle tree hashing |
| M-03 | Medium | all | No `migrate` entry point on any contract |
| M-04 | Medium | staking-hub | Validator addresses stored as unvalidated strings |
| M-05 | Medium | staking-hub | `distribute_rewards` does not re-stake base yield |
| L-01 | Low | drand-oracle | No admin rotation mechanism |
| L-02 | Low | reward-distributor | Operator has free option to abort unfavorable draws |
| L-03 | Low | staking-hub | Direct INJ transfers inflate next epoch's rewards |
| L-04 | Low | staking-hub | Rounding dust from BPS calculations accumulates |
| L-05 | Low | reward-distributor | No check that contract balance covers reward payout |

---

## Critical

### C-01: Base yield INJ double-counted across epochs

**File:** `contracts/staking-hub/src/execute.rs:358-376`

**Description:**
In `distribute_rewards`, the base yield portion of rewards is added to `TOTAL_INJ_BACKING` (line 368-369) but the corresponding INJ is **never sent or staked** — it remains in the contract balance. On the next epoch's `distribute_rewards` call, the contract reads its full INJ balance and subtracts only `PENDING_UNSTAKE_TOTAL`. The leftover base yield INJ from previous epochs is indistinguishable from new staking rewards and gets re-distributed.

**Impact:**
- Each epoch's base yield gets counted as rewards again in subsequent epochs, compounding over time.
- The exchange rate appreciates faster than actual staking yields, creating an undercollateralized system.
- Late unstakers may find that the contract cannot fulfill their claims because `TOTAL_INJ_BACKING` overstates the actual available INJ.

**Trace:**
```
Epoch 1: 100 INJ staked. Rewards = 10 INJ.
  base_yield = 10 * 5% = 0.5 INJ (stays in contract)
  sent out = 9.5 INJ (regular + big + treasury)
  Contract balance after = 0.5 INJ

Epoch 2: New rewards = 10 INJ. Contract balance = 10.5 INJ.
  total_rewards = 10.5 - 0 (pending) = 10.5
  base_yield = 10.5 * 5% = 0.525 INJ ← 0.5 of this is old base yield being re-counted
```

**Recommendation:**
After computing `base_yield`, delegate it to validators (same round-robin logic as `stake`). This removes it from the contract balance and ensures it genuinely backs the exchange rate. Alternatively, track accumulated undelegated base yield in a separate state item and subtract it alongside `PENDING_UNSTAKE_TOTAL`.

---

### C-02: BPS invariant not enforced in `update_config`

**File:** `contracts/staking-hub/src/execute.rs:506-550`

**Description:**
During instantiation, the contract validates that `regular_pool_bps + big_pool_bps + base_yield_bps + protocol_fee_bps == 10000`. However, `update_config` only validates that the new `protocol_fee_bps` value is `<= 10000` individually (line 532). It does not check that the four BPS fields still sum to 10000 after the update.

**Impact:**
- If the admin sets `protocol_fee_bps` to a value that makes the sum > 10000: `distribute_rewards` will attempt to send more INJ than available, causing every epoch advancement to fail permanently until config is corrected.
- If the sum < 10000: undistributed rewards accumulate in the contract and get double-counted as rewards next epoch (same as C-01).

**Recommendation:**
Re-validate the BPS sum after any config update. Also expose `base_yield_bps`, `regular_pool_bps`, and `big_pool_bps` in `update_config` so the admin can adjust all four fields atomically.

---

## High

### H-01: No epoch duration enforcement

**File:** `contracts/staking-hub/src/execute.rs:335-435`

**Description:**
The `EpochNotReady` error is defined in `error.rs` but **never used**. The `epoch_duration_seconds` config field is stored but **never checked**. The operator can call `claim_rewards` followed by `distribute_rewards` in rapid succession, advancing epochs as fast as blocks are produced.

**Impact:**
- A malicious or compromised operator can advance epochs rapidly, taking snapshots and committing draws before users can react.
- Combined with the draw system, rapid epoch advancement could manipulate who is eligible for draws.

**Recommendation:**
Add a time check in `distribute_rewards`:
```rust
if env.block.time < epoch_state.epoch_start_time.plus_seconds(config.epoch_duration_seconds) {
    return Err(ContractError::EpochNotReady);
}
```

---

### H-02: `commit_draw` does not validate epoch is current

**File:** `contracts/reward-distributor/src/execute.rs:134-252`

**Description:**
The `commit_draw` function accepts an `epoch` parameter from the operator and only checks that a snapshot exists for that epoch (line 155). It does not verify that the epoch is the current one from the staking hub. The operator can commit draws using snapshots from **any** past epoch.

**Impact:**
An operator could commit a draw using an old epoch's snapshot where a particular user had a larger weight, manipulating the probability distribution in favor of that user.

**Recommendation:**
Either query the staking hub for the current epoch and validate against it, or store the latest epoch when `set_snapshot` is called and only allow commits for that epoch.

---

### H-03: Zero `total_weight` snapshot causes division-by-zero panic

**File:** `contracts/reward-distributor/src/execute.rs:352`

**Description:**
In `reveal_draw`, the winning ticket is computed as:
```rust
let winning_ticket = ticket_raw % total_weight.u128();
```
If a snapshot has `total_weight = 0` (e.g., no stakers), this performs `% 0` which panics in Rust. A committed draw with a zero-weight snapshot can never be revealed, and the funds are locked until the reveal deadline expires.

**Impact:**
- Draw funds locked for the duration of the reveal deadline.
- If the operator repeatedly commits draws with zero-weight snapshots, funds are repeatedly locked (temporary DoS).

**Recommendation:**
Add a check in `commit_draw` or `set_snapshot`:
```rust
if total_weight.is_zero() {
    return Err(ContractError::ZeroWeight);
}
```

---

### H-04: Silent underflow in `unstake` accounting

**File:** `contracts/staking-hub/src/execute.rs:157-167`

**Description:**
When unstaking, the new backing and supply are computed with `checked_sub(...).unwrap_or(Uint128::zero())`:
```rust
let new_backing = TOTAL_INJ_BACKING.load(deps.storage)?
    .checked_sub(inj_amount)
    .unwrap_or(Uint128::zero());
```
If an accounting inconsistency causes `inj_amount > TOTAL_INJ_BACKING`, the contract silently sets backing to zero instead of erroring.

**Impact:**
- Masks underlying accounting bugs (like C-01) instead of failing loudly.
- If backing is set to zero while supply is nonzero, the exchange rate becomes zero, preventing further stakes from minting csINJ.
- Could result in incorrect exchange rates affecting all users.

**Recommendation:**
Replace `unwrap_or(Uint128::zero())` with a proper error:
```rust
let new_backing = TOTAL_INJ_BACKING.load(deps.storage)?
    .checked_sub(inj_amount)
    .map_err(|_| ContractError::InsufficientBalance)?;
```

---

### H-05: No slashing detection or accounting

**File:** `contracts/staking-hub/src/state.rs`, `execute.rs`

**Description:**
The contract tracks `TOTAL_INJ_BACKING` independently from actual validator delegations. If a validator is slashed (e.g., for downtime or double-signing), the actual delegated amount decreases, but `TOTAL_INJ_BACKING` remains unchanged.

**Impact:**
- The exchange rate (`TOTAL_INJ_BACKING / TOTAL_CSINJ_SUPPLY`) overstates the real backing.
- Users who unstake after a slashing event receive more INJ than actually available.
- The last users to unstake may find insufficient INJ in the contract.

**Recommendation:**
Before computing the exchange rate or distributing rewards, query actual validator delegations and reconcile with `TOTAL_INJ_BACKING`. Consider adding a `sync_delegations` function that an operator can call to adjust the backing after slashing events.

---

## Medium

### M-01: Snapshots can be overwritten after draw commit

**File:** `contracts/reward-distributor/src/execute.rs:94-129`

**Description:**
The `set_snapshot` function unconditionally saves the snapshot for a given epoch, with no check for whether a snapshot already exists or whether draws have been committed using the existing snapshot. If the staking hub calls `set_snapshot` for an epoch that already has a committed draw, the merkle root changes and the committed draw's reveal will fail (the operator's precomputed winner proof won't match).

**Impact:**
If the staking hub calls `set_snapshot` twice for the same epoch (due to a bug or a retry), any committed draw for that epoch becomes un-revealable. Funds are locked until the reveal deadline.

**Recommendation:**
Add a check: `if SNAPSHOTS.has(deps.storage, epoch) { return Err(...); }` — or at minimum, check that no committed draws reference this epoch.

---

### M-02: No domain separation in merkle tree hashing

**File:** `packages/chance-staking-common/src/merkle.rs:9-14, 45-53`

**Description:**
Leaf hashes and internal node hashes both use plain SHA-256 without a domain separation prefix. Best practice for merkle trees is to prefix leaf hashes with `0x00` and internal node hashes with `0x01` to prevent second-preimage attacks where a leaf could be constructed to look like an internal node.

**Impact:**
In theory, an attacker could craft a leaf whose hash collides with an internal node, enabling them to prove inclusion of a fabricated entry. In practice, the structured leaf format (`address || start || end`) makes this difficult, but the vulnerability exists in principle.

**Recommendation:**
Add domain separation:
```rust
// Leaf: sha256(0x00 || address || start || end)
// Node: sha256(0x01 || min(left,right) || max(left,right))
```

---

### M-03: No `migrate` entry point on any contract

**File:** All contracts' `lib.rs` and `contract.rs`

**Description:**
None of the three contracts implement a `migrate` entry point. This means the contracts cannot be upgraded after deployment, even to fix critical bugs.

**Impact:**
Any bug discovered post-deployment requires deploying entirely new contracts, migrating all state manually (if possible), and updating all references — a complex and risky operation.

**Recommendation:**
Add a `migrate` entry point to each contract, even if the initial implementation just validates the caller and does nothing. This allows for future upgrades.

---

### M-04: Validator addresses stored as unvalidated strings

**File:** `contracts/staking-hub/src/state.rs:28`, `contract.rs:52`

**Description:**
Validator addresses are stored as `Vec<String>` and are not validated as proper `valoper` bech32 addresses during instantiation or `update_validators`. Invalid validator addresses would cause delegation messages to fail on-chain.

**Impact:**
A misconfigured validator list would cause `stake`, `unstake`, `claim_rewards`, and `distribute_rewards` to fail, effectively bricking the contract until the admin fixes the config.

**Recommendation:**
Validate validator addresses match the `injvaloper` prefix and are valid bech32 before saving.

---

### M-05: `distribute_rewards` does not re-stake base yield

**File:** `contracts/staking-hub/src/execute.rs:364-376`

**Description:**
The base yield amount is added to `TOTAL_INJ_BACKING` (an accounting update) but the actual INJ remains in the contract undelegated. Over time, the actual delegated amount diverges from `TOTAL_INJ_BACKING`. When users unstake, undelegate messages are generated based on `TOTAL_INJ_BACKING`, which may exceed actual delegations.

**Impact:**
After many epochs, the accumulated undelegated base yield means undelegation messages request more than what's delegated, causing unstake transactions to fail.

**Recommendation:**
After computing `base_yield`, add delegation messages to stake the base yield INJ to validators (same round-robin distribution as the `stake` function).

---

## Low

### L-01: No admin rotation mechanism in drand-oracle

**File:** `contracts/drand-oracle/src/execute.rs`

**Description:**
The drand-oracle contract has no `update_config` or `update_admin` function. The admin is set at instantiation and can never be changed. If the admin key is compromised or lost, the operator list cannot be updated.

**Recommendation:**
Add an `UpdateAdmin` or `UpdateConfig` message gated to the current admin.

---

### L-02: Operator has free option to abort unfavorable draws

**File:** `contracts/reward-distributor/src/execute.rs:254-440`

**Description:**
After committing to a draw, the operator sees the drand beacon result and computes the winner before revealing. If the result is unfavorable, the operator can simply let the draw expire, returning funds to the pool with no penalty. This gives the operator a "free option" to filter out unwanted outcomes.

**Impact:**
The operator can bias the draw outcomes by selectively revealing only favorable results. While funds aren't stolen (they return to the pool), the fairness of the system is compromised.

**Recommendation:**
Consider adding a penalty mechanism for expired draws (e.g., partial slashing of an operator bond) or allowing any party to reveal a draw using publicly verifiable information.

---

### L-03: Direct INJ transfers inflate next epoch's rewards

**File:** `contracts/staking-hub/src/execute.rs:350-356`

**Description:**
`distribute_rewards` computes `total_rewards = contract_balance - PENDING_UNSTAKE_TOTAL`. Any INJ sent directly to the contract (not through staking) is treated as staking rewards.

**Impact:**
A third party could send INJ to the contract to inflate the reward distribution. This isn't theft (the INJ is donated), but could be used to manipulate the exchange rate or prize pool sizes in specific epochs.

**Recommendation:**
Track expected rewards separately (e.g., record the balance before `claim_rewards` and compute the delta) rather than using the full contract balance.

---

### L-04: Rounding dust from BPS calculations accumulates

**File:** `contracts/staking-hub/src/execute.rs:359-362`

**Description:**
Each BPS share is calculated independently with `multiply_ratio`, meaning the four amounts may not sum exactly to `total_rewards` due to integer rounding. The difference (typically 1-3 units) remains in the contract and gets double-counted next epoch.

**Impact:**
Negligible per epoch, but accumulates over time. This is more of a correctness issue than a security concern.

**Recommendation:**
Calculate the last share as `total_rewards - (regular + big + base_yield)` to eliminate rounding dust.

---

### L-05: No check that contract balance covers reward payout

**File:** `contracts/reward-distributor/src/execute.rs:377-379`

**Description:**
When `reveal_draw` sends the reward to the winner via `BankMsg::Send`, there is no pre-check that the contract actually holds sufficient INJ. The pool balance is tracked in state (`DRAW_STATE`), but the actual contract balance could differ.

**Impact:**
If there's a discrepancy between tracked pool balances and actual INJ held (e.g., due to bugs in other contracts or unexpected state), the reveal transaction fails, and the draw eventually expires. Funds return to the pool in state but may still not be backed by actual INJ.

**Recommendation:**
Query the contract's actual INJ balance and verify it's >= `reward_amount` before attempting the send.

---

## Test Coverage Gaps

The existing test suite (51 tests) covers most happy paths and basic authorization checks. The following scenarios lack test coverage:

1. **Slashing simulation** — No tests verify contract behavior when validator delegations decrease due to slashing.
2. **Multi-epoch base yield accumulation** — No test runs multiple `distribute_rewards` cycles to verify that base yield doesn't double-count.
3. **BPS sum invariant after update_config** — No test verifies that changing `protocol_fee_bps` doesn't break the BPS sum.
4. **Zero total_weight snapshot** — No test covers committing a draw with a zero-weight snapshot.
5. **Snapshot overwrite** — No test covers calling `set_snapshot` twice for the same epoch while a draw is committed.
6. **Large stake amounts near overflow boundaries** — No test covers staking amounts near `u128::MAX / 10^18` to verify the overflow-safe rate arithmetic.
7. **Cross-contract balance reconciliation** — No test verifies that `TOTAL_INJ_BACKING` stays in sync with actual delegations across multiple epochs.

---

## Architecture Notes

### Operator Trust Assumptions

The protocol has significant operator centralization:

- **Epoch advancement** — The operator controls when epochs advance (no enforced duration).
- **Snapshot content** — The operator builds and submits the merkle tree off-chain. The contract cannot verify that the snapshot accurately reflects csINJ balances.
- **Draw timing** — The operator chooses when to commit draws and which drand round to target.
- **Winner computation** — The operator computes and submits the winner; the contract verifies the proof but can't independently determine the winner from the commit alone.

This is a pragmatic design choice (fully on-chain snapshots would be prohibitively expensive), but users should understand that the operator is a trusted party.

### Positive Design Choices

1. **BLS verification** — Using `drand-verify` for on-chain BLS signature verification of drand beacons is solid.
2. **Sorted-pair hashing** — The merkle tree uses sorted pairs to prevent order-dependent proof attacks.
3. **Commit-reveal scheme** — The XOR-based commit-reveal prevents either party from fully controlling randomness.
4. **O(1) unstake tracking** — Using `PENDING_UNSTAKE_TOTAL` instead of iterating all requests is efficient.
5. **Duplicate beacon prevention** — The drand oracle correctly prevents duplicate beacon submissions.
6. **Token Factory integration** — Using Injective's native Token Factory for csINJ avoids CW20 complexity.
