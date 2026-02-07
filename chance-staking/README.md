# Chance.Staking — Gamified Liquid Staking on Injective

## Overview

Chance.Staking is a gamified liquid staking protocol on Injective that reimagines traditional staking by introducing randomized reward distribution. Inspired by UK Premium Bonds and the Tramplin protocol on Solana, it pools INJ staking rewards and redistributes them via verifiable randomness — giving every holder a chance at outsized returns while keeping their principal safe in native staking.

## Architecture

The protocol consists of **3 CosmWasm contracts + 1 off-chain operator bot**:

```
┌──────────────────────────────────────────────────────┐
│                     USER                              │
│  Deposits INJ → receives csINJ (Token Factory denom)  │
└───────────┬──────────────────────────────┬────────────┘
            │                              │
            ▼                              ▼
┌────────────────────┐         ┌────────────────────────┐
│   STAKING HUB      │         │   csINJ                │
│   (Core Contract)   │────────►│   factory/{hub}/csINJ  │
│                     │  mint/  │   Native bank denom    │
│  - Accepts INJ      │  burn   └────────────────────────┘
│  - Delegates to     │
│    validators       │
│  - Manages epochs   │
│  - Exchange rate    │
└────────┬────────────┘
         │  Epoch rewards
         ▼
┌────────────────────────┐      ┌────────────────────────┐
│  REWARD DISTRIBUTOR    │◄─────│  DRAND ORACLE          │
│                        │query │                        │
│  - Commit-Reveal draws │      │  - Stores drand beacons│
│  - Merkle proof verify │      │  - BLS verify via      │
│  - Sends rewards       │      │    drand-verify crate  │
└────────────────────────┘      └────────────────────────┘
                                         ▲
                                         │ submits beacons
                                ┌────────┴───────────────┐
                                │  OFF-CHAIN OPERATOR BOT │
                                │  - Fetches drand beacons│
                                │  - Runs commit-reveal   │
                                │  - Computes winners     │
                                │  - Advances epochs      │
                                └─────────────────────────┘
```

## Contracts

### 1. Staking Hub (`chance-staking-hub`)
- Creates and manages the `csINJ` Token Factory denom
- Accepts INJ deposits and mints csINJ at the current exchange rate
- Delegates INJ to validators
- Manages epoch lifecycle and reward distribution splits
- Handles unstaking with 21-day unbonding period

### 2. Reward Distributor (`chance-reward-distributor`)
- Manages regular (70%) and big (20%) draw pools
- Implements commit-reveal draw scheme
- Verifies Merkle proofs for winner selection
- Tracks per-user win history on-chain
- Emits structured events for indexer consumption

### 3. drand Oracle (`chance-drand-oracle`)
- Stores and verifies drand quicknet beacons
- Uses `drand-verify` crate for pure-Rust BLS12-381 verification
- Does NOT use CosmWasm native BLS APIs (not implemented on Injective)

### Shared Package (`chance-staking-common`)
- Merkle tree utilities (leaf hash computation, proof verification)
- Shared types (DrawType, DrawStatus, SnapshotEntry)

## Reward Distribution

```
Staking Rewards per epoch (100%)
  ├── 70% → Regular Draw Pool (daily draws, weighted by csINJ balance)
  ├── 20% → Big Draw Pool (monthly draws, equal weight)
  ├── 5%  → Base Yield (exchange rate appreciation for all holders)
  └── 5%  → Protocol Treasury
```

## Key Design Decisions

| Decision | Choice |
|---|---|
| Liquid staking token | Injective Token Factory (`factory/{contract}/csINJ`) |
| Randomness source | Self-hosted drand oracle with `drand-verify` crate |
| BLS verification | Pure-Rust via `drand-verify = "0.6.2"` (NOT native CosmWasm API) |
| drand network | quicknet (bls-unchained-g1-rfc9380, 3s rounds) |
| Base yield | 5% of epoch rewards via exchange rate appreciation |
| CosmWasm version | v2.2.2 |

