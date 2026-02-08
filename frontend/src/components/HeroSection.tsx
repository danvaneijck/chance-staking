import React from 'react'
import { Sparkles, Zap } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatInj, formatNumber } from '../utils/formatNumber'
import EpochCountdown from './EpochCountdown'
import ActivityTicker from './ActivityTicker'

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

      <div className="hero-content" style={styles.heroContent}>
        <div className="hero-badge" style={styles.badge}>
          <Sparkles size={13} color="#8B6FFF" />
          <span>Gamified Liquid Staking on Injective</span>
        </div>

        <h1 style={styles.title}>
          <span className="hero-title-1" style={styles.titleLine1}>Stake INJ.</span>
          <span className="hero-title-2" style={styles.titleLine2}>Win Big.</span>
        </h1>

        <p className="hero-subtitle" style={styles.subtitle}>
          Your principal stays safe in native staking while 95% of rewards
          fuel random prize draws. Every csINJ token is a lottery ticket
          that never expires.
        </p>

        <div className="hero-cta-row" style={styles.ctaRow}>
          <a href="#stake" style={{ textDecoration: 'none' }}>
            <button className="hero-cta-primary" style={styles.primaryCta}>
              <Zap size={16} />
              Start Staking
            </button>
          </a>
          <a href="#how-it-works" style={{ textDecoration: 'none' }}>
            <button className="hero-cta-secondary" style={styles.secondaryCta}>
              Learn How It Works
            </button>
          </a>
        </div>

        {/* Epoch Countdown */}
        <div style={styles.countdownRow}>
          <EpochCountdown />
        </div>

        <div className="hero-stats-row" style={styles.statsRow}>
          <div style={styles.statCard}>
            <div className="hero-stat-value" style={styles.statValue}>
              {formatInj(totalStaked)} INJ
            </div>
            <div style={styles.statLabel}>Total Value Locked</div>
          </div>
          <div className="hero-stat-divider" style={styles.statDivider} />
          <div style={styles.statCard}>
            <div className="hero-stat-value" style={styles.statValue}>{totalDrawsCompleted}</div>
            <div style={styles.statLabel}>Draws Completed</div>
          </div>
          <div className="hero-stat-divider" style={styles.statDivider} />
          <div style={styles.statCard}>
            <div className="hero-stat-value" style={styles.statValue}>
              {formatInj(totalRewardsDistributed)} INJ
            </div>
            <div style={styles.statLabel}>Total Prizes Won</div>
          </div>
          <div className="hero-stat-divider" style={styles.statDivider} />
          <div style={styles.statCard}>
            <div className="hero-stat-value" style={styles.statValue}>
              {formatNumber(parseFloat(exchangeRate), 4)}
            </div>
            <div style={styles.statLabel}>csINJ Rate</div>
          </div>
        </div>

        {/* Activity Ticker */}
        <ActivityTicker />
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
    paddingTop: 64,
  },
  bgGlow1: {
    position: 'absolute',
    top: '10%',
    left: '20%',
    width: 600,
    height: 600,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139, 111, 255, 0.1) 0%, transparent 70%)',
    filter: 'blur(100px)',
    pointerEvents: 'none',
  },
  bgGlow2: {
    position: 'absolute',
    bottom: '10%',
    right: '15%',
    width: 500,
    height: 500,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(56, 189, 248, 0.06) 0%, transparent 70%)',
    filter: 'blur(100px)',
    pointerEvents: 'none',
  },
  bgGrid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(42, 42, 56, 0.2) 1px, transparent 1px),
      linear-gradient(90deg, rgba(42, 42, 56, 0.2) 1px, transparent 1px)
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
    padding: '7px 16px',
    borderRadius: 9999,
    background: 'rgba(139, 111, 255, 0.08)',
    border: '1px solid rgba(139, 111, 255, 0.15)',
    fontSize: 12,
    fontWeight: 500,
    color: '#A78BFF',
    marginBottom: 28,
    letterSpacing: '0.02em',
  },
  title: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    marginBottom: 20,
  },
  titleLine1: {
    fontSize: 68,
    fontWeight: 900,
    color: '#F0F0F5',
    letterSpacing: '-0.04em',
    lineHeight: 1.05,
  },
  titleLine2: {
    fontSize: 68,
    fontWeight: 900,
    letterSpacing: '-0.04em',
    lineHeight: 1.05,
    background: 'linear-gradient(135deg, #8B6FFF 0%, #38bdf8 50%, #f472b6 100%)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundSize: '200% 200%',
    animation: 'gradientShift 4s ease infinite',
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 1.7,
    color: '#8E8EA0',
    maxWidth: 540,
    margin: '0 auto 36px',
  },
  ctaRow: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 28,
    flexWrap: 'wrap' as const,
  },
  primaryCta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '14px 28px',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #8B6FFF, #6B4FD6)',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 0 32px rgba(139, 111, 255, 0.2), 0 4px 16px rgba(0, 0, 0, 0.3)',
    transition: 'all 0.3s ease',
  },
  secondaryCta: {
    padding: '14px 28px',
    borderRadius: 12,
    background: 'transparent',
    color: '#8E8EA0',
    fontSize: 15,
    fontWeight: 600,
    border: '1px solid #2A2A38',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  countdownRow: {
    maxWidth: 360,
    margin: '0 auto 28px',
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    padding: '20px 28px',
    borderRadius: 16,
    background: 'rgba(26, 26, 34, 0.7)',
    border: '1px solid rgba(42, 42, 56, 0.5)',
    backdropFilter: 'blur(12px)',
    flexWrap: 'wrap' as const,
  },
  statCard: {
    padding: '8px 28px',
    textAlign: 'center' as const,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: '#8E8EA0',
    marginTop: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  statDivider: {
    width: 1,
    height: 36,
    background: '#2A2A38',
  },
}
