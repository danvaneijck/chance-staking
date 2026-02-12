# Chance Staking

Prize-linked staking protocol on Injective. Users stake INJ, receive csINJ, and are entered into regular and big prize draws funded by staking rewards.

## Project Structure

```
chance-staking/
  contracts/
    drand-oracle/          # Verifiable randomness from drand quicknet
    staking-hub/           # INJ staking, csINJ minting, epoch management
    reward-distributor/    # Prize draw commit-reveal, reward payouts
  packages/
    chance-staking-common/ # Shared types (DrawType, DrawStatus, SnapshotEntry) + merkle proof utils
  tests/
    integration/           # Cross-contract integration tests (mock-based, no test-tube)
  scripts/
    deploy_testnet.sh      # Deploys all 3 contracts to injective-888
```

## Build & Test

```bash
cd chance-staking
cargo test                                    # all 96 tests
cargo test -p chance-drand-oracle             # oracle unit tests
cargo test -p chance-staking-hub              # staking hub unit tests
cargo test -p chance-reward-distributor       # distributor unit tests
cargo test -p chance-staking-integration-tests # integration tests
```

Wasm build (requires Docker):
```bash
docker run --rm -v "$(pwd)":/code \
  cosmwasm/optimizer:0.16.0
```

## Contract Addresses

Set after deployment via `scripts/deploy_testnet.sh`. The script outputs all addresses at the end.

## Deployment Order & Dependencies

1. **drand-oracle** (no deps)
2. **reward-distributor** (needs `drand_oracle` address; uses placeholder `staking_hub`)
3. **staking-hub** (needs `reward_distributor` + `drand_oracle`; sends 1 INJ for Token Factory denom creation)
4. **UpdateConfig** on reward-distributor to set real `staking_hub` address

---

## Contract Interfaces

All messages are JSON. Amounts are strings for `Uint128`, integers for `u64`/`u16`. Addresses are bech32 `inj1...` strings.

---

### drand-oracle

Stores and verifies drand quicknet beacons (BLS signatures). Used by reward-distributor as the randomness source.

#### Execute

```jsonc
// Submit a verified beacon (operator only)
{ "submit_beacon": { "round": 1000, "signature_hex": "b446..." } }

// Update operator list (admin only)
{ "update_operators": { "add": ["inj1..."], "remove": [] } }

// Update admin (admin only)
{ "update_admin": { "new_admin": "inj1..." } }
```

#### Query

```jsonc
// Get contract config
{ "config": {} }
// Returns: OracleConfig
// {
//   "admin": "inj1...",
//   "operators": ["inj1..."],
//   "quicknet_pubkey": [/* bytes */],
//   "chain_hash": "52db...",
//   "genesis_time": 1692803367,
//   "period_seconds": 3
// }

// Get a stored beacon by round
{ "beacon": { "round": 1000 } }
// Returns: StoredBeacon | null
// {
//   "round": 1000,
//   "randomness": [/* 32 bytes */],
//   "signature": [/* 48 bytes */],
//   "verified": true,
//   "submitted_at": "1234567890.000000000",
//   "submitted_by": "inj1..."
// }

// Get latest stored round number
{ "latest_round": {} }
// Returns: u64
```

---

### staking-hub

Manages INJ staking, csINJ (liquid staking token) minting/burning, epoch advancement, and reward distribution to pools.

**Token**: csINJ is a Token Factory denom: `factory/{contract_address}/csINJ`

**Exchange rate**: `rate = total_inj_backing / total_csinj_supply`. Starts at 1.0, increases as staking rewards accrue.

**Unstake lock**: 21 days (Injective unbonding period).

#### Execute

