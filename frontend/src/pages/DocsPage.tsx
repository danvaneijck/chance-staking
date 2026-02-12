import React, { useState } from 'react'
import {
  BookOpen, Layers, Trophy, Zap, GitBranch, Hash, FileText,
  Shield, ChevronRight, Menu, X, ArrowRight, ArrowDown,
  type LucideIcon,
} from 'lucide-react'
import { colors } from '../theme'

// ── Sidebar navigation ──
interface NavItem {
  key: string
  title: string
  icon?: LucideIcon
  parent?: string
}

const navItems: NavItem[] = [
  { key: 'overview', title: 'Overview', icon: BookOpen },
  { key: 'staking-hub', title: 'Staking Hub', icon: Layers },
  { key: 'sh-execute', title: 'Execute Messages', parent: 'staking-hub' },
  { key: 'sh-query', title: 'Query Messages', parent: 'staking-hub' },
  { key: 'reward-distributor', title: 'Reward Distributor', icon: Trophy },
  { key: 'rd-execute', title: 'Execute Messages', parent: 'reward-distributor' },
  { key: 'rd-query', title: 'Query Messages', parent: 'reward-distributor' },
  { key: 'drand-oracle', title: 'drand Oracle', icon: Zap },
  { key: 'do-execute', title: 'Execute Messages', parent: 'drand-oracle' },
  { key: 'do-query', title: 'Query Messages', parent: 'drand-oracle' },
  { key: 'interactions', title: 'Contract Interactions', icon: GitBranch },
  { key: 'merkle-tree', title: 'Merkle Tree', icon: Hash },
  { key: 'shared-types', title: 'Shared Types', icon: FileText },
  { key: 'validation', title: 'Validation Rules', icon: Shield },
]

function CodeBlock({ children }: { children: string }) {
  return (
    <div style={styles.codeBlock}>
      <pre style={styles.codePre}><code style={styles.code}>{children}</code></pre>
    </div>
  )
}

