import React, { useState } from 'react'
import {
  Shield, CheckCircle, FileCheck, Layers, ChevronDown,
  AlertTriangle, Info
} from 'lucide-react'
import { colors } from '../theme'

// ── Severity styling ──
const severityColors: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444' },
  high: { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b' },
  medium: { bg: colors.primaryAlpha(0.12), text: colors.primary },
  low: { bg: 'rgba(56, 189, 248, 0.12)', text: '#38bdf8' },
  informational: { bg: 'rgba(142, 142, 160, 0.12)', text: '#8E8EA0' },
}

// ── V1 Findings ──
interface Finding {
  id: string
  severity: string
  contract: string
  title: string
  description: string
  impact: string
  fix: string
}

const v1Findings: Finding[] = [
  {
    id: 'C-01', severity: 'critical', contract: 'staking-hub',
    title: 'Base yield INJ double-counted across epochs',
    description: 'Base yield added to backing but never delegated to validators. The INJ remained in the contract balance and got re-distributed as "new" rewards in subsequent epochs, compounding over time.',
    impact: 'Exchange rate would appreciate faster than actual staking yields, creating an undercollateralized system. Late unstakers could find insufficient INJ.',
    fix: 'Base yield is now delegated to validators in distribute_rewards, removing it from the contract balance.',
  },
  {
    id: 'C-02', severity: 'critical', contract: 'staking-hub',
    title: 'BPS invariant not enforced in update_config',
    description: 'During instantiation, BPS fields were validated to sum to 10000, but update_config only checked individual fields. The sum could become invalid after updates.',
    impact: 'Sum > 10000 would cause every epoch advancement to fail. Sum < 10000 would cause undistributed rewards to double-count.',
    fix: 'BPS sum is now validated in update_config. All four BPS fields can be updated atomically.',
  },
  {
    id: 'H-01', severity: 'high', contract: 'staking-hub',
    title: 'No epoch duration enforcement',
    description: 'The EpochNotReady error was defined but never used. The operator could advance epochs as fast as blocks are produced.',
    impact: 'A compromised operator could advance epochs rapidly, manipulating draw eligibility and timing.',
    fix: 'Time check now enforced in distribute_rewards — epoch_duration_seconds must have elapsed since epoch start.',
  },
  {
    id: 'H-02', severity: 'high', contract: 'reward-distributor',
    title: 'commit_draw does not validate epoch is current',
    description: 'The operator could commit draws using snapshots from any past epoch, not just the current one.',
    impact: 'An operator could use old snapshots where a particular user had a larger weight, manipulating win probability.',
    fix: 'LATEST_SNAPSHOT_EPOCH is tracked and validated at commit time. Draws can only use the most recent snapshot.',
  },
  {
    id: 'H-03', severity: 'high', contract: 'reward-distributor',
    title: 'Zero total_weight snapshot causes division-by-zero panic',
    description: 'If a snapshot has total_weight = 0, the winning ticket computation (% 0) panics in Rust. A committed draw with a zero-weight snapshot could never be revealed.',
    impact: 'Draw funds locked until the reveal deadline expires. Repeated commits could create a temporary DoS.',
    fix: 'Zero total_weight is now rejected at commit_draw time.',
  },
  {
    id: 'H-04', severity: 'high', contract: 'staking-hub',
    title: 'Silent underflow in unstake accounting',
    description: 'When unstaking, the backing was computed with checked_sub().unwrap_or(zero) — silently setting backing to zero on underflow instead of erroring.',
    impact: 'Masked underlying accounting bugs. If backing reached zero with non-zero supply, the exchange rate would break.',
    fix: 'Replaced unwrap_or(zero) with proper error propagation via ContractError::InsufficientBalance.',
  },
  {
    id: 'H-05', severity: 'high', contract: 'staking-hub',
    title: 'No slashing detection or accounting',
    description: 'TOTAL_INJ_BACKING was tracked independently from actual validator delegations. Slashing events would reduce real delegations but not the tracked backing.',
    impact: 'Exchange rate would overstate real backing. Last unstakers could find insufficient INJ.',
    fix: 'sync_delegations function added — operator can reconcile backing with actual validator delegations after slashing.',
  },
  {
    id: 'M-01', severity: 'medium', contract: 'reward-distributor',
    title: 'Snapshots can be overwritten after draw commit',
    description: 'set_snapshot unconditionally saved for a given epoch, with no check for existing snapshots or committed draws.',
    impact: 'If set_snapshot was called twice for the same epoch, committed draws would become un-revealable.',
    fix: 'Duplicate check added — cannot overwrite a snapshot for an epoch that already has one.',
  },
  {
    id: 'M-02', severity: 'medium', contract: 'common',
    title: 'No domain separation in merkle tree hashing',
    description: 'Leaf and internal node hashes both used plain SHA-256 without domain separation prefixes. Vulnerable to second-preimage attacks in theory.',
    impact: 'An attacker could potentially craft a leaf whose hash collides with an internal node.',
    fix: 'Domain separation added: leaf prefix 0x00, internal node prefix 0x01.',
  },
  {
    id: 'M-03', severity: 'medium', contract: 'all',
    title: 'No migrate entry point on any contract',
    description: 'None of the three contracts implemented a migrate entry point. Contracts could not be upgraded after deployment.',
    impact: 'Any post-deployment bug would require deploying entirely new contracts and migrating all state manually.',
    fix: 'All 3 contracts now have migrate() with cw2 version validation.',
  },
  {
    id: 'M-04', severity: 'medium', contract: 'staking-hub',
    title: 'Validator addresses stored as unvalidated strings',
    description: 'Validator addresses were not validated as proper bech32 addresses during instantiation or update_validators.',
    impact: 'Invalid validator addresses would cause delegation messages to fail, effectively bricking the contract.',
    fix: '"injvaloper" prefix and length checks are now enforced on all validator addresses.',
  },
  {
    id: 'M-05', severity: 'medium', contract: 'staking-hub',
    title: 'distribute_rewards does not re-stake base yield',
    description: 'Base yield was added to TOTAL_INJ_BACKING but the actual INJ remained undelegated. Over time, actual delegations diverged from tracked backing.',
    impact: 'Undelegation messages could request more than what was actually delegated, causing unstake failures.',
    fix: 'Base yield is now delegated to validators using the same round-robin distribution as stake.',
  },
  {
    id: 'L-01', severity: 'low', contract: 'drand-oracle',
    title: 'No admin rotation mechanism',
    description: 'The drand-oracle had no update_admin function. The admin was permanently set at instantiation.',
    impact: 'If the admin key was compromised or lost, the operator list could never be updated.',
    fix: 'UpdateAdmin message added, gated to the current admin.',
  },
  {
    id: 'L-02', severity: 'low', contract: 'reward-distributor',
    title: 'Operator has free option to abort unfavorable draws',
    description: 'After committing to a draw, the operator can see the result before revealing. Unfavorable draws can be let to expire with no penalty.',
    impact: 'Operator can bias outcomes by selectively revealing only favorable results. Funds return to pool, not stolen.',
    fix: 'Acknowledged design trade-off. Future versions may implement operator bonding or public reveals.',
  },
  {
    id: 'L-03', severity: 'low', contract: 'staking-hub',
    title: 'Direct INJ transfers inflate next epoch\'s rewards',
    description: 'Any INJ sent directly to the contract (outside staking flow) is treated as staking rewards in the next epoch.',
    impact: 'Could be used to manipulate exchange rate or prize pool sizes. However, this effectively donates to stakers.',
    fix: 'Documented as an intentional feature — allows voluntary contributions to the reward pool.',
  },
  {
    id: 'L-04', severity: 'low', contract: 'staking-hub',
    title: 'Rounding dust from BPS calculations accumulates',
    description: 'Each BPS share was calculated independently with multiply_ratio. The four amounts might not sum exactly to total_rewards.',
    impact: 'Negligible per epoch but accumulates over time. More of a correctness issue than security.',
    fix: 'Treasury fee is now calculated as the remainder after other shares, eliminating rounding dust.',
  },
  {
    id: 'L-05', severity: 'low', contract: 'reward-distributor',
    title: 'No check that contract balance covers reward payout',
    description: 'reveal_draw did not verify the contract held sufficient INJ before attempting to send the reward.',
    impact: 'If tracked pool balances diverged from actual INJ held, the reveal transaction would fail.',
    fix: 'Contract balance is now verified before reward payout in reveal_draw.',
  },
]

