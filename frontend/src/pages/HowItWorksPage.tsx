import React, { useState } from 'react'
import {
  Coins, TrendingUp, Shuffle, Trophy, ArrowRight, Clock, Zap,
  Shield, Lock, ChevronDown, Eye, Hash, Target, Layers, FileCheck
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { colors } from '../theme'
import { formatNumber } from '../utils/formatNumber'
import RewardsCalculator from '../components/RewardsCalculator'

// ── Step data ──
const steps = [
  {
    icon: Coins,
    color: colors.primary,
    bg: colors.primaryAlpha(0.1),
    borderColor: colors.primaryAlpha(0.2),
    title: 'Stake INJ',
    short: 'Deposit INJ and receive csINJ',
    detail: 'When you stake INJ, the protocol delegates it across multiple validators for native staking. You receive csINJ — a liquid staking token whose exchange rate against INJ increases over time as staking rewards accrue. csINJ can be held, transferred, or used in DeFi while your INJ earns rewards.',
  },
  {
    icon: TrendingUp,
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.2)',
    title: 'Earn Base Yield',
    short: '5% of rewards boost csINJ value',
    detail: '5% of all staking rewards are added to the INJ backing pool, increasing the csINJ exchange rate for all holders. This provides a guaranteed minimum yield regardless of draw outcomes. The exchange rate is calculated as total_inj_backing / total_csinj_supply.',
  },
  {
    icon: Shuffle,
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.2)',
    title: 'Enter Prize Draws',
    short: '90% of rewards fund prize pools',
    detail: 'The remaining 90% of staking rewards (after protocol fees) are split between regular and big draw prize pools. Your csINJ balance at the time of the snapshot determines your ticket weight — more csINJ means more chances to win. Every holder is automatically entered.',
  },
  {
    icon: Trophy,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.2)',
    title: 'Win Prizes',
    short: 'Verifiable randomness selects winners',
    detail: 'Winners are selected using drand randomness beacons combined with an operator commit-reveal scheme. This ensures the result is publicly verifiable and tamper-proof. The winning ticket is mapped to a holder\'s cumulative weight range, verified via merkle proofs.',
  },
]

