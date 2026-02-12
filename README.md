# Chance Staking

Prize-linked liquid staking protocol on [Injective](https://injective.com). Users stake INJ, receive csINJ (a liquid staking token), and are automatically entered into regular and big prize draws funded by staking rewards.

## How It Works

```
                  ┌──────────────────┐
                  │   User stakes    │
                  │      INJ         │
                  └────────┬─────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │     Staking Hub        │
              │  • Mints csINJ         │
              │  • Delegates to        │
              │    validators          │
              │  • Manages epochs      │
              └────────────┬───────────┘
                           │ distribute_rewards
                           ▼
        ┌──────────────────────────────────────┐
        │         Reward Distribution          │
        │                                      │
        │  70% ──► Regular Prize Pool (daily)  │
        │  20% ──► Big Jackpot Pool (monthly)  │
        │   5% ──► Base Yield (csINJ rate ↑)   │
        │   5% ──► Protocol Fee                │
        └──────────────────┬───────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   Reward Distributor   │
              │  • Commit-reveal draws │
              │  • Merkle proof winner │
              │    verification        │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │     drand Oracle       │
              │  • BLS-verified        │
              │    randomness          │
              │  • drand quicknet      │
              └────────────────────────┘
```

## Architecture

The protocol consists of three on-chain contracts and two off-chain services:

### Smart Contracts (CosmWasm)

| Contract | Purpose |
|---|---|
| **drand-oracle** | Stores and verifies [drand](https://drand.love) quicknet beacons (BLS12-381 signatures). Provides verifiable randomness for prize draws. |
| **staking-hub** | Accepts INJ deposits, mints csINJ via Token Factory, delegates to validators, manages epochs, and splits staking rewards across pools. |
| **reward-distributor** | Manages the prize draw lifecycle: commit-reveal with drand randomness, Merkle-proof winner verification, and reward payouts. |

Contracts live in `chance-staking/contracts/` with shared types in `chance-staking/packages/chance-staking-common/`.

### Off-Chain Services

| Service | Purpose |
|---|---|
| **frontend** | React SPA for staking, viewing draws, and verifying winners. Connects via Keplr/Leap/MetaMask. |
| **operator-node** | Automated bot that advances epochs, submits drand beacons, commits and reveals draws, and manages snapshots. |

## Project Structure

```
chance-staking/
├── chance-staking/              # Smart contracts workspace (Rust/Cargo)
│   ├── contracts/
│   │   ├── drand-oracle/        # Verifiable randomness from drand quicknet
│   │   ├── staking-hub/         # INJ staking, csINJ minting, epoch management
│   │   └── reward-distributor/  # Prize draw commit-reveal, reward payouts
│   ├── packages/
│   │   └── chance-staking-common/  # Shared types + merkle proof utils
│   ├── tests/
│   │   └── integration/         # Cross-contract integration tests
│   └── scripts/
│       └── deploy_testnet.sh    # Deploys all 3 contracts to injective-888
├── frontend/                    # React + Vite + TypeScript SPA
│   ├── src/
│   │   ├── components/          # UI components (13+)
│   │   ├── store/               # Zustand state management
│   │   ├── services/            # Contract query/execute logic
│   │   └── config.ts            # Network + contract addresses
│   └── Dockerfile
├── operator-node/               # TypeScript operator bot
│   ├── src/
│   │   ├── services/            # Epoch, draw, drand, merkle, snapshot
│   │   ├── clients.ts           # Injective SDK client setup
│   │   ├── config.ts            # Environment variable config
│   │   └── index.ts             # Entry point
│   └── Dockerfile
└── .github/
    └── workflows/
        └── docker.yml           # Build & push Docker images
```

## Draw Lifecycle

1. **Epoch advances** — Staking hub claims validator rewards and distributes them across pools
2. **Snapshot taken** — Operator builds a Merkle tree of all csINJ holders and submits the root on-chain
3. **Commit** — Operator commits `sha256(secret)` and a target drand round
4. **Beacon arrives** — drand quicknet produces a BLS-verified random beacon
5. **Reveal** — Operator reveals secret, computes `final_randomness = drand_randomness XOR sha256(secret)`, identifies the winner via the Merkle tree, and submits a Merkle proof on-chain
6. **Payout** — Winner receives INJ from the prize pool

Winner selection: `winning_ticket = u128(final_randomness[0..16]) % total_weight`

## Getting Started

### Prerequisites

- **Rust** and **Cargo** (for smart contracts)
- **Docker** (for optimized Wasm builds and running services)
- **Node.js 20+** (for frontend and operator-node)
- **injectived** CLI (for contract deployment)

### Build Smart Contracts

```bash
cd chance-staking
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="workspace_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/workspace-optimizer:0.17.0
```

Optimized `.wasm` files output to `chance-staking/artifacts/`.

### Run Tests

```bash
cd chance-staking
cargo test                                     # all 96 tests
cargo test -p chance-drand-oracle              # oracle unit tests
cargo test -p chance-staking-hub               # staking hub unit tests
cargo test -p chance-reward-distributor        # distributor unit tests
cargo test -p chance-staking-integration-tests # integration tests
```

### Deploy Contracts (Testnet)

```bash
cd chance-staking/scripts
./deploy_testnet.sh
```

Deploys in order: drand-oracle → reward-distributor → staking-hub, then updates the distributor config with the real staking hub address.

### Run Frontend

```bash
cd frontend
npm install
npm run dev          # Development server on http://localhost:5173
npm run build        # Production build to dist/
```

### Run Operator Node

```bash
cd operator-node
npm install
cp .env.example .env   # Fill in required values
npm run build
npm start
```

Required environment variables:

| Variable | Description |
|---|---|
| `MNEMONIC` | Operator wallet seed phrase |
| `DRAND_ORACLE_ADDRESS` | drand oracle contract address |
| `STAKING_HUB_ADDRESS` | Staking hub contract address |
| `REWARD_DISTRIBUTOR_ADDRESS` | Reward distributor contract address |

Optional variables:

| Variable | Default | Description |
|---|---|---|
| `NETWORK` | `testnet` | `testnet` or `mainnet` |
| `EPOCH_CHECK_INTERVAL` | `60` | Seconds between epoch checks |
| `DRAW_CHECK_INTERVAL` | `30` | Seconds between draw checks |
| `DRAND_POLL_INTERVAL` | `10` | Seconds between drand beacon polls |
| `DRAND_API_URL` | `https://api.drand.sh` | drand HTTP API endpoint |

## Docker

Both the frontend and operator-node ship with multi-stage Dockerfiles.

### Frontend

```bash
docker build -t chance-staking-frontend ./frontend
docker run -p 3000:80 chance-staking-frontend
```

Serves the production SPA on port 80 via nginx.

### Operator Node

```bash
docker build -t chance-staking-operator ./operator-node
docker run --env-file operator-node/.env chance-staking-operator
```

### Docker Compose (example)

```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"

  operator:
    build: ./operator-node
    env_file: ./operator-node/.env
    restart: unless-stopped
```

## Testnet Deployment

| Contract | Address | Code ID |
|---|---|---|
| drand-oracle | `inj1r6r6xugh3qy483g8z5jn97ssaz067epx3ac6kd` | 39232 |
| reward-distributor | `inj1nstzftt4tgk6gca5auluftzvzenrr606t6rrsr` | 39233 |
| staking-hub | `inj1ue9x4varmfaz3c8x07eqrjz4ekz7nflu50ynrk` | 39234 |

Chain: `injective-888` (Injective Testnet)

## Key Concepts

- **csINJ**: Liquid staking token minted via Token Factory. Exchange rate starts at 1.0 and increases as base yield accrues: `rate = total_inj_backing / total_csinj_supply`
- **Epochs**: Time periods (configurable, default 24h) after which rewards are harvested and distributed. Epoch duration is enforced on-chain. Users must be staked for `min_epochs_regular` / `min_epochs_big` epochs to be eligible for draws
- **Merkle Tree**: Sorted-pair hashing with domain separation. Leaf: `sha256(0x00 || address_bytes || cumulative_start_be_u128 || cumulative_end_be_u128)`. Internal: `sha256(0x01 || min(left,right) || max(left,right))`
- **Commit-Reveal**: Two-phase draw to prevent manipulation. Operator commits before randomness is known, reveals after the drand beacon is available
- **Unstaking**: 21-day unbonding period (Injective native). Users call `unstake` then `claim_unstaked` after the lock expires
- **Minimum Stake**: Configurable `min_stake_amount` per transaction (default 0 = no minimum). Re-staking resets the user's epoch eligibility timer
- **Contract Migration**: All three contracts support on-chain migration via `MigrateMsg {}`

## Security Audits

Two security audits have been completed with all 24 findings remediated:

- **Audit V1**: 17 findings (2 critical, 5 high, 5 medium, 5 low) — all fixed
- **Audit V2**: 7 findings (3 medium, 3 low, 1 informational) — all fixed

Key security improvements include: BPS sum validation, epoch duration enforcement, merkle domain separation, validator address validation, reveal deadline bounds, slashing detection (`sync_delegations`), snapshot overwrite prevention, and contract migration support.

Full reports and fix tracking are in [`chance-staking/docs/`](chance-staking/docs/).

## License

MIT