```jsonc
// Stake INJ to receive csINJ (send INJ in funds)
// csINJ_minted = inj_amount / exchange_rate
// Rejects if amount < min_stake_amount. Resets user's epoch eligibility timer.
{ "stake": {} }
// funds: [{ "denom": "inj", "amount": "1000000000000000000" }]

// Unstake csINJ to begin unbonding (send csINJ in funds)
// inj_owed = csinj_amount * exchange_rate
{ "unstake": {} }
// funds: [{ "denom": "factory/{contract}/csINJ", "amount": "1000000" }]

// Claim unlocked unstake requests (21 days after unstake)
{ "claim_unstaked": { "request_ids": [0, 1] } }

// Step 1: Claim staking rewards from all validators (operator only)
// Sends WithdrawDelegatorReward msgs internally. Call distribute_rewards after.
{ "claim_rewards": {} }

// Step 2: Distribute claimed rewards and advance epoch (operator only)
// Enforces epoch_duration_seconds has elapsed since epoch start.
// Reads contract INJ balance, subtracts reserved unstake amounts,
// splits surplus: base_yield_bps -> delegated to validators, protocol_fee_bps -> treasury,
//                 regular_pool_bps -> regular pool, big_pool_bps -> big pool
{ "distribute_rewards": {} }

// Submit snapshot merkle root for current epoch (operator only)
// This also forwards the snapshot to the reward-distributor via SetSnapshot
{ "take_snapshot": {
    "merkle_root": "abcdef...",
    "total_weight": "1000000",
    "num_holders": 42,
    "snapshot_uri": "https://..."
} }

// Update config (admin only)
// Note: BPS fields must sum to 10000 (regular + big + base_yield + protocol_fee)
{ "update_config": {
    "admin": "inj1...",           // optional
    "operator": "inj1...",        // optional
    "protocol_fee_bps": 500,      // optional
    "base_yield_bps": 500,        // optional
    "regular_pool_bps": 7000,     // optional
    "big_pool_bps": 2000,         // optional
    "min_epochs_regular": 1,      // optional, min epochs staked for regular draw eligibility
    "min_epochs_big": 4,          // optional, min epochs staked for big draw eligibility
    "min_stake_amount": "1000"    // optional, Uint128 (0 = no minimum)
} }

// Update validator set (admin only)
// Removed validators are automatically redelegated to remaining validators
// Validator addresses must start with "injvaloper"
{ "update_validators": { "add": ["injvaloper1..."], "remove": [] } }

// Sync backing with actual validator delegations after slashing (operator only)
// Updates TOTAL_INJ_BACKING, EPOCH_STATE.total_staked, and exchange rate
{ "sync_delegations": {} }
```

#### Query

```jsonc
// Get contract config
{ "config": {} }
// Returns: Config
// {
//   "admin": "inj1...",
//   "operator": "inj1...",
//   "reward_distributor": "inj1...",
//   "drand_oracle": "inj1...",
//   "csinj_denom": "factory/inj1.../csINJ",
//   "validators": ["injvaloper1..."],
//   "epoch_duration_seconds": 86400,
//   "protocol_fee_bps": 500,
//   "treasury": "inj1...",
//   "base_yield_bps": 500,
//   "regular_pool_bps": 7000,
//   "big_pool_bps": 2000,
//   "min_epochs_regular": 1,
//   "min_epochs_big": 4,
//   "min_stake_amount": "1000"
// }

// Get current epoch state
{ "epoch_state": {} }
// Returns: EpochState
// {
//   "current_epoch": 5,
//   "epoch_start_time": "1234567890.000000000",
//   "total_staked": "100000000",
//   "snapshot_merkle_root": "abcdef..." | null,
//   "snapshot_finalized": true,
//   "snapshot_total_weight": "100000000",
//   "snapshot_num_holders": 42,
//   "snapshot_uri": "https://..." | null
// }

// Get exchange rate and backing totals
{ "exchange_rate": {} }
// Returns: ExchangeRateResponse
// {
//   "rate": "1.05",
//   "total_inj_backing": "105000000",
//   "total_csinj_supply": "100000000"
// }

// Get unstake requests for an address
{ "unstake_requests": { "address": "inj1..." } }
// Returns: UnstakeRequestEntry[]
// [{
//   "id": 0,
//   "request": {
//     "inj_amount": "50000000",
//     "csinj_burned": "47619047",
//     "unlock_time": "1234567890.000000000",
//     "claimed": false
//   }
// }]

// Get staker eligibility info
{ "staker_info": { "address": "inj1..." } }
// Returns: StakerInfoResponse
// {
//   "address": "inj1...",
//   "stake_epoch": 5 | null    // epoch of most recent stake, null if never staked
// }
```

---

### reward-distributor

Manages prize draw lifecycle: commit-reveal with drand randomness, merkle-proof winner verification, and reward payouts.

#### Draw Lifecycle

1. **Fund pools** - staking-hub sends INJ via `FundRegularPool` / `FundBigPool` during `AdvanceEpoch`
2. **Set snapshot** - staking-hub forwards merkle root via `SetSnapshot` during `TakeSnapshot`
3. **Commit** - operator commits to a draw with `sha256(secret)` and target drand round
4. **Reveal** - after drand beacon is available, operator reveals secret + computed winner with merkle proof
5. **Expire** - if operator fails to reveal within deadline, anyone can expire to return funds to pool

**Winner selection**: `final_randomness = drand_randomness XOR sha256(operator_secret)`, then `winning_ticket = u128_from_be(final_randomness[0..16]) % total_weight`. The winner is the holder whose `[cumulative_start, cumulative_end)` range contains the winning ticket.

#### Execute

