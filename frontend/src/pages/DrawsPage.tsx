import React from 'react'
import { Trophy, Sparkles } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatInj } from '../utils/formatNumber'
import DrawsSection from '../components/DrawsSection'

export default function DrawsPage() {
  const regularPoolBalance = useStore((s) => s.regularPoolBalance)
  const bigPoolBalance = useStore((s) => s.bigPoolBalance)
  const totalDrawsCompleted = useStore((s) => s.totalDrawsCompleted)
  const totalRewardsDistributed = useStore((s) => s.totalRewardsDistributed)

  return (
    <div style={styles.page}>
      {/* Page hero */}
      <section style={styles.hero}>
        <div style={styles.heroContainer}>
          <h1 style={styles.heroTitle}>Prize Draws</h1>
          <p style={styles.heroSubtitle}>
            Verifiable on-chain prize draws powered by drand randomness beacons and commit-reveal schemes.
          </p>

          <div className="draws-page-stats" style={styles.statsRow}>
            <div style={styles.poolCard}>
              <div style={styles.poolHeader}>
                <Trophy size={16} color="#8B6FFF" />
                <span style={styles.poolLabel}>Regular Pool</span>
              </div>
              <div style={{ ...styles.poolValue, color: '#8B6FFF' }}>
                {formatInj(regularPoolBalance, 2)} INJ
              </div>
            </div>
            <div style={styles.poolCard}>
              <div style={styles.poolHeader}>
                <Sparkles size={16} color="#f472b6" />
                <span style={styles.poolLabel}>Big Jackpot Pool</span>
              </div>
              <div style={{ ...styles.poolValue, color: '#f472b6' }}>
                {formatInj(bigPoolBalance, 2)} INJ
              </div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>Draws Completed</span>
                <span style={styles.summaryValue}>{totalDrawsCompleted}</span>
              </div>
              <div style={styles.summaryDivider} />
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>Total Distributed</span>
                <span style={styles.summaryValue}>{formatInj(totalRewardsDistributed, 2)} INJ</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <DrawsSection fullPage />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    paddingTop: 64,
  },
  hero: {
    padding: '48px 0 0',
    background: 'linear-gradient(180deg, rgba(139, 111, 255, 0.04) 0%, transparent 100%)',
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
    maxWidth: 560,
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
  poolCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 14,
    padding: '16px 24px',
    minWidth: 180,
  },
  poolHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    justifyContent: 'center',
  },
  poolLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#8E8EA0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  poolValue: {
    fontSize: 20,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
  },
  summaryCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 14,
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    justifyContent: 'center',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 24,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#8E8EA0',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: 700,
    color: '#F0F0F5',
    fontVariantNumeric: 'tabular-nums',
  },
  summaryDivider: {
    height: 1,
    background: '#2A2A38',
  },
}
