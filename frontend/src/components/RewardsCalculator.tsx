import React, { useState, useEffect } from 'react'
import { Calculator, TrendingUp, Trophy, Sparkles, Landmark } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatNumber } from '../utils/formatNumber'

export default function RewardsCalculator() {
  const baseYieldBps = useStore((s) => s.baseYieldBps)
  const regularPoolBps = useStore((s) => s.regularPoolBps)
  const bigPoolBps = useStore((s) => s.bigPoolBps)
  const protocolFeeBps = useStore((s) => s.protocolFeeBps)
  const onChainApr = useStore((s) => s.stakingApr)

  const [stakeAmount, setStakeAmount] = useState('1000')
  const [apr, setApr] = useState('15')
  const [aprSynced, setAprSynced] = useState(false)

  // Sync slider to on-chain APR once it loads
  useEffect(() => {
    if (onChainApr !== null && !aprSynced) {
      setApr(onChainApr.toFixed(1))
      setAprSynced(true)
    }
  }, [onChainApr, aprSynced])

  const stake = parseFloat(stakeAmount) || 0
  const aprPct = parseFloat(apr) || 0
  const totalBps = baseYieldBps + regularPoolBps + bigPoolBps + protocolFeeBps
  const annualRewards = stake * (aprPct / 100)

  const baseYield = totalBps > 0 ? annualRewards * (baseYieldBps / totalBps) : 0
  const regularPool = totalBps > 0 ? annualRewards * (regularPoolBps / totalBps) : 0
  const bigPool = totalBps > 0 ? annualRewards * (bigPoolBps / totalBps) : 0
  const protocolFee = totalBps > 0 ? annualRewards * (protocolFeeBps / totalBps) : 0
  const effectiveBaseApr = stake > 0 ? (baseYield / stake) * 100 : 0

  const segments = [
    {
      label: 'Base Yield',
      desc: 'Exchange rate appreciation',
      value: baseYield,
      bps: baseYieldBps,
      color: '#22c55e',
      icon: <TrendingUp size={14} color="#22c55e" />,
    },
    {
      label: 'Regular Draw Pool',
      desc: 'Weighted by csINJ balance',
      value: regularPool,
      bps: regularPoolBps,
      color: '#8B6FFF',
      icon: <Trophy size={14} color="#8B6FFF" />,
    },
    {
      label: 'Big Jackpot Pool',
      desc: 'Weighted by csINJ balance',
      value: bigPool,
      bps: bigPoolBps,
      color: '#f472b6',
      icon: <Sparkles size={14} color="#f472b6" />,
    },
    {
      label: 'Protocol Fee',
      desc: 'Sustains the protocol',
      value: protocolFee,
      bps: protocolFeeBps,
      color: '#8E8EA0',
      icon: <Landmark size={14} color="#8E8EA0" />,
    },
  ]

  return (
    <section id="calculator" style={styles.section}>
      <div className="section-container" style={styles.container}>
        <div style={styles.header}>
          <div style={styles.headerIcon}>
            <Calculator size={18} color="#8B6FFF" />
          </div>
          <div>
            <h2 style={styles.title}>Rewards Calculator</h2>
            <p style={styles.subtitle}>
              See how staking rewards are allocated across prize pools and base yield
            </p>
          </div>
        </div>

        <div className="calc-layout" style={styles.layout}>
          {/* Inputs */}
          <div style={styles.inputCard}>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>Stake Amount (INJ)</label>
              <input
                type="number"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="1000"
                style={styles.input}
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>
                INJ Staking APR{onChainApr !== null ? ' (live)' : ''}
              </label>
              <div style={styles.sliderRow}>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="0.5"
                  value={apr}
                  onChange={(e) => setApr(e.target.value)}
                  style={styles.slider}
                />
                <div style={styles.aprBadge}>{apr}%</div>
              </div>
            </div>

            {/* Annual summary */}
            <div style={styles.summaryCard}>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>Annual Staking Rewards</span>
                <span style={styles.summaryValue}>
                  {formatNumber(annualRewards, 2)} INJ
                </span>
              </div>
              <div style={styles.summaryDivider} />
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>Effective Base APR</span>
                <span style={{ ...styles.summaryValue, color: '#22c55e' }}>
                  {formatNumber(effectiveBaseApr, 2)}%
                </span>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>Prize Pool Contribution</span>
                <span style={{ ...styles.summaryValue, color: '#8B6FFF' }}>
                  {formatNumber(regularPool + bigPool, 2)} INJ/yr
                </span>
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div style={styles.breakdownCard}>
            {/* Stacked bar */}
            <div style={styles.barContainer}>
              <div style={styles.barTrack}>
                {segments.map((seg) => (
                  <div
                    key={seg.label}
                    style={{
                      height: '100%',
                      width: `${totalBps > 0 ? (seg.bps / totalBps) * 100 : 0}%`,
                      background: seg.color,
                      transition: 'width 0.4s ease',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Segment details */}
            <div style={styles.segmentList}>
              {segments.map((seg) => (
                <div key={seg.label} style={styles.segmentRow}>
                  <div style={styles.segmentLeft}>
                    <div
                      style={{
                        ...styles.segmentIcon,
                        background: `${seg.color}18`,
                      }}
                    >
                      {seg.icon}
                    </div>
                    <div>
                      <div style={styles.segmentLabel}>{seg.label}</div>
                      <div style={styles.segmentDesc}>{seg.desc}</div>
                    </div>
                  </div>
                  <div style={styles.segmentRight}>
                    <div style={{ ...styles.segmentValue, color: seg.color }}>
                      {formatNumber(seg.value, 2)} INJ
                    </div>
                    <div style={styles.segmentPct}>
                      {totalBps > 0
                        ? formatNumber((seg.bps / totalBps) * 100, 1)
                        : 0}
                      %
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    padding: '0 0 80px',
  },
  container: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '0 24px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'rgba(139, 111, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.03em',
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8EA0',
    marginTop: 2,
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    alignItems: 'start',
  },
  inputCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 22,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 18,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: '#8E8EA0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  input: {
    background: '#0F0F13',
    border: '1px solid #2A2A38',
    borderRadius: 10,
    padding: '12px 14px',
    color: '#F0F0F5',
    fontSize: 18,
    fontWeight: 700,
    outline: 'none',
    letterSpacing: '-0.02em',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  slider: {
    flex: 1,
    height: 4,
    appearance: 'auto' as const,
    accentColor: '#8B6FFF',
    cursor: 'pointer',
  },
  aprBadge: {
    background: '#0F0F13',
    border: '1px solid #2A2A38',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 14,
    fontWeight: 700,
    color: '#F0F0F5',
    minWidth: 52,
    textAlign: 'center' as const,
  },
  summaryCard: {
    background: '#0F0F13',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#8E8EA0',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 700,
    color: '#F0F0F5',
    fontVariantNumeric: 'tabular-nums',
  },
  summaryDivider: {
    height: 1,
    background: '#2A2A38',
  },
  breakdownCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 22,
  },
  barContainer: {
    marginBottom: 20,
  },
  barTrack: {
    display: 'flex',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    background: '#0F0F13',
  },
  segmentList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  segmentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: 10,
    background: '#0F0F13',
  },
  segmentLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  segmentIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#F0F0F5',
  },
  segmentDesc: {
    fontSize: 10,
    color: '#8E8EA0',
    marginTop: 1,
  },
  segmentRight: {
    textAlign: 'right' as const,
  },
  segmentValue: {
    fontSize: 14,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  segmentPct: {
    fontSize: 10,
    color: '#8E8EA0',
    marginTop: 1,
  },
}