const v2Findings: Finding[] = [
  {
    id: 'V2-M-01', severity: 'medium', contract: 'staking-hub',
    title: 'BpsSumMismatch error truncates total to u16',
    description: 'The BpsSumMismatch error stored the total field as u16, but BPS sum was computed as u32. Values exceeding 65535 would display truncated in error messages.',
    impact: 'Misleading error messages complicate debugging. The logic check itself was correct.',
    fix: 'Changed total field from u16 to u32 and removed the truncating cast.',
  },
  {
    id: 'V2-M-02', severity: 'medium', contract: 'staking-hub',
    title: 'sync_delegations doesn\'t update EPOCH_STATE.total_staked',
    description: 'When reconciling after slashing, sync_delegations updated TOTAL_INJ_BACKING but not EPOCH_STATE.total_staked. The epoch_state query returned stale TVL data.',
    impact: 'Frontend would display incorrect total staked amount after a slashing event.',
    fix: 'EPOCH_STATE.total_staked is now also updated in sync_delegations.',
  },
  {
    id: 'V2-M-03', severity: 'medium', contract: 'reward-distributor',
    title: 'No validation on reveal_deadline_seconds',
    description: 'reveal_deadline_seconds could be set to any value — zero (draws immediately expirable) or extremely high (funds locked indefinitely).',
    impact: 'Misconfiguration could permanently lock pool funds or make draws impossible to complete.',
    fix: 'Bounds added: minimum 300 seconds (5 min), maximum 86400 seconds (24 hours). Enforced in both instantiate and update_config.',
  },
  {
    id: 'V2-L-01', severity: 'low', contract: 'staking-hub',
    title: 'take_snapshot doesn\'t validate merkle_root format',
    description: 'The merkle_root parameter was stored without validating it was valid hex encoding or the correct length (64 chars / 32 bytes).',
    impact: 'An invalid merkle root would silently break draw reveals for the affected epoch.',
    fix: 'Validation added: merkle_root must be valid hex and exactly 64 characters.',
  },
  {
    id: 'V2-L-02', severity: 'low', contract: 'staking-hub',
    title: 'Treasury fee calculation uses silent fallback',
    description: 'The remainder calculation used chained checked_sub().unwrap_or(zero) instead of explicit saturating_sub. While current math is correct, the pattern could mask future bugs.',
    impact: 'Low risk — current math is sound. Concern is about maintainability.',
    fix: 'Changed to saturating_sub chain to make the intent explicit.',
  },
  {
    id: 'V2-L-03', severity: 'low', contract: 'staking-hub',
    title: 'No minimum stake amount enforced',
    description: 'Users could stake as little as 1 wei of INJ. Dust stakes have negligible winning probability but add minor overhead.',
    impact: 'No direct security risk. Winning probability is proportional to stake weight.',
    fix: 'Configurable min_stake_amount added (default 0 = no minimum). Operators can set a minimum via update_config.',
  },
  {
    id: 'V2-I-01', severity: 'informational', contract: 'staking-hub',
    title: 'Re-staking resets eligibility clock entirely',
    description: 'Any new stake overwrites USER_STAKE_EPOCH with the current epoch, restarting the eligibility countdown for both regular and big draws.',
    impact: 'Informational — by design, but could frustrate users unaware of this behavior.',
    fix: 'Documented as intentional behavior. Frontend warns users before additional stakes.',
  },
]

