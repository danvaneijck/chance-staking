import React from 'react'
import { TrendingUp, Clock, Layers } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatNumber } from '../utils/formatNumber'
import StakingPanel from '../components/StakingPanel'
import PortfolioSection from '../components/PortfolioSection'
import EpochCountdown from '../components/EpochCountdown'
import { colors } from '../theme'

export default function StakingPage() {
  const exchangeRate = useStore((s) => s.exchangeRate)
  const totalInjBacking = useStore((s) => s.totalInjBacking)
  const isConnected = useStore((s) => s.isConnected)

  const tvl = parseFloat(totalInjBacking) / 1e18

  return (
    <div style={styles.page}>
      {/* Page hero */}
      <section style={styles.hero}>
        <div style={styles.heroContainer}>
          <h1 style={styles.heroTitle}>Stake INJ</h1>
          <p style={styles.heroSubtitle}>
            Deposit INJ, receive csINJ, and automatically enter prize draws with your staking rewards.
          </p>

          <div className="staking-page-stats" style={styles.statsRow}>
            <div style={styles.statCard}>
              <TrendingUp size={16} color="#22c55e" />
              <div>
                <div style={styles.statValue}>
                  {formatNumber(parseFloat(exchangeRate), 4)}
                </div>
                <div style={styles.statLabel}>csINJ Rate</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <Layers size={16} color={colors.primary} />
              <div>
                <div style={styles.statValue}>
                  {formatNumber(tvl, 1)} INJ
                </div>
                <div style={styles.statLabel}>Total Value Locked</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <Clock size={16} color="#38bdf8" />
              <div>
                <EpochCountdown compact />
              </div>
            </div>
          </div>
        </div>
      </section>

      <StakingPanel />
      {isConnected && <PortfolioSection />}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    paddingTop: 64,
  },
  hero: {
    padding: '48px 0 0',
    background: `linear-gradient(180deg, ${colors.primaryAlpha(0.04)} 0%, transparent 100%)`,
  },
  heroContainer: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
    textAlign: 'center',
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.03em',
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#8E8EA0',
    maxWidth: 520,
    margin: '0 auto 32px',
    lineHeight: 1.6,
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 40,
    flexWrap: 'wrap' as const,
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 12,
    padding: '12px 20px',
  },
  statValue: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F0F0F5',
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8EA0',
    marginTop: 1,
  },
}