```jsonc
// Fund regular draw pool (staking_hub only, send INJ in funds)
{ "fund_regular_pool": {} }

// Fund big draw pool (staking_hub only, send INJ in funds)
{ "fund_big_pool": {} }

// Set snapshot for an epoch (staking_hub only)
{ "set_snapshot": {
    "epoch": 1,
    "merkle_root": "abcdef...",
    "total_weight": "1000000",
    "num_holders": 42
} }

// Commit to a draw (operator only)
// Contract uses full pool balance as reward amount
{ "commit_draw": {
    "draw_type": "regular",          // "regular" | "big"
    "operator_commit": "sha256hex",  // hex(sha256(secret))
    "target_drand_round": 1000,
    "epoch": 1
} }

// Reveal a draw with winner proof (operator only)
{ "reveal_draw": {
    "draw_id": 0,
    "operator_secret_hex": "hex_of_secret_bytes",
    "winner_address": "inj1...",
    "winner_cumulative_start": "100",
    "winner_cumulative_end": "350",
    "merkle_proof": ["hex_hash_1", "hex_hash_2"]
} }

// Expire an unrevealed draw past deadline (anyone)
{ "expire_draw": { "draw_id": 0 } }

// Update config (admin only)
// reveal_deadline_seconds must be between 300 (5 min) and 86400 (24 hours)
{ "update_config": {
    "operator": "inj1...",               // optional
    "staking_hub": "inj1...",            // optional
    "reveal_deadline_seconds": 3600,     // optional (300-86400)
    "epochs_between_regular": 1,         // optional
    "epochs_between_big": 7              // optional
} }
```

#### Query

```jsonc
// Get contract config
{ "config": {} }
// Returns: DistributorConfig
// {
//   "admin": "inj1...",
//   "operator": "inj1...",
//   "staking_hub": "inj1...",
//   "drand_oracle": "inj1...",
//   "reveal_deadline_seconds": 3600,
//   "epochs_between_regular": 1,
//   "epochs_between_big": 7
// }

// Get global draw state (pool balances, counters)
{ "draw_state": {} }
// Returns: DrawStateInfo
// {
//   "next_draw_id": 5,
//   "regular_pool_balance": "40000000",
//   "big_pool_balance": "200000000",
//   "total_draws_completed": 4,
//   "total_rewards_distributed": "40000000",
//   "last_regular_draw_epoch": 4 | null,
//   "last_big_draw_epoch": 1 | null
// }

// Get a specific draw
{ "draw": { "draw_id": 0 } }
// Returns: Draw
// {
//   "id": 0,
//   "draw_type": "regular",
//   "epoch": 1,
//   "status": "revealed",           // "committed" | "revealed" | "expired"
//   "operator_commit": "sha256hex",
//   "target_drand_round": 1000,
//   "drand_randomness": [/* bytes */] | null,
//   "operator_secret": [/* bytes */] | null,
//   "final_randomness": [/* bytes */] | null,
//   "winner": "inj1..." | null,
//   "reward_amount": "10000000",
//   "created_at": "1234567890.000000000",
//   "revealed_at": "1234567900.000000000" | null,
//   "reveal_deadline": "1234571490.000000000",
//   "merkle_root": "abcdef..." | null,
//   "total_weight": "1000000" | null
// }

// Get draw history (paginated)
{ "draw_history": { "start_after": 0, "limit": 10 } }
// Returns: { "draws": [Draw, ...] }

// Get pool balances
{ "pool_balances": {} }
// Returns: { "regular_pool": "40000000", "big_pool": "200000000" }

// Get user's win summary
{ "user_wins": { "address": "inj1..." } }
// Returns: UserWinsResponse
// {
//   "address": "inj1...",
//   "total_wins": 2,
//   "total_won_amount": "20000000",
//   "draw_ids": [0, 3]
// }

// Get full draw details for user's wins (paginated)
{ "user_win_details": { "address": "inj1...", "start_after": 0, "limit": 10 } }
// Returns: Draw[]

// Verify a merkle inclusion proof (useful for frontend validation)
{ "verify_inclusion": {
    "merkle_root": "abcdef...",
    "proof": ["hex1", "hex2"],
    "leaf_address": "inj1...",
    "cumulative_start": "100",
    "cumulative_end": "350"
} }
// Returns: bool

// Get snapshot for an epoch
{ "snapshot": { "epoch": 1 } }
// Returns: Snapshot | null
// {
//   "epoch": 1,
//   "merkle_root": "abcdef...",
//   "total_weight": "1000000",
//   "num_holders": 42,
//   "submitted_at": "1234567890.000000000"
// }
```

---

## Shared Types (chance-staking-common)

```typescript
// DrawType
type DrawType = "regular" | "big";

// DrawStatus
type DrawStatus = "committed" | "revealed" | "expired";

// SnapshotEntry (off-chain, used to build merkle tree)
interface SnapshotEntry {
  address: string;       // bech32
  balance: string;       // Uint128
  cumulative_start: string;
  cumulative_end: string;
}
```