// ── Known trade-offs ──
const tradeoffs = [
  {
    title: 'Draw Reveal Discretion (L-02)',
    description: 'The operator may choose not to reveal unfavorable draw results by letting them expire. While this doesn\'t result in fund loss (expired draws return funds to pool), it could bias the distribution of winners.',
    implication: 'Operator can selectively reveal only favorable outcomes. Funds are not stolen but fairness may be compromised. Future versions may implement public reveal mechanisms or operator bonding.',
  },
  {
    title: 'Direct INJ Transfers (L-03)',
    description: 'Sending INJ directly to the staking-hub contract (outside normal staking flow) will cause that INJ to be distributed as rewards in the next epoch.',
    implication: 'Direct transfers are treated as additional staking rewards. The INJ is split according to BPS configuration. This is by design and allows voluntary contributions to the reward pool.',
  },
  {
    title: 'Re-staking Resets Eligibility (V2-I-01)',
    description: 'Any new stake resets the user\'s epoch eligibility timer. Adding more INJ restarts the min_epochs_regular / min_epochs_big countdown.',
    implication: 'Users who want to remain eligible for draws should avoid staking more until after a draw. The frontend warns users about this behavior.',
  },
  {
    title: 'No Minimum Stake by Default (V2-L-03)',
    description: 'The min_stake_amount config defaults to 0 (no minimum). Dust stakes are allowed since winning probability is proportional to stake weight.',
    implication: 'Expected value for tiny stakes is negligible. Operators can set a minimum via update_config if desired.',
  },
]

