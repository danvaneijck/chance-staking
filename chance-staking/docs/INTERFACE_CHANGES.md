# Interface Changes - Security Audit Remediation

This document outlines all interface changes made during the security audit remediation and their impact on external systems.

## Summary

All 17 security findings from the audit have been fixed. Most changes are internal implementation details, but **one breaking change** affects external systems.

---

## Breaking Changes

### M-02: Merkle Domain Separation (CRITICAL FOR OPERATOR)

**Impact:** All merkle proof generation must be updated

**Change:** Added domain separation prefixes to merkle hashing:
- Leaf hashes: `sha256(0x00 || address || cumulative_start || cumulative_end)`
- Internal node hashes: `sha256(0x01 || left || right)` (with sorted pairs)

**Who is affected:**
- ✅ **Operator Node** - FIXED in this commit
  - [operator-node/src/utils/crypto.ts](operator-node/src/utils/crypto.ts) - Added 0x00 prefix to `computeLeafHash()`
  - [operator-node/src/services/merkle.ts](operator-node/src/services/merkle.ts) - Added 0x01 prefix to `hashPairSorted()`
- ⚠️ **Frontend** - Needs update if it generates or verifies merkle proofs locally
- ⚠️ **Any external snapshot generators** - Must update to match new hash scheme

**Migration:** All old merkle roots are incompatible. Fresh deployment only - no migration needed.

---

## Non-Breaking Interface Changes

### New Execute Messages

#### staking-hub
```rust
ExecuteMsg::SyncDelegations {}  // H-05: Operator-only, reconciles backing with actual delegations
```

#### staking-hub - UpdateConfig extended
```rust
ExecuteMsg::UpdateConfig {
    admin: Option<String>,
    operator: Option<String>,
    protocol_fee_bps: Option<u16>,
    base_yield_bps: Option<u16>,          // NEW - optional
    regular_pool_bps: Option<u16>,        // NEW - optional
    big_pool_bps: Option<u16>,            // NEW - optional
    min_epochs_regular: Option<u64>,      // NEW - optional
    min_epochs_big: Option<u64>,          // NEW - optional
}
```

**Validation:** C-02 fix adds BPS sum validation. Sum must equal 10000 or call fails.

### New Migrate Entry Points

All three contracts now have migrate entry points (M-03):

```rust
// staking-hub, reward-distributor, drand-oracle
pub fn migrate(deps: DepsMut, _env: Env, _msg: MigrateMsg) -> Result<Response, ContractError>
```

**Impact:** Contracts can now be upgraded via migration.

### Validator Address Validation

**Change:** M-04 adds validation that validator addresses must:
- Start with "injvaloper" prefix
- Be reasonable length (< 100 chars)

**Impact:** Invalid validator addresses are rejected at instantiate and update_validators.

---

## Behavioral Changes (Non-Breaking)

### H-01: Epoch Duration Enforcement
**Before:** Operator could call `distribute_rewards` immediately
**After:** Must wait `epoch_duration_seconds` since epoch start
**Impact:** Operator scripts must respect epoch timing

### H-04: Proper Error Handling
**Before:** Arithmetic underflows silently returned zero
**After:** Arithmetic underflows return `InsufficientBalance` error
**Impact:** Better error messages, no silent failures

### L-05: Balance Check Before Payout
**Before:** `reveal_draw` attempted payout without checking balance
**After:** `reveal_draw` verifies contract has sufficient balance first
**Impact:** Clearer error if funds are missing

---

## Compatibility Checklist

### ✅ Deploy Script
**File:** `scripts/deploy_testnet.sh`
**Status:** Compatible - no changes needed
- Validator addresses already use "injvaloper" format
- All instantiate parameters match current interfaces

### ✅ Operator Node
**Files:**
- `operator-node/src/utils/crypto.ts` - ✅ FIXED
- `operator-node/src/services/merkle.ts` - ✅ FIXED

**Status:** Compatible after M-02 fixes applied in this commit

**Required operator changes:**
1. ✅ Update merkle leaf hash to include 0x00 prefix
2. ✅ Update merkle internal node hash to include 0x01 prefix
3. ⚠️ Respect epoch duration timing (H-01) - check if operator enforces this
4. ⚠️ Handle new error types (optional, for better logging)

### ⚠️ Frontend
**Status:** Needs verification

**Checklist:**
- [ ] Does frontend generate merkle proofs locally?
  - If YES: Must update to use domain separation prefixes
  - If NO: No changes needed
- [ ] Does frontend verify merkle proofs locally?
  - If YES: Must update verification logic
  - If NO: Contract handles verification, no changes needed
- [ ] Does frontend call `update_config`?
  - If YES: Can now pass additional BPS parameters (optional)
  - Note: BPS sum must equal 10000 or call fails

### ⚠️ External Systems
- Any off-chain snapshot generators must use new merkle hashing scheme
- Any systems calling `update_config` should be aware of BPS sum validation

---

## Test Coverage

All changes are covered by tests:
- **Unit tests:** 47 tests (staking-hub, reward-distributor, drand-oracle, common)
- **Integration tests:** 14 tests (including 7 new tests for audit coverage gaps)
- **Total:** 61 tests passing

New test coverage includes:
- Multi-epoch base yield accumulation (C-01 verification)
- BPS sum validation in update_config (C-02 verification)
- Zero total_weight snapshot rejection (H-03 verification)
- Snapshot overwrite prevention (M-01 verification)
- Large stake amounts without overflow
- Cross-contract balance reconciliation
- Slashing detection via sync_delegations

---

## Deployment Notes

### Fresh Deployment (Recommended)
1. Build contracts: `docker run --rm -v "$(pwd)":/code cosmwasm/optimizer:0.16.0`
2. Deploy using `scripts/deploy_testnet.sh`
3. Deploy operator node with updated merkle code
4. Verify frontend compatibility

### Migration from Old Deployment
**NOT RECOMMENDED** due to M-02 breaking change. All existing snapshots would be invalid.

If migration is required:
1. Use new migrate entry points
2. Regenerate all merkle trees with domain separation
3. Update operator node code
4. Test thoroughly before mainnet migration

---

## Summary of Security Fixes

All 17 audit findings have been addressed:

**Critical (2):**
- C-01: Base yield delegation - ✅ Fixed
- C-02: BPS sum validation - ✅ Fixed

**High (5):**
- H-01: Epoch duration enforcement - ✅ Fixed
- H-02: Current epoch validation - ✅ Fixed
- H-03: Zero weight prevention - ✅ Fixed
- H-04: Proper error handling - ✅ Fixed
- H-05: Slashing detection - ✅ Fixed

**Medium (5):**
- M-01: Snapshot overwrite prevention - ✅ Fixed
- M-02: Merkle domain separation - ✅ Fixed (BREAKING)
- M-03: Migrate entry points - ✅ Fixed
- M-04: Validator validation - ✅ Fixed
- M-05: Duplicate of C-01 - ✅ Fixed

**Low (5):**
- L-01: Admin rotation - ✅ Fixed
- L-02: Operator documentation - ✅ Fixed
- L-03: Direct transfer documentation - ✅ Fixed
- L-04: Rounding dust elimination - ✅ Fixed
- L-05: Balance check before payout - ✅ Fixed

---

## Questions?

For questions about interface changes or compatibility, refer to:
- Contract documentation: [CLAUDE.md](../../CLAUDE.md)
- Full audit report: [AUDIT.md](AUDIT.md)
- Security fix plan: [~/.claude/plans/](~/.claude/plans/)