## Merkle Tree

The merkle tree uses **sorted-pair hashing** (smaller hash first when combining siblings) with **domain separation** prefixes to prevent second pre-image attacks.

**Leaf hash**: `sha256(0x00 || address_bytes || cumulative_start_be_u128 || cumulative_end_be_u128)`
- `0x00`: leaf domain separator prefix byte
- `address_bytes`: raw UTF-8 bytes of the bech32 address string
- `cumulative_start` / `cumulative_end`: big-endian 16-byte u128

**Internal nodes**: `sha256(0x01 || min(left, right) || max(left, right))`
- `0x01`: internal node domain separator prefix byte

The frontend needs to:
1. Build the tree from the snapshot entries
2. Generate proofs for the winner during `reveal_draw`
3. Optionally verify proofs via the `verify_inclusion` query

## Key Frontend Queries

| What | Contract | Query |
|---|---|---|
| Exchange rate & TVL | staking-hub | `exchange_rate` |
| User's unstake requests | staking-hub | `unstake_requests` |
| Current epoch info | staking-hub | `epoch_state` |
| Pool balances | reward-distributor | `pool_balances` or `draw_state` |
| Recent draws | reward-distributor | `draw_history` |
| Specific draw result | reward-distributor | `draw` |
| User's win history | reward-distributor | `user_wins` / `user_win_details` |
| Staker eligibility info | staking-hub | `staker_info` |
| Latest drand round | drand-oracle | `latest_round` |

## Key Frontend Actions

| Action | Contract | Execute | Funds |
|---|---|---|---|
| Stake INJ | staking-hub | `stake` | INJ amount |
| Unstake csINJ | staking-hub | `unstake` | csINJ amount |
| Claim unstaked | staking-hub | `claim_unstaked` | none |

---

## Validation Rules (Post-Audit)

- **BPS sum**: `regular_pool_bps + big_pool_bps + base_yield_bps + protocol_fee_bps` must equal 10000. Enforced at instantiation and `update_config`.
- **Validator addresses**: Must start with `injvaloper` and be reasonable length. Enforced at instantiation and `update_validators`.
- **Merkle root**: Must be exactly 64 hex characters (32 bytes). Validated in `take_snapshot`.
- **Reveal deadline**: Must be between 300 seconds (5 min) and 86400 seconds (24 hours). Enforced at instantiation and `update_config`.
- **Epoch duration**: `distribute_rewards` enforces that `epoch_duration_seconds` has elapsed since epoch start.
- **Snapshot overwrite**: Cannot overwrite a snapshot for an epoch that already has one.
- **Zero weight**: Snapshots with `total_weight = 0` are rejected at `commit_draw`.
- **Balance check**: `reveal_draw` verifies contract has sufficient balance before payout.
- **Min stake**: Stake amount must be >= `min_stake_amount` (configurable, 0 = no minimum).
- **Draw epoch**: `commit_draw` validates the epoch matches the latest snapshot epoch.

## Contract Migration

All three contracts support `migrate()` via `MigrateMsg {}` (empty message). Uses cw2 for contract name/version validation.

---

## Known Design Trade-offs

### Draw Reveal Discretion (L-02)

The operator may choose not to reveal unfavorable draw results by letting them expire.
While this doesn't result in fund loss (expired draws return funds to pool), it could
bias the distribution of winners. This is a trade-off for operational simplicity.

**Implications:**

- Operator can selectively reveal only favorable outcomes
- Funds are not stolen but fairness may be compromised
- Future versions may implement public reveal mechanisms or operator bonding

### Direct INJ Transfers (L-03)

Sending INJ directly to the staking-hub contract (outside of normal staking flow)
will cause that INJ to be distributed as rewards in the next epoch. This effectively
donates to all current stakers and is not a security risk.

**Behavior:**

- Direct transfers are treated as additional staking rewards
- The INJ is split according to BPS configuration (pools, treasury, base yield)
- This is by design and allows for voluntary contributions to the reward pool

### Re-staking Resets Eligibility (V2-I-01)

Any new stake resets the user's epoch eligibility timer (`USER_STAKE_EPOCH`).
This means adding more INJ restarts the `min_epochs_regular` / `min_epochs_big`
countdown for draw eligibility.

**Implications:**

- Frontend should warn users that additional stakes reset their eligibility timer
- Users who want to remain eligible should avoid staking more until after a draw

### No Minimum Stake Enforced by Default (V2-L-03)

The `min_stake_amount` config defaults to 0 (no minimum). Dust stakes are allowed
since winning probability is proportional to stake weight, making the expected
value for tiny stakes negligible. Operators can set a minimum via `update_config`.