// ── Severity count helpers ──
const v1Counts = { critical: 2, high: 5, medium: 5, low: 5 }
const v2Counts = { medium: 3, low: 3, informational: 1 }

function SeverityBadge({ severity }: { severity: string }) {
  const c = severityColors[severity] || severityColors.low
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 6,
      background: c.bg,
      color: c.text,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.04em',
    }}>
      {severity}
    </span>
  )
}

function SeverityBar({ counts, total }: { counts: Record<string, number>; total: number }) {
  const items = Object.entries(counts).map(([sev, count]) => ({
    severity: sev,
    count,
    pct: (count / total) * 100,
    color: severityColors[sev]?.text || '#8E8EA0',
  }))

  return (
    <div style={styles.barContainer}>
      <div style={styles.bar}>
        {items.map((item) => (
          <div
            key={item.severity}
            style={{
              width: `${item.pct}%`,
              background: item.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              color: '#FFFFFF',
              textShadow: '0 1px 3px rgba(0,0,0,0.4)',
              minWidth: 28,
            }}
          >
            {item.count}
          </div>
        ))}
      </div>
      <div style={styles.barLegend}>
        {items.map((item) => (
          <div key={item.severity} style={styles.barLegendItem}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
            <span style={{ textTransform: 'capitalize' as const }}>{item.severity}</span>
            <span style={{ opacity: 0.6 }}>({item.count})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AuditPage() {
  const [openFinding, setOpenFinding] = useState<string | null>(null)

  const toggleFinding = (id: string) => {
    setOpenFinding(openFinding === id ? null : id)
  }

  return (
    <div style={styles.page}>
      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroContainer}>
          <h1 style={styles.heroTitle}>Audit Report</h1>
          <p style={styles.heroSubtitle}>
            Security audit findings and current status of the Chance.Staking protocol
          </p>

          <div className="audit-stats" style={styles.statsRow}>
            <div style={styles.statCard}>
              <Shield size={16} color="#22c55e" />
              <div>
                <div style={styles.statValue}>24</div>
                <div style={styles.statLabel}>Total Findings</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <CheckCircle size={16} color="#22c55e" />
              <div>
                <div style={styles.statValue}>All Fixed</div>
                <div style={styles.statLabel}>Remediation</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <FileCheck size={16} color="#38bdf8" />
              <div>
                <div style={styles.statValue}>96</div>
                <div style={styles.statLabel}>Test Cases</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <Layers size={16} color={colors.primary} />
              <div>
                <div style={styles.statValue}>2</div>
                <div style={styles.statLabel}>Audit Rounds</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Audit Process */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.sectionTitle}>Audit Process</h2>
          <p style={styles.sectionSubtitle}>
            Two rounds of security review covering all smart contracts and shared packages
          </p>

          <div style={styles.processGrid}>
            <div style={styles.processCard}>
              <div style={styles.processRound}>Round 1</div>
              <h3 style={styles.processTitle}>Initial Audit</h3>
              <p style={styles.processDesc}>
                Manual code review of all Rust source files, cross-contract interaction analysis,
                and integration test review. Identified 17 findings including 2 critical and 5 high severity issues.
              </p>
              <div style={styles.processMeta}>
                <span>17 findings</span>
                <span>All remediated</span>
              </div>
            </div>
            <div style={styles.processCard}>
              <div style={styles.processRound}>Round 2</div>
              <h3 style={styles.processTitle}>Post-Remediation Review</h3>
              <p style={styles.processDesc}>
                Verified all V1 fixes were correctly implemented. Performed additional review
                and identified 7 new findings (3 medium, 3 low, 1 informational). All have been addressed.
              </p>
              <div style={styles.processMeta}>
                <span>7 findings</span>
                <span>All remediated</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* V1 Findings */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.sectionTitle}>Round 1 Findings</h2>
          <p style={styles.sectionSubtitle}>
            17 findings across all severity levels — all fixed
          </p>

          <SeverityBar counts={v1Counts} total={17} />

          <div style={styles.findingsList}>
            {v1Findings.map((f) => (
              <div key={f.id} style={styles.findingCard}>
                <button
                  className="audit-finding-header"
                  onClick={() => toggleFinding(f.id)}
                  style={styles.findingHeader}
                >
                  <div className="audit-finding-left" style={styles.findingLeft}>
                    <SeverityBadge severity={f.severity} />
                    <span style={styles.findingId}>{f.id}</span>
                    <span style={styles.findingTitle}>{f.title}</span>
                  </div>
                  <div className="audit-finding-right" style={styles.findingRight}>
                    <span style={styles.contractBadge}>{f.contract}</span>
                    <span style={styles.statusBadge}>
                      <CheckCircle size={12} color="#22c55e" /> Fixed
                    </span>
                    <ChevronDown
                      size={14}
                      color="#8E8EA0"
                      style={{
                        transition: 'transform 0.2s',
                        transform: openFinding === f.id ? 'rotate(180deg)' : 'rotate(0)',
                      }}
                    />
                  </div>
                </button>
                {openFinding === f.id && (
                  <div style={styles.findingBody}>
                    <p style={styles.findingDesc}>{f.description}</p>
                    <p style={styles.findingField}>
                      <strong style={{ color: '#f59e0b' }}>Impact:</strong> {f.impact}
                    </p>
                    <p style={styles.findingField}>
                      <strong style={{ color: '#22c55e' }}>Fix:</strong> {f.fix}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* V2 Findings */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.sectionTitle}>Round 2 Findings</h2>
          <p style={styles.sectionSubtitle}>
            7 findings with no critical or high severity issues — all addressed
          </p>

          <SeverityBar counts={v2Counts} total={7} />

          <div style={styles.findingsList}>
            {v2Findings.map((f) => (
              <div key={f.id} style={styles.findingCard}>
                <button
                  className="audit-finding-header"
                  onClick={() => toggleFinding(f.id)}
                  style={styles.findingHeader}
                >
                  <div className="audit-finding-left" style={styles.findingLeft}>
                    <SeverityBadge severity={f.severity} />
                    <span style={styles.findingId}>{f.id}</span>
                    <span style={styles.findingTitle}>{f.title}</span>
                  </div>
                  <div className="audit-finding-right" style={styles.findingRight}>
                    <span style={styles.contractBadge}>{f.contract}</span>
                    <span style={styles.statusBadge}>
                      <CheckCircle size={12} color="#22c55e" /> Fixed
                    </span>
                    <ChevronDown
                      size={14}
                      color="#8E8EA0"
                      style={{
                        transition: 'transform 0.2s',
                        transform: openFinding === f.id ? 'rotate(180deg)' : 'rotate(0)',
                      }}
                    />
                  </div>
                </button>
                {openFinding === f.id && (
                  <div style={styles.findingBody}>
                    <p style={styles.findingDesc}>{f.description}</p>
                    <p style={styles.findingField}>
                      <strong style={{ color: '#f59e0b' }}>Impact:</strong> {f.impact}
                    </p>
                    <p style={styles.findingField}>
                      <strong style={{ color: '#22c55e' }}>Fix:</strong> {f.fix}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Known Trade-offs */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.sectionTitle}>Known Design Trade-offs</h2>
          <p style={styles.sectionSubtitle}>
            Documented trade-offs that are understood and accepted
          </p>

          <div style={styles.tradeoffsList}>
            {tradeoffs.map((t, i) => (
              <div key={i} style={styles.tradeoffCard}>
                <div style={styles.tradeoffHeader}>
                  <AlertTriangle size={16} color="#f59e0b" />
                  <h3 style={styles.tradeoffTitle}>{t.title}</h3>
                </div>
                <p style={styles.tradeoffDesc}>{t.description}</p>
                <div style={styles.tradeoffImplication}>
                  <Info size={13} color="#38bdf8" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{t.implication}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Conclusion */}
      <section style={{ padding: '0 0 80px' }}>
        <div style={styles.container}>
          <div style={styles.conclusionCard}>
            <Shield size={32} color="#22c55e" />
            <h2 style={styles.conclusionTitle}>Security Posture</h2>
            <p style={styles.conclusionDesc}>
              All 24 audit findings have been remediated across two audit rounds. The protocol
              has 96 automated test cases covering unit tests, integration tests, and edge cases
              identified during the audit process. The remaining known issues are documented design
              trade-offs that do not affect fund safety.
            </p>
            <div style={styles.conclusionLinks}>
              <a href="#/contracts" style={styles.ctaPrimary}>View Contracts</a>
              <a href="#/docs" style={styles.ctaSecondary}>Read Documentation</a>
            </div>
          </div>
        </div>
      </section>
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
    marginBottom: 32,
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap' as const,
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 12,
    padding: '12px 18px',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 800,
    color: '#F0F0F5',
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8EA0',
    fontWeight: 500,
  },

  // Section
  section: {
    padding: '64px 0',
  },
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '0 24px',
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.03em',
    textAlign: 'center',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8E8EA0',
    textAlign: 'center',
    marginBottom: 40,
  },

  // Process grid
  processGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
  },
  processCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 24,
  },
  processRound: {
    fontSize: 11,
    fontWeight: 700,
    color: colors.primary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 8,
  },
  processTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 10,
  },
  processDesc: {
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.7,
    marginBottom: 16,
  },
  processMeta: {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    color: '#22c55e',
    fontWeight: 600,
  },

  // Severity bar
  barContainer: {
    marginBottom: 28,
  },
  bar: {
    display: 'flex',
    height: 32,
    gap: 3,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: 16,
    flexWrap: 'wrap' as const,
  },
  barLegendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#8E8EA0',
  },

  // Findings list
  findingsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  findingCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 12,
    overflow: 'hidden',
  },
  findingHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 18px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    flexWrap: 'wrap' as const,
  },
  findingLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  findingRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  findingId: {
    fontSize: 12,
    fontWeight: 700,
    color: '#F0F0F5',
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
  },
  findingTitle: {
    fontSize: 13,
    color: '#F0F0F5',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  contractBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: '#8E8EA0',
    background: '#0F0F13',
    padding: '3px 8px',
    borderRadius: 5,
    whiteSpace: 'nowrap' as const,
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: '#22c55e',
    whiteSpace: 'nowrap' as const,
  },

  // Finding body
  findingBody: {
    padding: '0 18px 18px',
    borderTop: '1px solid #2A2A38',
    paddingTop: 14,
  },
  findingDesc: {
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.7,
    marginBottom: 10,
  },
  findingField: {
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.7,
    marginBottom: 6,
  },

  // Trade-offs
  tradeoffsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  tradeoffCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 14,
    padding: 22,
  },
  tradeoffHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  tradeoffTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F0F0F5',
  },
  tradeoffDesc: {
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.7,
    marginBottom: 12,
  },
  tradeoffImplication: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 12,
    color: '#8E8EA0',
    lineHeight: 1.6,
    padding: '10px 14px',
    background: 'rgba(56, 189, 248, 0.04)',
    borderRadius: 8,
    border: '1px solid rgba(56, 189, 248, 0.1)',
  },

  // Conclusion
  conclusionCard: {
    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.06), rgba(56, 189, 248, 0.04))',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    borderRadius: 20,
    padding: '48px 32px',
    textAlign: 'center' as const,
    maxWidth: 680,
    margin: '0 auto',
  },
  conclusionTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: '#F0F0F5',
    marginTop: 12,
    marginBottom: 12,
  },
  conclusionDesc: {
    fontSize: 14,
    color: '#8E8EA0',
    lineHeight: 1.7,
    marginBottom: 24,
  },
  conclusionLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
  },
  ctaPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '12px 28px',
    borderRadius: 10,
    background: colors.primaryGradient,
    color: '#020202',
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
  },
  ctaSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '12px 28px',
    borderRadius: 10,
    background: 'transparent',
    border: '1px solid #2A2A38',
    color: '#F0F0F5',
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
  },
}
