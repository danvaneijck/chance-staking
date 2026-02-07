import React from 'react'
import { Coins, Shuffle, Trophy, TrendingUp, ArrowRight } from 'lucide-react'

const steps = [
  {
    icon: Coins,
    color: '#9E7FFF',
    bg: 'rgba(158, 127, 255, 0.12)',
    title: 'Stake INJ',
    description: 'Deposit INJ and receive csINJ — a liquid staking token backed 1:1 by natively staked INJ.',
  },
  {
    icon: TrendingUp,
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    title: 'Earn Base Yield',
    description: '5% of staking rewards automatically increase the csINJ exchange rate. Your tokens appreciate over time.',
  },
  {
    icon: Shuffle,
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.12)',
    title: 'Enter Prize Draws',
    description: '95% of rewards fund prize pools. Your csINJ balance is your ticket count — more tokens, more chances.',
  },
  {
    icon: Trophy,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    title: 'Win Prizes',
    description: 'Winners selected via drand beacons + commit-reveal. Fully verifiable, tamper-proof randomness.',
  },
]

export default function HowItWorks() {
  return (
    <section style={styles.section}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>How It Works</h2>
          <p style={styles.subtitle}>
            Four simple steps from staking to winning
          </p>
        </div>

        <div style={styles.stepsGrid}>
          {steps.map((step, i) => (
            <React.Fragment key={i}>
              <div style={styles.stepCard}>
                <div style={styles.stepNumber}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ ...styles.stepIcon, background: step.bg }}>
                  <step.icon size={24} color={step.color} />
                </div>
                <h3 style={styles.stepTitle}>{step.title}</h3>
                <p style={styles.stepDesc}>{step.description}</p>
              </div>
              {i < steps.length - 1 && (
                <div style={styles.stepArrow}>
                  <ArrowRight size={20} color="#2F2F2F" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Reward split visualization */}
        <div style={styles.splitCard}>
          <h3 style={styles.splitTitle}>Reward Distribution</h3>
          <div style={styles.splitBar}>
            <div style={{ ...styles.splitSegment, width: '70%', background: 'linear-gradient(90deg, #9E7FFF, #7B5CE0)' }}>
              <span style={styles.splitLabel}>70% Regular</span>
            </div>
            <div style={{ ...styles.splitSegment, width: '20%', background: 'linear-gradient(90deg, #f472b6, #ec4899)' }}>
              <span style={styles.splitLabel}>20% Big</span>
            </div>
            <div style={{ ...styles.splitSegment, width: '5%', background: '#10b981' }}>
              <span style={{ ...styles.splitLabel, fontSize: 9 }}>5%</span>
            </div>
            <div style={{ ...styles.splitSegment, width: '5%', background: '#f59e0b' }}>
              <span style={{ ...styles.splitLabel, fontSize: 9 }}>5%</span>
            </div>
          </div>
          <div style={styles.splitLegend}>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendDot, background: '#9E7FFF' }} />
              <span>Regular Draws (70%)</span>
            </div>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendDot, background: '#f472b6' }} />
              <span>Big Monthly Draw (20%)</span>
            </div>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendDot, background: '#10b981' }} />
              <span>Base Yield (5%)</span>
            </div>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendDot, background: '#f59e0b' }} />
              <span>Protocol Fee (5%)</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    padding: '80px 0',
    background: 'linear-gradient(180deg, transparent 0%, rgba(38, 38, 38, 0.3) 50%, transparent 100%)',
  },
  container: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: 56,
  },
  title: {
    fontSize: 42,
    fontWeight: 800,
    color: '#FFFFFF',
    letterSpacing: '-0.03em',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#A3A3A3',
  },
  stepsGrid: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 0,
    marginBottom: 56,
    flexWrap: 'wrap' as const,
  },
  stepCard: {
    flex: '0 0 220px',
    textAlign: 'center' as const,
    padding: 24,
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: 700,
    color: '#2F2F2F',
    letterSpacing: '0.1em',
    marginBottom: 16,
  },
  stepIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 1.6,
    color: '#A3A3A3',
  },
  stepArrow: {
    display: 'flex',
    alignItems: 'center',
    paddingTop: 72,
  },
  splitCard: {
    background: '#262626',
    border: '1px solid #2F2F2F',
    borderRadius: 24,
    padding: 32,
    maxWidth: 700,
    margin: '0 auto',
  },
  splitTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center' as const,
  },
  splitBar: {
    display: 'flex',
    height: 40,
    borderRadius: 12,
    overflow: 'hidden',
    gap: 2,
    marginBottom: 20,
  },
  splitSegment: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  splitLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#FFFFFF',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },
  splitLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: 24,
    flexWrap: 'wrap' as const,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: '#A3A3A3',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
}
