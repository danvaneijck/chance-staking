import React from 'react'
import { Sparkles, Zap } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatInj } from '../utils/formatNumber'
import EpochCountdown from './EpochCountdown'

export default function HeroSection() {
  const exchangeRate = useStore((s) => s.exchangeRate)
  const totalStaked = useStore((s) => s.totalInjBacking)
  const totalRewardsDistributed = useStore((s) => s.totalRewardsDistributed)
  const totalDrawsCompleted = useStore((s) => s.totalDrawsCompleted)

  return (
    <section style={styles.hero}>
      <div style={styles.bgGlow1} />
      <div style={styles.bgGlow2} />
      <div style={styles.bgGrid} />

      <div style={styles.heroContent}>
        <div style={styles.badge}>
          <Sparkles size={14} color="#9E7FFF" />
          <span>Gamified Liquid Staking on Injective</span>
        </div>

        <h1 style={styles.title}>
          <span style={styles.titleLine1}>Stake INJ.</span>
          <span style={styles.titleLine2}>Win Big.</span>
        </h1>

        <p style={styles.subtitle}>
          Your principal stays safe in native staking while 95% of rewards
          fuel random prize draws. Every csINJ token is a lottery ticket
          that never expires.
        </p>

        <div style={styles.ctaRow}>
          <a href="#stake" style={{ textDecoration: 'none' }}>
            <button style={styles.primaryCta}>
              <Zap size={18} />
              Start Staking
            </button>
          </a>
          <a href="#how-it-works" style={{ textDecoration: 'none' }}>
            <button style={styles.secondaryCta}>
              Learn How It Works
            </button>
          </a>
        </div>

        {/* Epoch Countdown */}
        <div style={styles.countdownRow}>
          <EpochCountdown />
        </div>

        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{formatInj(totalStaked)} INJ</div>
            <div style={styles.statLabel}>Total Value Locked</div>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statCard}>
            <div style={styles.statValue}>{totalDrawsCompleted}</div>
            <div style={styles.statLabel}>Draws Completed</div>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statCard}>
            <div style={styles.statValue}>{formatInj(totalRewardsDistributed)} INJ</div>
            <div style={styles.statLabel}>Total Prizes Won</div>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statCard}>
            <div style={styles.statValue}>{parseFloat(exchangeRate).toFixed(4)}</div>
            <div style={styles.statLabel}>csINJ Rate</div>
          </div>
        </div>
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  hero: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingTop: 72,
  },
  bgGlow1: {
    position: 'absolute',
    top: '10%',
    left: '20%',
    width: 600,
    height: 600,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(158, 127, 255, 0.12) 0%, transparent 70%)',
    filter: 'blur(80px)',
    pointerEvents: 'none',
  },
  bgGlow2: {
    position: 'absolute',
    bottom: '10%',
    right: '15%',
    width: 500,
    height: 500,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(56, 189, 248, 0.08) 0%, transparent 70%)',
    filter: 'blur(80px)',
    pointerEvents: 'none',
  },
  bgGrid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(47, 47, 47, 0.3) 1px, transparent 1px),
      linear-gradient(90deg, rgba(47, 47, 47, 0.3) 1px, transparent 1px)
    `,
    backgroundSize: '64px 64px',
    maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)',
    WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)',
    pointerEvents: 'none',
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
    textAlign: 'center' as const,
    maxWidth: 800,
    padding: '0 24px',
    animation: 'fadeInUp 0.8s ease-out',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    borderRadius: 9999,
    background: 'rgba(158, 127, 255, 0.1)',
    border: '1px solid rgba(158, 127, 255, 0.2)',
    fontSize: 13,
    fontWeight: 500,
    color: '#B9A4FF',
    marginBottom: 32,
  },
  title: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    marginBottom: 24,
  },
  titleLine1: {
    fontSize: 72,
    fontWeight: 900,
    color: '#FFFFFF',
    letterSpacing: '-0.04em',
    lineHeight: 1.05,
  },
  titleLine2: {
    fontSize: 72,
    fontWeight: 900,
    letterSpacing: '-0.04em',
    lineHeight: 1.05,
    background: 'linear-gradient(135deg, #9E7FFF 0%, #38bdf8 50%, #f472b6 100%)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundSize: '200% 200%',
    animation: 'gradientShift 4s ease infinite',
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 1.7,
    color: '#A3A3A3',
    maxWidth: 560,
    margin: '0 auto 40px',
  },
  ctaRow: {
    display: 'flex',
    gap: 16,
    justifyContent: 'center',
    marginBottom: 32,
    flexWrap: 'wrap' as const,
  },
  primaryCta: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '16px 32px',
    borderRadius: 16,
    background: 'linear-gradient(135deg, #9E7FFF, #7B5CE0)',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 0 40px rgba(158, 127, 255, 0.25), 0 4px 16px rgba(0, 0, 0, 0.3)',
    transition: 'all 0.3s ease',
  },
  secondaryCta: {
    padding: '16px 32px',
    borderRadius: 16,
    background: 'transparent',
    color: '#A3A3A3',
    fontSize: 16,
    fontWeight: 600,
    border: '1px solid #2F2F2F',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  countdownRow: {
    maxWidth: 360,
    margin: '0 auto 32px',
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    padding: '24px 32px',
    borderRadius: 20,
    background: 'rgba(38, 38, 38, 0.6)',
    border: '1px solid rgba(47, 47, 47, 0.6)',
    backdropFilter: 'blur(12px)',
    flexWrap: 'wrap' as const,
  },
  statCard: {
    padding: '8px 32px',
    textAlign: 'center' as const,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    color: '#FFFFFF',
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: '#A3A3A3',
    marginTop: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  statDivider: {
    width: 1,
    height: 40,
    background: '#2F2F2F',
  },
}