## Building

### Prerequisites
- Rust toolchain with `wasm32-unknown-unknown` target
- Docker (for optimized builds)

### Compile (debug)
```bash
cargo build
```

### Run unit tests
```bash
cargo test
```

### Build optimized wasm artifacts
```bash
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.16.1
```

### Run integration tests
```bash
# After building artifacts:
cargo test --test integration
```

## Deployment

### 1. Deploy drand Oracle
```bash
injectived tx wasm store artifacts/chance_drand_oracle.wasm \
  --from <key> --gas auto --gas-adjustment 1.3 \
  --node https://sentry.tm.injective.network:443 \
  --chain-id injective-1

injectived tx wasm instantiate <code_id> '{
  "operators": ["<operator_inj_addr>"],
  "quicknet_pubkey_hex": "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  "chain_hash": "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  "genesis_time": 1692803367,
  "period_seconds": 3
}' --label "chance-drand-oracle" --from <key> --admin <admin_addr> \
  --gas auto --gas-adjustment 1.3 \
  --node https://sentry.tm.injective.network:443 \
  --chain-id injective-1
```

### 2. Deploy Reward Distributor
```bash
injectived tx wasm store artifacts/chance_reward_distributor.wasm \
  --from <key> --gas auto --gas-adjustment 1.3 \
  --node https://sentry.tm.injective.network:443 \
  --chain-id injective-1

injectived tx wasm instantiate <code_id> '{
  "operator": "<operator_addr>",
  "staking_hub": "<hub_addr_placeholder>",
  "drand_oracle": "<oracle_addr>",
  "reveal_deadline_seconds": 3600,
  "regular_draw_reward": "10000000",
  "big_draw_reward": "100000000"
}' --label "chance-reward-distributor" --from <key> --admin <admin_addr> \
  --gas auto --gas-adjustment 1.3 \
  --node https://sentry.tm.injective.network:443 \
  --chain-id injective-1
```

### 3. Deploy Staking Hub
```bash
injectived tx wasm store artifacts/chance_staking_hub.wasm \
  --from <key> --gas auto --gas-adjustment 1.3 \
  --node https://sentry.tm.injective.network:443 \
  --chain-id injective-1

injectived tx wasm instantiate <code_id> '{
  "operator": "<operator_addr>",
  "reward_distributor": "<distributor_addr>",
  "drand_oracle": "<oracle_addr>",
  "validators": ["injvaloper1..."],
  "epoch_duration_seconds": 86400,
  "protocol_fee_bps": 500,
  "treasury": "<treasury_addr>",
  "base_yield_bps": 500,
  "regular_pool_bps": 7000,
  "big_pool_bps": 2000,
  "csinj_subdenom": "csINJ"
}' --label "chance-staking-hub" --from <key> --admin <admin_addr> \
  --gas auto --gas-adjustment 1.3 \
  --amount 10000000inj \
  --node https://sentry.tm.injective.network:443 \
  --chain-id injective-1
```

### 4. Update Distributor's staking_hub reference
After deploying the hub, update the distributor's config to point to the actual hub address.

## Security Notes

1. **Principal Safety**: User INJ is delegated to validators via native staking. The protocol never holds idle INJ (except during unbonding).

2. **Randomness**: Two-source randomness (drand + operator secret) via commit-reveal prevents either party from manipulating outcomes alone.

3. **BLS Verification**: Uses `drand-verify` crate for pure-Rust BLS12-381 verification. This is computationally expensive (~500M CosmWasm gas) but only runs once per beacon submission.

4. **Merkle Proofs**: Winner selection is verified on-chain via Merkle proofs, ensuring the operator cannot claim false winners.

5. **Expiry Mechanism**: Any user can expire a draw that wasn't revealed in time, returning funds to the pool. This prevents operator griefing.

6. **No CW20**: csINJ is a native Token Factory denom, eliminating CW20 attack vectors and enabling native bank module transfers.

## License

MIT
