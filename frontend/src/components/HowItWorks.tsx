import React, { useState } from 'react'
import { Coins, Shuffle, Trophy, TrendingUp, ArrowRight } from 'lucide-react'

const steps = [
  {
    icon: Coins,
    color: '#8B6FFF',
    bg: 'rgba(139, 111, 255, 0.1)',
    borderColor: 'rgba(139, 111, 255, 0.2)',
    title: 'Stake INJ',
    description: 'Deposit INJ and receive csINJ — a liquid staking token backed 1:1 by natively staked INJ.',
  },
  {
    icon: TrendingUp,
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.2)',
    title: 'Earn Base Yield',
    description: '5% of staking rewards automatically increase the csINJ exchange rate. Your tokens appreciate over time.',
  },
  {
    icon: Shuffle,
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.2)',
    title: 'Enter Prize Draws',
    description: '90% of rewards fund prize pools. Your csINJ balance is your ticket count — more tokens, more chances.',
  },
  {
    icon: Trophy,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.2)',
    title: 'Win Prizes',
    description: 'Winners selected via drand beacons + commit-reveal. Fully verifiable, tamper-proof randomness.',
  },
]

const distributions = [
  { label: 'Regular Draws', pct: 70, color: '#8B6FFF', gradient: 'linear-gradient(90deg, #8B6FFF, #6B4FD6)' },
  { label: 'Big Weekly Draw', pct: 20, color: '#f472b6', gradient: 'linear-gradient(90deg, #f472b6, #ec4899)' },
  { label: 'Base Yield', pct: 5, color: '#22c55e', gradient: '#22c55e' },
  { label: 'Protocol Fee', pct: 5, color: '#f59e0b', gradient: '#f59e0b' },
]

export default function HowItWorks() {
  const [hoveredStep, setHoveredStep] = useState<number | null>(null)
  const [hoveredDist, setHoveredDist] = useState<number | null>(null)

  return (
    <section id="how-it-works" style={styles.section}>
      <div className="section-container" style={styles.container}>
        <div style={styles.header}>
          <h2 className="hiw-title" style={styles.title}>How It Works</h2>
          <p style={styles.subtitle}>
            Four simple steps from staking to winning
          </p>
        </div>

        <div className="hiw-steps-grid" style={styles.stepsGrid}>
          {steps.map((step, i) => (
            <React.Fragment key={i}>
              <div
                className="hiw-step-card"
                style={{
                  ...styles.stepCard,
                  animation: `fadeInUp 0.5s ease-out ${i * 0.1}s both`,
                  borderColor: hoveredStep === i ? step.borderColor : 'transparent',
                  background: hoveredStep === i ? step.bg.replace('0.1', '0.04') : 'transparent',
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
                <p style={styles.stepDesc}>{step.description}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="hiw-step-arrow" style={styles.stepArrow}>
                  <ArrowRight size={18} color="#2A2A38" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Reward split visualization */}
        <div style={styles.splitCard}>
          <h3 style={styles.splitTitle}>Reward Distribution</h3>
          <p style={styles.splitSubtitle}>How staking rewards are allocated each epoch</p>
          <div style={styles.splitBar}>
            {distributions.map((d, i) => (
              <div
                key={i}
                style={{
                  ...styles.splitSegment,
                  width: `${d.pct}%`,
                  background: d.gradient,
                  animation: `barGrow 0.8s ease-out ${0.3 + i * 0.15}s both`,
                  transform: hoveredDist === i ? 'scaleY(1.15)' : 'scaleY(1)',
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
          <div className="hiw-split-legend" style={styles.splitLegend}>
            {distributions.map((d, i) => (
              <div
                key={i}
                style={{
                  ...styles.legendItem,
                  color: hoveredDist === i ? '#F0F0F5' : '#8E8EA0',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={() => setHoveredDist(i)}
                onMouseLeave={() => setHoveredDist(null)}
              >
                <div style={{ ...styles.legendDot, background: d.color }} />
                <span>{d.label} ({d.pct}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    padding: '80px 0',
    background: 'linear-gradient(180deg, transparent 0%, rgba(26, 26, 34, 0.4) 50%, transparent 100%)',
  },
  container: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: 48,
  },
  title: {
    fontSize: 38,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.03em',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8EA0',
  },
  stepsGrid: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 0,
    marginBottom: 48,
    flexWrap: 'wrap' as const,
  },
  stepCard: {
    flex: '0 0 220px',
    textAlign: 'center' as const,
    padding: 22,
    borderRadius: 16,
    border: '1px solid transparent',
    transition: 'all 0.3s ease',
    cursor: 'default',
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: 700,
    color: '#2A2A38',
    letterSpacing: '0.1em',
    marginBottom: 14,
  },
  stepIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 14px',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 8,
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 1.6,
    color: '#8E8EA0',
  },
  stepArrow: {
    display: 'flex',
    alignItems: 'center',
    paddingTop: 66,
  },
  splitCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 20,
    padding: 28,
    maxWidth: 680,
    margin: '0 auto',
  },
  splitTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 4,
    textAlign: 'center' as const,
  },
  splitSubtitle: {
    fontSize: 13,
    color: '#8E8EA0',
    textAlign: 'center' as const,
    marginBottom: 20,
  },
  splitBar: {
    display: 'flex',
    height: 36,
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
    fontSize: 11,
    fontWeight: 700,
    color: '#FFFFFF',
    textShadow: '0 1px 3px rgba(0,0,0,0.4)',
  },
  splitLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: 20,
    flexWrap: 'wrap' as const,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 12,
    color: '#8E8EA0',
    cursor: 'default',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
}