function MsgCard({ title, description, children }: { title: string; description: string; children: string }) {
  return (
    <div style={styles.msgCard}>
      <h4 style={styles.msgTitle}>{title}</h4>
      <p style={styles.msgDesc}>{description}</p>
      <CodeBlock>{children}</CodeBlock>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 style={styles.sectionHeading}>{children}</h2>
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 style={styles.subHeading}>{children}</h3>
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p style={styles.paragraph}>{children}</p>
}

function InlineCode({ children }: { children: string }) {
  return <code style={styles.inlineCode}>{children}</code>
}

// ── Section renderers ──

function OverviewSection() {
  return (
    <div>
      <SectionHeading>Overview</SectionHeading>
      <Paragraph>
        Chance.Staking is a prize-linked staking protocol on Injective. Users stake INJ, receive csINJ
        (a liquid staking token), and are automatically entered into regular and big prize draws funded
        by staking rewards. Your principal stays safe — only rewards are gamified.
      </Paragraph>

      <SubHeading>Architecture</SubHeading>
      <Paragraph>
        The protocol consists of three smart contracts that work together:
      </Paragraph>

      <div style={styles.archGrid}>
        <div style={{ ...styles.archCard, borderColor: colors.primaryAlpha(0.3) }}>
          <Layers size={20} color={colors.primary} />
          <h4 style={styles.archTitle}>Staking Hub</h4>
          <p style={styles.archDesc}>
            Core contract. Manages INJ staking, csINJ minting/burning via Token Factory,
            epoch advancement, and reward distribution to pools.
          </p>
        </div>
        <div style={styles.archArrow}><ArrowRight size={16} color="#2A2A38" /></div>
        <div style={{ ...styles.archCard, borderColor: 'rgba(244, 114, 182, 0.3)' }}>
          <Trophy size={20} color="#f472b6" />
          <h4 style={styles.archTitle}>Reward Distributor</h4>
          <p style={styles.archDesc}>
            Prize draw lifecycle: commit-reveal with drand randomness,
            merkle-proof winner verification, and reward payouts.
          </p>
        </div>
        <div style={styles.archArrow}><ArrowRight size={16} color="#2A2A38" /></div>
        <div style={{ ...styles.archCard, borderColor: 'rgba(56, 189, 248, 0.3)' }}>
          <Zap size={20} color="#38bdf8" />
          <h4 style={styles.archTitle}>drand Oracle</h4>
          <p style={styles.archDesc}>
            Stores and verifies drand quicknet beacons (BLS threshold signatures).
            Provides verifiable randomness for winner selection.
          </p>
        </div>
      </div>

      <SubHeading>csINJ Token</SubHeading>
      <Paragraph>
        csINJ is a liquid staking token created via Injective's Token Factory with
        denom <InlineCode>{'factory/{staking_hub_address}/csINJ'}</InlineCode>. The exchange rate
        between csINJ and INJ increases over time as staking rewards accrue:
      </Paragraph>
      <CodeBlock>{'exchange_rate = total_inj_backing / total_csinj_supply'}</CodeBlock>
      <Paragraph>
        When you stake, you receive csINJ at the current rate. When you unstake, your csINJ is burned
        and you receive more INJ than you originally staked (after the 21-day unbonding period).
      </Paragraph>

      <SubHeading>Deployment Order</SubHeading>
      <Paragraph>Contracts must be deployed in this order due to cross-contract dependencies:</Paragraph>
      <div style={styles.deployList}>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>1</span>
          <div>
            <strong style={{ color: '#F0F0F5' }}>drand Oracle</strong> — No dependencies
          </div>
        </div>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>2</span>
          <div>
            <strong style={{ color: '#F0F0F5' }}>Reward Distributor</strong> — Needs drand oracle address; uses placeholder for staking hub
          </div>
        </div>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>3</span>
          <div>
            <strong style={{ color: '#F0F0F5' }}>Staking Hub</strong> — Needs reward distributor + drand oracle addresses
          </div>
        </div>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>4</span>
          <div>
            <strong style={{ color: '#F0F0F5' }}>UpdateConfig</strong> — Set real staking hub address on reward distributor
          </div>
        </div>
      </div>

      <SubHeading>Reward Distribution</SubHeading>
      <Paragraph>
        Each epoch, staking rewards are claimed and split according to configurable BPS values
        (must sum to 10,000):
      </Paragraph>
      <div style={styles.bpsGrid}>
        <div style={styles.bpsItem}>
          <div style={{ ...styles.bpsDot, background: colors.primary }} />
          <span><strong>Regular Pool</strong> — 70% (7000 bps)</span>
        </div>
        <div style={styles.bpsItem}>
          <div style={{ ...styles.bpsDot, background: '#f472b6' }} />
          <span><strong>Big Pool</strong> — 20% (2000 bps)</span>
        </div>
        <div style={styles.bpsItem}>
          <div style={{ ...styles.bpsDot, background: '#22c55e' }} />
          <span><strong>Base Yield</strong> — 5% (500 bps) — increases csINJ exchange rate</span>
        </div>
        <div style={styles.bpsItem}>
          <div style={{ ...styles.bpsDot, background: '#f59e0b' }} />
          <span><strong>Protocol Fee</strong> — 5% (500 bps) — sent to treasury</span>
        </div>
      </div>
    </div>
  )
}

function StakingHubSection() {
  return (
    <div>
      <SectionHeading>Staking Hub</SectionHeading>
      <Paragraph>
        The Staking Hub is the core contract. It manages INJ staking via native delegation to validators,
        csINJ minting/burning through Injective's Token Factory, epoch lifecycle, and reward distribution
        to the prize pools.
      </Paragraph>

      <SubHeading>Key Concepts</SubHeading>
      <Paragraph>
        <strong style={{ color: '#F0F0F5' }}>Exchange Rate:</strong> <InlineCode>{'total_inj_backing / total_csinj_supply'}</InlineCode>. Starts
        at 1.0, increases as base yield accrues.
      </Paragraph>
      <Paragraph>
        <strong style={{ color: '#F0F0F5' }}>Unstake Lock:</strong> 21 days (Injective unbonding period).
      </Paragraph>
      <Paragraph>
        <strong style={{ color: '#F0F0F5' }}>Eligibility:</strong> Users must hold csINJ for <InlineCode>min_epochs_regular</InlineCode> epochs
        for regular draws and <InlineCode>min_epochs_big</InlineCode> epochs for big draws. Re-staking resets the eligibility timer.
      </Paragraph>
    </div>
  )
}

function StakingHubExecuteSection() {
  return (
    <div>
      <SectionHeading>Staking Hub — Execute Messages</SectionHeading>

      <MsgCard
        title="Stake"
        description="Stake INJ to receive csINJ. The protocol delegates INJ across validators. csINJ minted = inj_amount / exchange_rate. Rejects if amount < min_stake_amount. Resets user's epoch eligibility timer."
      >{`{ "stake": {} }
// funds: [{ "denom": "inj", "amount": "1000000000000000000" }]`}</MsgCard>

      <MsgCard
        title="Unstake"
        description="Burn csINJ to begin unbonding. INJ owed = csinj_amount * exchange_rate. Subject to 21-day unbonding period."
      >{`{ "unstake": {} }
// funds: [{ "denom": "factory/{contract}/csINJ", "amount": "1000000" }]`}</MsgCard>

      <MsgCard
        title="Claim Unstaked"
        description="Claim unlocked unstake requests after the 21-day unbonding period."
      >{`{ "claim_unstaked": { "request_ids": [0, 1] } }`}</MsgCard>

      <MsgCard
        title="Claim Rewards (operator)"
        description="Claims staking rewards from all validators. Must be called before distribute_rewards."
      >{`{ "claim_rewards": {} }`}</MsgCard>

      <MsgCard
        title="Distribute Rewards (operator)"
        description="Distributes claimed rewards and advances the epoch. Enforces epoch_duration_seconds has elapsed. Splits surplus according to BPS config."
      >{`{ "distribute_rewards": {} }`}</MsgCard>

      <MsgCard
        title="Take Snapshot (operator)"
        description="Submit snapshot merkle root for the current epoch. Forwards the snapshot to the reward-distributor. Merkle root must be exactly 64 hex characters."
      >{`{ "take_snapshot": {
  "merkle_root": "abcdef...",
  "total_weight": "1000000",
  "num_holders": 42,
  "snapshot_uri": "https://..."
} }`}</MsgCard>

      <MsgCard
        title="Update Config (admin)"
        description="Update protocol configuration. BPS fields must sum to 10000."
      >{`{ "update_config": {
  "admin": "inj1...",
  "operator": "inj1...",
  "protocol_fee_bps": 500,
  "base_yield_bps": 500,
  "regular_pool_bps": 7000,
  "big_pool_bps": 2000,
  "min_epochs_regular": 1,
  "min_epochs_big": 4,
  "min_stake_amount": "1000"
} }`}</MsgCard>

      <MsgCard
        title="Update Validators (admin)"
        description="Add or remove validators. Removed validators are automatically redelegated. Addresses must start with 'injvaloper'."
      >{`{ "update_validators": {
  "add": ["injvaloper1..."],
  "remove": []
} }`}</MsgCard>

      <MsgCard
        title="Sync Delegations (operator)"
        description="Sync backing with actual validator delegations after slashing. Updates TOTAL_INJ_BACKING, EPOCH_STATE.total_staked, and exchange rate."
      >{`{ "sync_delegations": {} }`}</MsgCard>
    </div>
  )
}

function StakingHubQuerySection() {
  return (
    <div>
      <SectionHeading>Staking Hub — Query Messages</SectionHeading>

      <MsgCard
        title="Config"
        description="Returns the full contract configuration including admin, operator, validators, BPS settings, and epoch parameters."
      >{`{ "config": {} }

// Returns: Config
{
  "admin": "inj1...",
  "operator": "inj1...",
  "reward_distributor": "inj1...",
  "drand_oracle": "inj1...",
  "csinj_denom": "factory/inj1.../csINJ",
  "validators": ["injvaloper1..."],
  "epoch_duration_seconds": 86400,
  "protocol_fee_bps": 500,
  "treasury": "inj1...",
  "base_yield_bps": 500,
  "regular_pool_bps": 7000,
  "big_pool_bps": 2000,
  "min_epochs_regular": 1,
  "min_epochs_big": 4,
  "min_stake_amount": "1000"
}`}</MsgCard>

      <MsgCard
        title="Epoch State"
        description="Returns the current epoch number, start time, total staked, and snapshot information."
      >{`{ "epoch_state": {} }

// Returns: EpochState
{
  "current_epoch": 5,
  "epoch_start_time": "1234567890.000000000",
  "total_staked": "100000000",
  "snapshot_merkle_root": "abcdef..." | null,
  "snapshot_finalized": true,
  "snapshot_total_weight": "100000000",
  "snapshot_num_holders": 42,
  "snapshot_uri": "https://..." | null
}`}</MsgCard>

      <MsgCard
        title="Exchange Rate"
        description="Returns the current exchange rate and backing totals."
      >{`{ "exchange_rate": {} }

// Returns: ExchangeRateResponse
{
  "rate": "1.05",
  "total_inj_backing": "105000000",
  "total_csinj_supply": "100000000"
}`}</MsgCard>

      <MsgCard
        title="Unstake Requests"
        description="Returns pending unstake requests for a given address."
      >{`{ "unstake_requests": { "address": "inj1..." } }

// Returns: UnstakeRequestEntry[]
[{
  "id": 0,
  "request": {
    "inj_amount": "50000000",
    "csinj_burned": "47619047",
    "unlock_time": "1234567890.000000000",
    "claimed": false
  }
}]`}</MsgCard>

      <MsgCard
        title="Staker Info"
        description="Returns eligibility info for a staker — the epoch of their most recent stake."
      >{`{ "staker_info": { "address": "inj1..." } }

// Returns: StakerInfoResponse
{
  "address": "inj1...",
  "stake_epoch": 5 | null
}`}</MsgCard>
    </div>
  )
}

function RewardDistributorSection() {
  return (
    <div>
      <SectionHeading>Reward Distributor</SectionHeading>
      <Paragraph>
        The Reward Distributor manages the prize draw lifecycle using a commit-reveal scheme with
        drand randomness. It holds the regular and big prize pool balances, verifies merkle proofs
        for winner inclusion, and handles reward payouts.
      </Paragraph>

      <SubHeading>Draw Lifecycle</SubHeading>
      <div style={styles.deployList}>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>1</span>
          <div>
            <strong style={{ color: '#F0F0F5' }}>Fund Pools</strong> — Staking Hub sends INJ via FundRegularPool / FundBigPool during AdvanceEpoch
          </div>
        </div>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>2</span>
          <div>
            <strong style={{ color: '#F0F0F5' }}>Set Snapshot</strong> — Staking Hub forwards merkle root via SetSnapshot during TakeSnapshot
          </div>
        </div>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>3</span>
          <div>
            <strong style={{ color: '#F0F0F5' }}>Commit</strong> — Operator commits sha256(secret) and target drand round
          </div>
        </div>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>4</span>
          <div>
            <strong style={{ color: '#F0F0F5' }}>Reveal</strong> — After drand beacon, operator reveals secret + computed winner with merkle proof
          </div>
        </div>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>5</span>
          <div>
            <strong style={{ color: '#F0F0F5' }}>Expire</strong> — If operator fails to reveal within deadline, anyone can expire to return funds to pool
          </div>
        </div>
      </div>

      <SubHeading>Winner Selection</SubHeading>
      <CodeBlock>{`final_randomness = drand_randomness XOR sha256(operator_secret)
winning_ticket = u128_from_be(final_randomness[0..16]) % total_weight

// Winner is the holder whose [cumulative_start, cumulative_end)
// range contains the winning ticket`}</CodeBlock>
    </div>
  )
}

function RewardDistributorExecuteSection() {
  return (
    <div>
      <SectionHeading>Reward Distributor — Execute Messages</SectionHeading>

      <MsgCard
        title="Fund Regular Pool (staking_hub only)"
        description="Deposits INJ into the regular draw prize pool."
      >{`{ "fund_regular_pool": {} }
// funds: [{ "denom": "inj", "amount": "..." }]`}</MsgCard>

      <MsgCard
        title="Fund Big Pool (staking_hub only)"
        description="Deposits INJ into the big draw prize pool."
      >{`{ "fund_big_pool": {} }
// funds: [{ "denom": "inj", "amount": "..." }]`}</MsgCard>

      <MsgCard
        title="Set Snapshot (staking_hub only)"
        description="Sets the merkle snapshot for an epoch. Cannot overwrite an existing snapshot."
      >{`{ "set_snapshot": {
  "epoch": 1,
  "merkle_root": "abcdef...",
  "total_weight": "1000000",
  "num_holders": 42
} }`}</MsgCard>

      <MsgCard
        title="Commit Draw (operator)"
        description="Commits to a draw with a hash of the operator secret and target drand round. Uses the full pool balance as the reward amount. Epoch must match latest snapshot."
      >{`{ "commit_draw": {
  "draw_type": "regular",
  "operator_commit": "sha256hex",
  "target_drand_round": 1000,
  "epoch": 1
} }`}</MsgCard>

      <MsgCard
        title="Reveal Draw (operator)"
        description="Reveals the draw with the operator secret, winner address, and merkle proof. Verifies proof on-chain and pays out the winner."
      >{`{ "reveal_draw": {
  "draw_id": 0,
  "operator_secret_hex": "hex_of_secret_bytes",
  "winner_address": "inj1...",
  "winner_cumulative_start": "100",
  "winner_cumulative_end": "350",
  "merkle_proof": ["hex_hash_1", "hex_hash_2"]
} }`}</MsgCard>

      <MsgCard
        title="Expire Draw (anyone)"
        description="Expires an unrevealed draw past the reveal deadline. Returns funds to the respective pool."
      >{`{ "expire_draw": { "draw_id": 0 } }`}</MsgCard>

      <MsgCard
        title="Update Config (admin)"
        description="Update distributor configuration. Reveal deadline must be between 300-86400 seconds."
      >{`{ "update_config": {
  "operator": "inj1...",
  "staking_hub": "inj1...",
  "reveal_deadline_seconds": 3600,
  "epochs_between_regular": 1,
  "epochs_between_big": 7
} }`}</MsgCard>
    </div>
  )
}

function RewardDistributorQuerySection() {
  return (
    <div>
      <SectionHeading>Reward Distributor — Query Messages</SectionHeading>

      <MsgCard
        title="Config"
        description="Returns the distributor configuration."
      >{`{ "config": {} }

// Returns: DistributorConfig
{
  "admin": "inj1...",
  "operator": "inj1...",
  "staking_hub": "inj1...",
  "drand_oracle": "inj1...",
  "reveal_deadline_seconds": 3600,
  "epochs_between_regular": 1,
  "epochs_between_big": 7
}`}</MsgCard>

      <MsgCard
        title="Draw State"
        description="Returns global draw state including pool balances and counters."
      >{`{ "draw_state": {} }

// Returns: DrawStateInfo
{
  "next_draw_id": 5,
  "regular_pool_balance": "40000000",
  "big_pool_balance": "200000000",
  "total_draws_completed": 4,
  "total_rewards_distributed": "40000000",
  "last_regular_draw_epoch": 4 | null,
  "last_big_draw_epoch": 1 | null
}`}</MsgCard>

      <MsgCard
        title="Draw"
        description="Returns full details for a specific draw."
      >{`{ "draw": { "draw_id": 0 } }

// Returns: Draw
{
  "id": 0,
  "draw_type": "regular",
  "epoch": 1,
  "status": "revealed",
  "operator_commit": "sha256hex",
  "target_drand_round": 1000,
  "winner": "inj1..." | null,
  "reward_amount": "10000000",
  "created_at": "1234567890.000000000",
  "revealed_at": "1234567900.000000000" | null,
  "reveal_deadline": "1234571490.000000000"
}`}</MsgCard>

      <MsgCard
        title="Draw History"
        description="Returns paginated draw history."
      >{`{ "draw_history": { "start_after": 0, "limit": 10 } }

// Returns: { "draws": [Draw, ...] }`}</MsgCard>

      <MsgCard
        title="Pool Balances"
        description="Returns current pool balances."
      >{`{ "pool_balances": {} }

// Returns:
{ "regular_pool": "40000000", "big_pool": "200000000" }`}</MsgCard>

      <MsgCard
        title="User Wins"
        description="Returns a summary of a user's wins."
      >{`{ "user_wins": { "address": "inj1..." } }

// Returns: UserWinsResponse
{
  "address": "inj1...",
  "total_wins": 2,
  "total_won_amount": "20000000",
  "draw_ids": [0, 3]
}`}</MsgCard>

      <MsgCard
        title="Verify Inclusion"
        description="Verify a merkle inclusion proof. Useful for frontend validation."
      >{`{ "verify_inclusion": {
  "merkle_root": "abcdef...",
  "proof": ["hex1", "hex2"],
  "leaf_address": "inj1...",
  "cumulative_start": "100",
  "cumulative_end": "350"
} }

// Returns: bool`}</MsgCard>

      <MsgCard
        title="Snapshot"
        description="Returns the snapshot for a given epoch."
      >{`{ "snapshot": { "epoch": 1 } }

// Returns: Snapshot | null
{
  "epoch": 1,
  "merkle_root": "abcdef...",
  "total_weight": "1000000",
  "num_holders": 42,
  "submitted_at": "1234567890.000000000"
}`}</MsgCard>
    </div>
  )
}

function DrandOracleSection() {
  return (
    <div>
      <SectionHeading>drand Oracle</SectionHeading>
      <Paragraph>
        The drand Oracle stores and verifies drand quicknet beacons. These BLS threshold signatures
        from the League of Entropy provide publicly verifiable randomness used by the Reward Distributor
        for winner selection.
      </Paragraph>
      <Paragraph>
        drand quicknet produces a new beacon every 3 seconds. The oracle contract verifies the BLS
        signature against the hardcoded quicknet public key before storing a beacon.
      </Paragraph>
    </div>
  )
}

function DrandOracleExecuteSection() {
  return (
    <div>
      <SectionHeading>drand Oracle — Execute Messages</SectionHeading>

      <MsgCard
        title="Submit Beacon (operator)"
        description="Submit a verified drand beacon. The contract verifies the BLS signature on-chain."
      >{`{ "submit_beacon": {
  "round": 1000,
  "signature_hex": "b446..."
} }`}</MsgCard>

      <MsgCard
        title="Update Operators (admin)"
        description="Add or remove authorized beacon submitters."
      >{`{ "update_operators": {
  "add": ["inj1..."],
  "remove": []
} }`}</MsgCard>

      <MsgCard
        title="Update Admin (admin)"
        description="Transfer admin rights to a new address."
      >{`{ "update_admin": { "new_admin": "inj1..." } }`}</MsgCard>
    </div>
  )
}

function DrandOracleQuerySection() {
  return (
    <div>
      <SectionHeading>drand Oracle — Query Messages</SectionHeading>

      <MsgCard
        title="Config"
        description="Returns the oracle configuration including the quicknet public key and chain hash."
      >{`{ "config": {} }

// Returns: OracleConfig
{
  "admin": "inj1...",
  "operators": ["inj1..."],
  "quicknet_pubkey": [/* bytes */],
  "chain_hash": "52db...",
  "genesis_time": 1692803367,
  "period_seconds": 3
}`}</MsgCard>

      <MsgCard
        title="Beacon"
        description="Returns a stored beacon by round number."
      >{`{ "beacon": { "round": 1000 } }

// Returns: StoredBeacon | null
{
  "round": 1000,
  "randomness": [/* 32 bytes */],
  "signature": [/* 48 bytes */],
  "verified": true,
  "submitted_at": "1234567890.000000000",
  "submitted_by": "inj1..."
}`}</MsgCard>

      <MsgCard
        title="Latest Round"
        description="Returns the latest stored round number."
      >{`{ "latest_round": {} }

// Returns: u64`}</MsgCard>
    </div>
  )
}

function InteractionsSection() {
  return (
    <div>
      <SectionHeading>Contract Interactions</SectionHeading>
      <Paragraph>
        The three contracts communicate via cross-contract messages during the epoch lifecycle:
      </Paragraph>

      <SubHeading>Epoch Flow</SubHeading>
      <div style={styles.flowContainer}>
        <div style={styles.flowStep}>
          <div style={styles.flowLabel}>1. Claim Rewards</div>
          <div style={styles.flowDesc}>
            <InlineCode>staking-hub.claim_rewards()</InlineCode>
            <br />Sends WithdrawDelegatorReward to all validators
          </div>
        </div>
        <ArrowDown size={16} color="#2A2A38" style={{ margin: '8px auto', display: 'block' }} />
        <div style={styles.flowStep}>
          <div style={styles.flowLabel}>2. Distribute Rewards</div>
          <div style={styles.flowDesc}>
            <InlineCode>staking-hub.distribute_rewards()</InlineCode>
            <br />Advances epoch, splits rewards by BPS config
            <br />Calls <InlineCode>reward-distributor.fund_regular_pool()</InlineCode> and <InlineCode>reward-distributor.fund_big_pool()</InlineCode>
          </div>
        </div>
        <ArrowDown size={16} color="#2A2A38" style={{ margin: '8px auto', display: 'block' }} />
        <div style={styles.flowStep}>
          <div style={styles.flowLabel}>3. Take Snapshot</div>
          <div style={styles.flowDesc}>
            <InlineCode>staking-hub.take_snapshot()</InlineCode>
            <br />Forwards merkle root to <InlineCode>reward-distributor.set_snapshot()</InlineCode>
          </div>
        </div>
        <ArrowDown size={16} color="#2A2A38" style={{ margin: '8px auto', display: 'block' }} />
        <div style={styles.flowStep}>
          <div style={styles.flowLabel}>4. Commit Draw</div>
          <div style={styles.flowDesc}>
            <InlineCode>reward-distributor.commit_draw()</InlineCode>
            <br />Operator commits hash + target drand round
          </div>
        </div>
        <ArrowDown size={16} color="#2A2A38" style={{ margin: '8px auto', display: 'block' }} />
        <div style={styles.flowStep}>
          <div style={styles.flowLabel}>5. Submit Beacon</div>
          <div style={styles.flowDesc}>
            <InlineCode>drand-oracle.submit_beacon()</InlineCode>
            <br />Beacon verified and stored on-chain
          </div>
        </div>
        <ArrowDown size={16} color="#2A2A38" style={{ margin: '8px auto', display: 'block' }} />
        <div style={styles.flowStep}>
          <div style={styles.flowLabel}>6. Reveal Draw</div>
          <div style={styles.flowDesc}>
            <InlineCode>reward-distributor.reveal_draw()</InlineCode>
            <br />Queries <InlineCode>drand-oracle.beacon()</InlineCode> for randomness
            <br />Verifies merkle proof, pays winner
          </div>
        </div>
      </div>
    </div>
  )
}

function MerkleTreeSection() {
  return (
    <div>
      <SectionHeading>Merkle Tree</SectionHeading>
      <Paragraph>
        The merkle tree uses <strong style={{ color: '#F0F0F5' }}>sorted-pair hashing</strong> (smaller
        hash first when combining siblings) with <strong style={{ color: '#F0F0F5' }}>domain separation</strong> prefixes
        to prevent second pre-image attacks.
      </Paragraph>

      <SubHeading>Leaf Hash</SubHeading>
      <CodeBlock>{`sha256(0x00 || address_bytes || cumulative_start_be_u128 || cumulative_end_be_u128)

// 0x00: leaf domain separator prefix byte
// address_bytes: raw UTF-8 bytes of the bech32 address string
// cumulative_start / cumulative_end: big-endian 16-byte u128`}</CodeBlock>

      <SubHeading>Internal Node Hash</SubHeading>
      <CodeBlock>{`sha256(0x01 || min(left, right) || max(left, right))

// 0x01: internal node domain separator prefix byte
// Sorted pair: smaller hash comes first`}</CodeBlock>

      <SubHeading>Frontend Integration</SubHeading>
      <Paragraph>The frontend needs to:</Paragraph>
      <div style={styles.deployList}>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>1</span>
          <div>Build the tree from snapshot entries</div>
        </div>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>2</span>
          <div>Generate proofs for the winner during reveal_draw</div>
        </div>
        <div style={styles.deployStep}>
          <span style={styles.deployNum}>3</span>
          <div>Optionally verify proofs via the verify_inclusion query</div>
        </div>
      </div>
    </div>
  )
}

function SharedTypesSection() {
  return (
    <div>
      <SectionHeading>Shared Types</SectionHeading>
      <Paragraph>
        Types shared across contracts, defined in the <InlineCode>chance-staking-common</InlineCode> package:
      </Paragraph>

      <MsgCard title="DrawType" description="The type of prize draw.">
        {`type DrawType = "regular" | "big"`}
      </MsgCard>

      <MsgCard title="DrawStatus" description="The current status of a draw.">
        {`type DrawStatus = "committed" | "revealed" | "expired"`}
      </MsgCard>

      <MsgCard title="SnapshotEntry" description="Off-chain type used to build the merkle tree. Each entry represents a csINJ holder's weight range.">
        {`interface SnapshotEntry {
  address: string;       // bech32 address
  balance: string;       // Uint128 csINJ balance
  cumulative_start: string; // Uint128
  cumulative_end: string;   // Uint128
}`}
      </MsgCard>
    </div>
  )
}

function ValidationSection() {
  return (
    <div>
      <SectionHeading>Validation Rules</SectionHeading>
      <Paragraph>
        Post-audit validation rules enforced by the contracts:
      </Paragraph>

      <div style={styles.rulesList}>
        {[
          { title: 'BPS Sum', desc: 'regular_pool_bps + big_pool_bps + base_yield_bps + protocol_fee_bps must equal 10000. Enforced at instantiation and update_config.' },
          { title: 'Validator Addresses', desc: 'Must start with "injvaloper" and be reasonable length. Enforced at instantiation and update_validators.' },
          { title: 'Merkle Root', desc: 'Must be exactly 64 hex characters (32 bytes). Validated in take_snapshot.' },
          { title: 'Reveal Deadline', desc: 'Must be between 300 seconds (5 min) and 86400 seconds (24 hours). Enforced at instantiation and update_config.' },
          { title: 'Epoch Duration', desc: 'distribute_rewards enforces that epoch_duration_seconds has elapsed since epoch start.' },
          { title: 'Snapshot Overwrite', desc: 'Cannot overwrite a snapshot for an epoch that already has one.' },
          { title: 'Zero Weight', desc: 'Snapshots with total_weight = 0 are rejected at commit_draw.' },
          { title: 'Balance Check', desc: 'reveal_draw verifies contract has sufficient balance before payout.' },
          { title: 'Min Stake', desc: 'Stake amount must be >= min_stake_amount (configurable, 0 = no minimum).' },
          { title: 'Draw Epoch', desc: 'commit_draw validates the epoch matches the latest snapshot epoch.' },
        ].map((rule, i) => (
          <div key={i} style={styles.ruleItem}>
            <Shield size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ color: '#F0F0F5' }}>{rule.title}</strong>
              <span style={{ color: '#8E8EA0' }}> — {rule.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Section renderer map ──
const sectionComponents: Record<string, React.ComponentType> = {
  'overview': OverviewSection,
  'staking-hub': StakingHubSection,
  'sh-execute': StakingHubExecuteSection,
  'sh-query': StakingHubQuerySection,
  'reward-distributor': RewardDistributorSection,
  'rd-execute': RewardDistributorExecuteSection,
  'rd-query': RewardDistributorQuerySection,
  'drand-oracle': DrandOracleSection,
  'do-execute': DrandOracleExecuteSection,
  'do-query': DrandOracleQuerySection,
  'interactions': InteractionsSection,
  'merkle-tree': MerkleTreeSection,
  'shared-types': SharedTypesSection,
  'validation': ValidationSection,
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const ActiveComponent = sectionComponents[activeSection] || OverviewSection

  return (
    <div style={styles.page}>
      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroContainer}>
          <h1 style={styles.heroTitle}>Documentation</h1>
          <p style={styles.heroSubtitle}>
            Technical reference for the Chance.Staking protocol smart contracts
          </p>
        </div>
      </section>

      {/* Docs layout */}
      <div className="docs-layout" style={styles.docsLayout}>
        {/* Mobile toggle */}
        <button
          className="docs-sidebar-toggle"
          style={styles.sidebarToggle}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          <span>{sidebarOpen ? 'Close' : 'Sections'}</span>
        </button>

        {/* Sidebar */}
        <aside className={`docs-sidebar${sidebarOpen ? ' open' : ''}`} style={styles.sidebar}>
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setActiveSection(item.key)
                setSidebarOpen(false)
              }}
              style={{
                ...styles.sidebarItem,
                ...(item.parent ? styles.sidebarSubItem : {}),
                ...(activeSection === item.key ? styles.sidebarItemActive : {}),
              }}
            >
              {item.icon && <item.icon size={14} color={activeSection === item.key ? colors.primary : '#8E8EA0'} />}
              {item.parent && <ChevronRight size={10} color="#525260" style={{ marginRight: -2 }} />}
              {item.title}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main style={styles.docsContent}>
          <ActiveComponent />
        </main>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    paddingTop: 64,
  },

  // Hero
  hero: {
    padding: '56px 0 0',
    background: `linear-gradient(180deg, ${colors.primaryAlpha(0.04)} 0%, transparent 100%)`,
  },
  heroContainer: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '0 24px',
    textAlign: 'center',
  },
  heroTitle: {
    fontSize: 46,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.03em',
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#8E8EA0',
    lineHeight: 1.7,
    marginBottom: 0,
  },

  // Docs layout
  docsLayout: {
    display: 'flex',
    maxWidth: 1120,
    margin: '0 auto',
    padding: '40px 24px 80px',
    gap: 40,
  },

  // Sidebar toggle (mobile)
  sidebarToggle: {
    display: 'none',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderRadius: 10,
    border: '1px solid #2A2A38',
    background: '#1A1A22',
    color: '#F0F0F5',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 16,
    width: '100%',
    justifyContent: 'center',
  },

  // Sidebar
  sidebar: {
    width: 240,
    flexShrink: 0,
    position: 'sticky' as const,
    top: 80,
    maxHeight: 'calc(100vh - 96px)',
    overflowY: 'auto' as const,
    paddingRight: 16,
    borderRight: '1px solid #2A2A38',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '9px 14px',
    borderRadius: 8,
    background: 'transparent',
    border: 'none',
    color: '#8E8EA0',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.15s',
  },
  sidebarSubItem: {
    paddingLeft: 32,
    fontSize: 12,
  },
  sidebarItemActive: {
    color: '#F0F0F5',
    background: colors.primaryAlpha(0.08),
    fontWeight: 600,
  },

  // Content
  docsContent: {
    flex: 1,
    minWidth: 0,
  },

  // Content elements
  sectionHeading: {
    fontSize: 28,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.02em',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid #2A2A38',
  },
  subHeading: {
    fontSize: 18,
    fontWeight: 700,
    color: '#F0F0F5',
    marginTop: 32,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 14,
    color: '#8E8EA0',
    lineHeight: 1.7,
    marginBottom: 16,
  },
  inlineCode: {
    background: '#0F0F13',
    padding: '2px 7px',
    borderRadius: 5,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#38bdf8',
  },

  // Code block
  codeBlock: {
    background: '#0F0F13',
    borderRadius: 10,
    padding: '14px 18px',
    overflow: 'auto',
    marginBottom: 16,
    border: '1px solid #1A1A22',
  },
  codePre: {
    margin: 0,
  },
  code: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#38bdf8',
    lineHeight: 1.7,
    whiteSpace: 'pre' as const,
  },

  // Message card
  msgCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 14,
    padding: 20,
    marginBottom: 14,
  },
  msgTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 6,
  },
  msgDesc: {
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.6,
    marginBottom: 12,
  },

  // Architecture grid
  archGrid: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 0,
    marginBottom: 24,
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  archCard: {
    flex: '1 1 200px',
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 14,
    padding: 20,
    textAlign: 'center' as const,
    minWidth: 180,
  },
  archTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F0F0F5',
    marginTop: 10,
    marginBottom: 6,
  },
  archDesc: {
    fontSize: 12,
    color: '#8E8EA0',
    lineHeight: 1.6,
  },
  archArrow: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
  },

  // Deploy list
  deployList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    marginBottom: 24,
  },
  deployStep: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.6,
  },
  deployNum: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: colors.primaryAlpha(0.12),
    color: colors.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },

  // BPS grid
  bpsGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    marginBottom: 24,
  },
  bpsItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.6,
  },
  bpsDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },

  // Flow container
  flowContainer: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 14,
    padding: 24,
    marginBottom: 24,
  },
  flowStep: {
    padding: '12px 16px',
    borderRadius: 10,
    background: '#0F0F13',
    border: '1px solid #2A2A38',
  },
  flowLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.primary,
    marginBottom: 6,
  },
  flowDesc: {
    fontSize: 12,
    color: '#8E8EA0',
    lineHeight: 1.8,
  },

  // Rules list
  rulesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  ruleItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    fontSize: 13,
    lineHeight: 1.6,
    padding: '12px 16px',
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 10,
  },
}