// ── Reward distribution data ──
const distributions = [
  { label: 'Regular Draws', pct: 70, color: colors.primary, gradient: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryDark})` },
  { label: 'Big Weekly Draw', pct: 20, color: '#f472b6', gradient: 'linear-gradient(90deg, #f472b6, #ec4899)' },
  { label: 'Base Yield', pct: 5, color: '#22c55e', gradient: '#22c55e' },
  { label: 'Protocol Fee', pct: 5, color: '#f59e0b', gradient: '#f59e0b' },
]

// ── Draw lifecycle steps ──
const drawSteps = [
  {
    icon: Layers,
    color: '#38bdf8',
    title: '1. Snapshot',
    desc: 'All csINJ holders\' balances are recorded as cumulative weight ranges. A merkle root of the snapshot is published on-chain.',
    code: 'leaf = sha256(address || start_be128 || end_be128)',
  },
  {
    icon: Lock,
    color: colors.primary,
    title: '2. Commit',
    desc: 'The operator commits a hash of their secret along with a target drand round number. This locks in the randomness source before the beacon is produced.',
    code: 'operator_commit = sha256(secret)',
  },
  {
    icon: Zap,
    color: '#f59e0b',
    title: '3. Beacon',
    desc: 'The drand quicknet network produces a publicly verifiable randomness beacon at the target round. Anyone can verify the BLS threshold signature.',
    code: 'drand_randomness = verify(round, signature)',
  },
  {
    icon: Eye,
    color: '#22c55e',
    title: '4. Reveal',
    desc: 'The operator reveals their secret. The final randomness is computed by XOR-ing the drand beacon with the hash of the operator secret.',
    code: 'final = drand_randomness XOR sha256(operator_secret)',
  },
  {
    icon: Hash,
    color: '#f472b6',
    title: '5. Selection',
    desc: 'The winning ticket number is derived from the final randomness. This is a uniform random number within the total weight range.',
    code: 'ticket = u128(final[0..16]) % total_weight',
  },
  {
    icon: Target,
    color: '#fbbf24',
    title: '6. Winner',
    desc: 'The holder whose cumulative weight range [start, end) contains the winning ticket is the winner. Verified via merkle inclusion proof.',
    code: 'winner: start <= ticket < end',
  },
]

// ── FAQ data ──
const faqItems = [
  {
    q: 'Is my staked INJ at risk?',
    a: 'No. Your principal is natively staked with Injective validators — the same delegation mechanism used by all Injective stakers. The protocol never lends, farms, or puts your INJ at additional risk. You can always unstake and receive your INJ back after the 21-day unbonding period.',
  },
  {
    q: 'How do I increase my chances of winning?',
    a: 'Your win probability is directly proportional to your csINJ balance relative to the total pool. Staking more INJ gives you more csINJ, which increases your share of the ticket weight. There\'s no minimum stake required.',
  },
  {
    q: 'What happens when I unstake?',
    a: 'When you unstake, your csINJ is burned and the equivalent INJ enters a 21-day unbonding period (standard Injective unbonding). During unbonding, you are no longer eligible for prize draws. After 21 days, you can claim your INJ.',
  },
  {
    q: 'Can the operator cheat?',
    a: 'The commit-reveal scheme combined with drand randomness makes it computationally infeasible for the operator to predict or manipulate the draw outcome. The operator commits to their secret before the drand beacon is produced, and the beacon is verified on-chain. However, the operator could choose not to reveal an unfavorable result (letting the draw expire), which returns funds to the pool rather than paying out. Future versions may address this.',
  },
  {
    q: 'What is csINJ?',
    a: 'csINJ is a liquid staking token created via Injective\'s Token Factory. It represents your staked INJ position. The exchange rate between csINJ and INJ increases over time as staking rewards accrue to the backing pool. 1 csINJ is always redeemable for its current exchange rate worth of INJ.',
  },
  {
    q: 'How is the exchange rate calculated?',
    a: 'The exchange rate is total_inj_backing / total_csinj_supply. As base yield (5% of staking rewards) is added to the backing, the rate increases. When you stake, you receive csINJ at the current rate. When you unstake, your csINJ is worth more INJ than when you staked.',
  },
]

export default function HowItWorksPage() {
  const epochDurationSeconds = useStore((s) => s.epochDurationSeconds)
  const minEpochsRegular = useStore((s) => s.minEpochsRegular)
  const minEpochsBig = useStore((s) => s.minEpochsBig)

  const [hoveredStep, setHoveredStep] = useState<number | null>(null)
  const [hoveredDist, setHoveredDist] = useState<number | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const epochHours = epochDurationSeconds / 3600
  const epochMins = epochDurationSeconds / 60
  const epochDisplay = epochHours >= 24 ? `${(epochHours / 24).toFixed(0)} day${epochHours >= 48 ? 's' : ''}` : `${epochMins.toFixed(0)} minutes`

  return (
    <div style={styles.page}>
      {/* ── Hero ── */}
      <section style={styles.hero}>
        <div style={styles.heroContainer}>
          <h1 style={styles.heroTitle}>How Chance.Staking Works</h1>
          <p style={styles.heroSubtitle}>
            Chance.Staking is a prize-linked staking protocol on Injective. Stake INJ to earn
            base yield while your staking rewards fund verifiable on-chain prize draws. Your
            principal stays safe — only rewards are gamified.
          </p>
        </div>
      </section>

      {/* ── Visual Flow ── */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.sectionTitle}>Four Steps to Winning</h2>
          <p style={styles.sectionSubtitle}>From staking to prize draws in a simple flow</p>

          <div className="hiw-page-steps" style={styles.stepsGrid}>
            {steps.map((step, i) => (
              <React.Fragment key={i}>
                <div
                  className="hiw-page-step-card"
                  style={{
                    ...styles.stepCard,
                    borderColor: hoveredStep === i ? step.borderColor : '#2A2A38',
                    background: hoveredStep === i ? step.bg.replace('0.1', '0.04') : '#1A1A22',
                  }}
                  onMouseEnter={() => setHoveredStep(i)}
                  onMouseLeave={() => setHoveredStep(null)}
                >
                  <div style={styles.stepNumber}>{String(i + 1).padStart(2, '0')}</div>
                  <div style={{
                    ...styles.stepIcon,
                    background: step.bg,
                    transform: hoveredStep === i ? 'scale(1.08)' : 'scale(1)',
                    transition: 'transform 0.3s ease',
                  }}>
                    <step.icon size={22} color={step.color} />
                  </div>
                  <h3 style={styles.stepTitle}>{step.title}</h3>
                  <p style={styles.stepShort}>{step.short}</p>
                  <p style={styles.stepDetail}>{step.detail}</p>
                </div>
                {i < steps.length - 1 && (
                  <div className="hiw-page-step-arrow" style={styles.stepArrow}>
                    <ArrowRight size={18} color="#2A2A38" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ── Reward Distribution ── */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.sectionTitle}>Reward Distribution</h2>
          <p style={styles.sectionSubtitle}>How staking rewards are allocated each epoch</p>

          <div style={styles.splitCard}>
            <div style={styles.splitBar}>
              {distributions.map((d, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.splitSegment,
                    width: `${d.pct}%`,
                    background: d.gradient,
                    transform: hoveredDist === i ? 'scaleY(1.2)' : 'scaleY(1)',
                    transition: 'transform 0.2s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => setHoveredDist(i)}
                  onMouseLeave={() => setHoveredDist(null)}
                >
                  {d.pct >= 10 && (
                    <span style={styles.splitLabel}>{d.pct}%</span>
                  )}
                </div>
              ))}
            </div>
            <div className="hiw-page-split-legend" style={styles.splitLegend}>
              {distributions.map((d, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.legendItem,
                    color: hoveredDist === i ? '#F0F0F5' : '#8E8EA0',
                  }}
                  onMouseEnter={() => setHoveredDist(i)}
                  onMouseLeave={() => setHoveredDist(null)}
                >
                  <div style={{ ...styles.legendDot, background: d.color }} />
                  <span style={{ fontWeight: 600 }}>{d.label}</span>
                  <span style={{ opacity: 0.7 }}>({d.pct}%)</span>
                </div>
              ))}
            </div>

            <div style={styles.distDetail}>
              <p><strong style={{ color: colors.primary }}>Regular Draws (70%)</strong> — The majority of rewards fund frequent prize draws. Every epoch a regular draw can occur, giving stakers regular chances to win.</p>
              <p><strong style={{ color: '#f472b6' }}>Big Jackpot (20%)</strong> — A larger pool accumulates over multiple epochs for bigger, less frequent draws with larger prizes.</p>
              <p><strong style={{ color: '#22c55e' }}>Base Yield (5%)</strong> — Directly increases the csINJ exchange rate, providing guaranteed returns to all holders regardless of draw outcomes.</p>
              <p><strong style={{ color: '#f59e0b' }}>Protocol Fee (5%)</strong> — Sustains protocol operations, development, and infrastructure.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Epoch & Draw Timing ── */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.sectionTitle}>Epoch & Draw Timing</h2>
          <p style={styles.sectionSubtitle}>Live on-chain parameters that govern draw frequency</p>

          <div className="hiw-page-timing-grid" style={styles.timingGrid}>
            <div style={styles.timingCard}>
              <Clock size={20} color="#38bdf8" />
              <div style={styles.timingValue}>{epochDisplay}</div>
              <div style={styles.timingLabel}>Epoch Duration</div>
              <div style={styles.timingDetail}>
                Each epoch is {formatNumber(epochDurationSeconds / 60, 0)} minutes. At the end of each epoch, staking rewards are claimed, distributed, and a new snapshot can be taken.
              </div>
            </div>
            <div style={styles.timingCard}>
              <Trophy size={20} color={colors.primary} />
              <div style={styles.timingValue}>Every {minEpochsRegular || 1} epoch{(minEpochsRegular || 1) > 1 ? 's' : ''}</div>
              <div style={styles.timingLabel}>Regular Draws</div>
              <div style={styles.timingDetail}>
                Regular draws can occur every {minEpochsRegular || 1} epoch{(minEpochsRegular || 1) > 1 ? 's' : ''} ({formatNumber((minEpochsRegular || 1) * epochHours, 0)} hours). The full regular pool balance is awarded as the prize.
              </div>
            </div>
            <div style={styles.timingCard}>
              <Zap size={20} color="#f472b6" />
              <div style={styles.timingValue}>Every {minEpochsBig || 7} epoch{(minEpochsBig || 7) > 1 ? 's' : ''}</div>
              <div style={styles.timingLabel}>Big Jackpot Draws</div>
              <div style={styles.timingDetail}>
                Big draws occur every {minEpochsBig || 7} epoch{(minEpochsBig || 7) > 1 ? 's' : ''} ({formatNumber((minEpochsBig || 7) * epochHours, 0)} hours). The pool accumulates over multiple epochs for larger prizes.
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div style={styles.timelineCard}>
            <div style={styles.timelineTitle}>Draw Lifecycle</div>
            <div className="hiw-page-timeline" style={styles.timeline}>
              {['Epoch Start', 'Rewards Claimed', 'Snapshot Taken', 'Draw Committed', 'drand Beacon', 'Draw Revealed'].map((label, i) => (
                <div key={i} style={styles.timelineStep}>
                  <div style={{
                    ...styles.timelineDot,
                    background: i === 5 ? '#22c55e' : i === 4 ? '#f59e0b' : colors.primary,
                  }} />
                  <span style={styles.timelineLabel}>{label}</span>
                  {i < 5 && <div style={styles.timelineLine} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Winner Selection Math ── */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.sectionTitle}>How Winners Are Selected</h2>
          <p style={styles.sectionSubtitle}>
            A step-by-step breakdown of the verifiable random winner selection process
          </p>

          <div className="hiw-page-math-steps" style={styles.mathGrid}>
            {drawSteps.map((step, i) => (
              <div key={i} style={styles.mathCard}>
                <div style={styles.mathHeader}>
                  <div style={{ ...styles.mathIcon, background: `${step.color}18` }}>
                    <step.icon size={16} color={step.color} />
                  </div>
                  <h3 style={styles.mathTitle}>{step.title}</h3>
                </div>
                <p style={styles.mathDesc}>{step.desc}</p>
                <div style={styles.codeBlock}>
                  <code style={styles.code}>{step.code}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Rewards Calculator ── */}
      <section style={{ ...styles.section, background: 'linear-gradient(180deg, transparent, rgba(26, 26, 34, 0.3), transparent)' }}>
        <RewardsCalculator />
      </section>

      {/* ── Security & Randomness ── */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.sectionTitle}>Security & Randomness</h2>
          <p style={styles.sectionSubtitle}>
            Multiple layers of cryptographic security ensure fair, verifiable draws
          </p>

          <div className="hiw-page-security-grid" style={styles.securityGrid}>
            <div style={styles.securityCard}>
              <div style={{ ...styles.securityIcon, background: 'rgba(56, 189, 248, 0.1)' }}>
                <Zap size={20} color="#38bdf8" />
              </div>
              <h3 style={styles.securityTitle}>drand Randomness</h3>
              <p style={styles.securityDesc}>
                Randomness comes from <strong>drand quicknet</strong>, operated by the League of Entropy — a consortium including Cloudflare, Protocol Labs, and university researchers. Each beacon uses BLS threshold signatures requiring a quorum of independent parties, making it impossible for any single entity to predict or manipulate the output.
              </p>
            </div>
            <div style={styles.securityCard}>
              <div style={{ ...styles.securityIcon, background: colors.primaryAlpha(0.1) }}>
                <Lock size={20} color={colors.primary} />
              </div>
              <h3 style={styles.securityTitle}>Commit-Reveal Scheme</h3>
              <p style={styles.securityDesc}>
                The operator commits a hash of their secret <strong>before</strong> the drand beacon is produced. The final randomness is the XOR of both sources. This prevents the operator from choosing a favorable secret after seeing the beacon, and prevents the drand network from biasing results since the operator's contribution is hidden until reveal.
              </p>
            </div>
            <div style={styles.securityCard}>
              <div style={{ ...styles.securityIcon, background: 'rgba(34, 197, 94, 0.1)' }}>
                <FileCheck size={20} color="#22c55e" />
              </div>
              <h3 style={styles.securityTitle}>Merkle Proof Verification</h3>
              <p style={styles.securityDesc}>
                Winner inclusion is verified via sorted-pair merkle proofs. Each leaf is <code style={styles.inlineCode}>sha256(address || start || end)</code> where start/end are big-endian u128 cumulative weights. Anyone can independently verify that the declared winner's weight range contains the winning ticket.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.sectionTitle}>Frequently Asked Questions</h2>

          <div style={styles.faqList}>
            {faqItems.map((item, i) => (
              <div
                key={i}
                style={{
                  ...styles.faqItem,
                  borderColor: openFaq === i ? colors.primaryAlpha(0.3) : '#2A2A38',
                }}
              >
                <button
                  style={styles.faqQuestion}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    size={16}
                    style={{
                      transition: 'transform 0.2s',
                      transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0)',
                      flexShrink: 0,
                      color: '#8E8EA0',
                    }}
                  />
                </button>
                {openFaq === i && (
                  <div style={styles.faqAnswer}>
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={styles.ctaSection}>
        <div style={styles.container}>
          <div style={styles.ctaCard}>
            <h2 style={styles.ctaTitle}>Ready to start?</h2>
            <p style={styles.ctaDesc}>
              Stake INJ and start earning base yield while entering verifiable prize draws.
            </p>
            <div style={styles.ctaButtons}>
              <a href="#/stake" style={styles.ctaPrimary}>Start Staking</a>
              <a href="#/draws" style={styles.ctaSecondary}>View Draws</a>
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

  // ── Hero ──
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

  // ── Section ──
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

  // ── Steps ──
  stepsGrid: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 0,
    flexWrap: 'wrap' as const,
  },
  stepCard: {
    flex: '0 0 200px',
    textAlign: 'center' as const,
    padding: 20,
    borderRadius: 16,
    border: '1px solid #2A2A38',
    transition: 'all 0.3s ease',
    cursor: 'default',
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: 700,
    color: '#525260',
    letterSpacing: '0.1em',
    marginBottom: 12,
  },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 12px',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 6,
  },
  stepShort: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: 600,
    marginBottom: 8,
  },
  stepDetail: {
    fontSize: 12,
    lineHeight: 1.6,
    color: '#8E8EA0',
  },
  stepArrow: {
    display: 'flex',
    alignItems: 'center',
    paddingTop: 60,
  },

  // ── Distribution ──
  splitCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 20,
    padding: 28,
    maxWidth: 720,
    margin: '0 auto',
  },
  splitBar: {
    display: 'flex',
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
    gap: 2,
    marginBottom: 20,
  },
  splitSegment: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    transformOrigin: 'bottom',
  },
  splitLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#FFFFFF',
    textShadow: '0 1px 3px rgba(0,0,0,0.4)',
  },
  splitLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: 20,
    flexWrap: 'wrap' as const,
    marginBottom: 24,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 12,
    cursor: 'default',
    transition: 'color 0.2s',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  distDetail: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.6,
    borderTop: '1px solid #2A2A38',
    paddingTop: 20,
  },

  // ── Timing ──
  timingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    marginBottom: 32,
  },
  timingCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 22,
    textAlign: 'center' as const,
  },
  timingValue: {
    fontSize: 20,
    fontWeight: 800,
    color: '#F0F0F5',
    margin: '12px 0 4px',
  },
  timingLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#8E8EA0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginBottom: 10,
  },
  timingDetail: {
    fontSize: 12,
    color: '#8E8EA0',
    lineHeight: 1.6,
  },

  // ── Timeline ──
  timelineCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: '20px 24px',
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 16,
    textAlign: 'center' as const,
  },
  timeline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
    gap: 0,
  },
  timelineStep: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  timelineLabel: {
    fontSize: 11,
    color: '#8E8EA0',
    whiteSpace: 'nowrap' as const,
  },
  timelineLine: {
    width: 24,
    height: 1,
    background: '#2A2A38',
    margin: '0 4px',
    flexShrink: 0,
  },

  // ── Math / Draw Steps ──
  mathGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
  },
  mathCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 20,
  },
  mathHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  mathIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mathTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#F0F0F5',
  },
  mathDesc: {
    fontSize: 12,
    color: '#8E8EA0',
    lineHeight: 1.6,
    marginBottom: 10,
  },
  codeBlock: {
    background: '#0F0F13',
    borderRadius: 8,
    padding: '8px 12px',
    overflow: 'auto',
  },
  code: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#38bdf8',
  },

  // ── Security ──
  securityGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
  },
  securityCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 24,
  },
  securityIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 8,
  },
  securityDesc: {
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.7,
  },
  inlineCode: {
    background: '#0F0F13',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#38bdf8',
  },

  // ── FAQ ──
  faqList: {
    maxWidth: 720,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  faqItem: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 12,
    overflow: 'hidden',
    transition: 'border-color 0.2s',
  },
  faqQuestion: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '16px 18px',
    background: 'transparent',
    border: 'none',
    color: '#F0F0F5',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  faqAnswer: {
    padding: '0 18px 16px',
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.7,
  },

  // ── CTA ──
  ctaSection: {
    padding: '0 0 80px',
  },
  ctaCard: {
    background: `linear-gradient(135deg, ${colors.primaryAlpha(0.08)}, rgba(56, 189, 248, 0.05))`,
    border: `1px solid ${colors.primaryAlpha(0.2)}`,
    borderRadius: 20,
    padding: '48px 32px',
    textAlign: 'center' as const,
    maxWidth: 600,
    margin: '0 auto',
  },
  ctaTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: '#F0F0F5',
    marginBottom: 10,
  },
  ctaDesc: {
    fontSize: 14,
    color: '#8E8EA0',
    marginBottom: 24,
    lineHeight: 1.6,
  },
  ctaButtons: {
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
    transition: 'opacity 0.2s',
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
    transition: 'border-color 0.2s',
  },
}
