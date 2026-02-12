import React, { useState, useEffect } from 'react'
import { Calculator, TrendingUp, Trophy, Sparkles, Landmark, Dices, Shield, Target, Zap, CloudRain } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatNumber } from '../utils/formatNumber'

export default function RewardsCalculator() {
  const baseYieldBps = useStore((s) => s.baseYieldBps)
  const regularPoolBps = useStore((s) => s.regularPoolBps)
  const bigPoolBps = useStore((s) => s.bigPoolBps)
  const protocolFeeBps = useStore((s) => s.protocolFeeBps)
  const onChainApr = useStore((s) => s.stakingApr)
  const totalInjBacking = useStore((s) => s.totalInjBacking)
  const epochDurationSeconds = useStore((s) => s.epochDurationSeconds)
  const minEpochsRegular = useStore((s) => s.minEpochsRegular)
  const minEpochsBig = useStore((s) => s.minEpochsBig)
  const snapshotNumHolders = useStore((s) => s.snapshotNumHolders)
  const csinjBalance = useStore((s) => s.csinjBalance)
  const exchangeRate = useStore((s) => s.exchangeRate)
  const isConnected = useStore((s) => s.isConnected)

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

  // ── Connected wallet position ──
  const walletCsinjHuman = parseFloat(csinjBalance) / 1e18
  const rate = parseFloat(exchangeRate) || 1
  const walletInjValue = walletCsinjHuman * rate
  const hasWalletPosition = isConnected && walletInjValue > 0.01

  // Use wallet position when connected, otherwise fall back to calculator input
  const oddsStake = hasWalletPosition ? walletInjValue : stake

  // ── Prize draw probability calculations ──
  const totalInjBackingHuman = parseFloat(totalInjBacking) / 1e18

  const epochsPerYear = epochDurationSeconds > 0 ? (365 * 86400) / epochDurationSeconds : 365
  const regularDrawsPerYear = epochsPerYear / Math.max(minEpochsRegular, 1)
  const bigDrawsPerYear = epochsPerYear / Math.max(minEpochsBig, 1)

  // Include user's hypothetical stake in the pool for realistic prize sizes
  const poolWithUser = hasWalletPosition ? totalInjBackingHuman : totalInjBackingHuman + stake
  const totalSysRewards = poolWithUser * (aprPct / 100)
  const regPoolAnnual = totalBps > 0 ? totalSysRewards * (regularPoolBps / totalBps) : 0
  const bigPoolAnnual = totalBps > 0 ? totalSysRewards * (bigPoolBps / totalBps) : 0
  const regPrizePerDraw = regularDrawsPerYear > 0 ? regPoolAnnual / regularDrawsPerYear : 0
  const bigPrizePerDraw = bigDrawsPerYear > 0 ? bigPoolAnnual / bigDrawsPerYear : 0

  // Win probability per draw: user's share of total pool
  const winProbPerDraw = poolWithUser > 0 && oddsStake > 0 ? oddsStake / poolWithUser : 0

  // Annual prize distribution using normal approximation of binomial
  // Each draw is a Bernoulli trial: win with prob p, prize = prizePerDraw
  const oddsBaseYield = totalBps > 0 ? oddsStake * (aprPct / 100) * (baseYieldBps / totalBps) : 0
  const expectedRegTotal = regularDrawsPerYear * winProbPerDraw * regPrizePerDraw
  const expectedBigTotal = bigDrawsPerYear * winProbPerDraw * bigPrizePerDraw
  const expectedTotalPrize = expectedRegTotal + expectedBigTotal

  // Variance of total annual prize winnings
  const regVar = regularDrawsPerYear * winProbPerDraw * (1 - winProbPerDraw) * regPrizePerDraw ** 2
  const bigVar = bigDrawsPerYear * winProbPerDraw * (1 - winProbPerDraw) * bigPrizePerDraw ** 2
  const totalPrizeStdDev = Math.sqrt(regVar + bigVar)

  // Scenario payouts (annual) — all based on oddsStake
  const floorPayout = oddsBaseYield
  const expectedPayout = oddsBaseYield + expectedTotalPrize
  const unluckyPayout = Math.max(oddsBaseYield, oddsBaseYield + expectedTotalPrize - 1.28 * totalPrizeStdDev)
  const luckyPayout = oddsBaseYield + expectedTotalPrize + 1.28 * totalPrizeStdDev
  const jackpotPayout = oddsBaseYield + expectedTotalPrize + 2.33 * totalPrizeStdDev

  // Scenario APRs
  const floorApr = oddsStake > 0 ? (floorPayout / oddsStake) * 100 : 0
  const expectedApr = oddsStake > 0 ? (expectedPayout / oddsStake) * 100 : 0
  const unluckyApr = oddsStake > 0 ? (unluckyPayout / oddsStake) * 100 : 0
  const luckyApr = oddsStake > 0 ? (luckyPayout / oddsStake) * 100 : 0
  const jackpotApr = oddsStake > 0 ? (jackpotPayout / oddsStake) * 100 : 0

  // Show variance scenarios only when there's meaningful spread
  const hasVariance = totalPrizeStdDev > 0.0005 * Math.max(expectedTotalPrize, 0.01)

  // Pool share percentage
  const poolSharePct = poolWithUser > 0 && oddsStake > 0 ? (oddsStake / poolWithUser) * 100 : 0

  const formatPct = (p: number): string => {
    const pct = p * 100
    if (pct >= 10) return `${pct.toFixed(2)}%`
    if (pct >= 1) return `${pct.toFixed(1)}%`
    if (pct >= 0.1) return `${pct.toFixed(2)}%`
    if (pct >= 0.01) return `${pct.toFixed(3)}%`
    return '<0.01%'
  }

  const oddsScenarios = [
    {
      label: 'Guaranteed Floor',
      desc: 'Base yield only — no wins needed',
      apr: floorApr,
      payout: floorPayout,
      color: '#22c55e',
      icon: <Shield size={14} color="#22c55e" />,
    },
    ...(hasVariance ? [
      {
        label: 'Unlucky Year',
        desc: 'Bottom 10% of outcomes',
        apr: unluckyApr,
        payout: unluckyPayout,
        color: '#f87171',
        icon: <CloudRain size={14} color="#f87171" />,
      },
    ] : []),
    {
      label: 'Typical Year',
      desc: 'Expected mathematical average',
      apr: expectedApr,
      payout: expectedPayout,
      color: '#60a5fa',
      icon: <Target size={14} color="#60a5fa" />,
    },
    ...(hasVariance ? [
      {
        label: 'Lucky Year',
        desc: 'Top 10% of outcomes',
        apr: luckyApr,
        payout: luckyPayout,
        color: '#8B6FFF',
        icon: <Trophy size={14} color="#8B6FFF" />,
      },
      {
        label: 'Jackpot Year',
        desc: 'Top 1% of outcomes',
        apr: jackpotApr,
        payout: jackpotPayout,
        color: '#fbbf24',
        icon: <Zap size={14} color="#fbbf24" />,
      },
    ] : []),
  ]

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

        <div className="calc-layout rewards-calc-layout" style={styles.layout}>
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

        {/* Prize Draw Odds */}
        {oddsStake > 0 && (
          <div style={styles.oddsCard}>
            <div style={styles.oddsHeader}>
              <div style={{ ...styles.segmentIcon, background: 'rgba(251, 191, 36, 0.1)' }}>
                <Dices size={14} color="#fbbf24" />
              </div>
              <div>
                <div style={styles.segmentLabel}>Your Prize Draw Odds</div>
                <div style={styles.segmentDesc}>
                  {hasWalletPosition
                    ? `Based on your ${formatNumber(walletCsinjHuman, 2)} csINJ (${formatNumber(walletInjValue, 2)} INJ)`
                    : `Based on ${formatNumber(stake, 0)} INJ simulated stake`}
                  {snapshotNumHolders > 0 && ` · ${snapshotNumHolders} stakers in pool`}
                </div>
              </div>
            </div>

            {/* Pool position stats */}
            <div className="rewards-calc-stats-row" style={styles.statsRow}>
              <div style={styles.statBox}>
                <div style={styles.statValue}>{formatNumber(poolSharePct, poolSharePct < 1 ? 3 : 2)}%</div>
                <div style={styles.statLabel}>Your pool share</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statValue}>{formatPct(winProbPerDraw)}</div>
                <div style={styles.statLabel}>Win chance / draw</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statValue}>~{formatNumber(regPrizePerDraw, 1)} INJ</div>
                <div style={styles.statLabel}>Per regular prize</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statValue}>~{formatNumber(bigPrizePerDraw, 1)} INJ</div>
                <div style={styles.statLabel}>Per big prize</div>
              </div>
            </div>

            <div style={styles.oddsDivider} />

            {/* Outcome spectrum bar */}
            {hasVariance && (
              <div style={styles.spectrumContainer}>
                <div style={styles.spectrumLabel}>Annual outcome range</div>
                <div style={styles.spectrumTrack}>
                  {(() => {
                    const min = floorPayout
                    const max = jackpotPayout
                    const range = max - min || 1
                    const markers = [
                      { payout: floorPayout, color: '#22c55e', label: 'Floor' },
                      { payout: unluckyPayout, color: '#f87171', label: 'Unlucky' },
                      { payout: expectedPayout, color: '#60a5fa', label: 'Typical' },
                      { payout: luckyPayout, color: '#8B6FFF', label: 'Lucky' },
                      { payout: jackpotPayout, color: '#fbbf24', label: 'Jackpot' },
                    ]
                    return (
                      <>
                        {/* Gradient bar */}
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: 4,
                          background: 'linear-gradient(90deg, #22c55e 0%, #f87171 15%, #60a5fa 40%, #8B6FFF 70%, #fbbf24 100%)',
                          opacity: 0.3,
                        }} />
                        {/* Filled portion up to expected */}
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: 0,
                          width: `${((expectedPayout - min) / range) * 100}%`,
                          borderRadius: 4,
                          background: 'linear-gradient(90deg, #22c55e, #60a5fa)',
                          opacity: 0.6,
                        }} />
                        {/* Markers */}
                        {markers.map((m) => (
                          <div key={m.label} style={{
                            position: 'absolute',
                            left: `${((m.payout - min) / range) * 100}%`,
                            top: -2,
                            bottom: -2,
                            width: 3,
                            borderRadius: 2,
                            background: m.color,
                            boxShadow: `0 0 6px ${m.color}80`,
                          }} />
                        ))}
                      </>
                    )
                  })()}
                </div>
                <div style={styles.spectrumLabels}>
                  <span style={{ color: '#22c55e', fontSize: 10, fontWeight: 600 }}>
                    {formatNumber(floorPayout, 1)} INJ
                  </span>
                  <span style={{ color: '#fbbf24', fontSize: 10, fontWeight: 600 }}>
                    {formatNumber(jackpotPayout, 1)} INJ
                  </span>
                </div>
              </div>
            )}

            {/* Scenario rows */}
            <div style={styles.segmentList}>
              {oddsScenarios.map((s) => (
                <div key={s.label} style={styles.segmentRow}>
                  <div style={styles.segmentLeft}>
                    <div style={{ ...styles.segmentIcon, background: `${s.color}18` }}>
                      {s.icon}
                    </div>
                    <div>
                      <div style={styles.segmentLabel}>{s.label}</div>
                      <div style={styles.segmentDesc}>{s.desc}</div>
                    </div>
                  </div>
                  <div style={styles.segmentRight}>
                    <div style={{ ...styles.segmentValue, color: s.color }}>
                      {formatNumber(s.apr, 1)}% APR
                    </div>
                    <div style={styles.segmentPct}>
                      +{formatNumber(s.payout, 2)} INJ/yr
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.oddsNote}>
              {hasWalletPosition
                ? `Your ${formatNumber(poolSharePct, poolSharePct < 1 ? 3 : 2)}% pool share gives you a ${formatPct(winProbPerDraw)} chance to win each draw.`
                : `Normal staking: ${formatNumber(aprPct, 1)}% APR.`}
              {' '}Guaranteed floor is base yield with zero wins.
              {hasVariance
                ? ` In an unlucky year you\'d still beat the floor. In a lucky year, prize draws can significantly boost your returns.`
                : ' As the pool grows with more stakers, individual prizes get larger and outcomes diverge.'}
            </div>
          </div>
        )}
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
  oddsCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 22,
    marginTop: 16,
  },
  oddsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    background: '#0F0F13',
    borderRadius: 10,
    padding: '12px 10px',
    textAlign: 'center' as const,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
    color: '#F0F0F5',
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    fontSize: 10,
    color: '#8E8EA0',
    marginTop: 4,
  },
  oddsDivider: {
    height: 1,
    background: '#2A2A38',
    marginBottom: 12,
  },
  oddsNote: {
    fontSize: 11,
    color: '#8E8EA0',
    lineHeight: 1.5,
    marginTop: 14,
    padding: '10px 12px',
    background: '#0F0F13',
    borderRadius: 8,
  },
  spectrumContainer: {
    marginBottom: 16,
  },
  spectrumLabel: {
    fontSize: 10,
    color: '#8E8EA0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    fontWeight: 500,
    marginBottom: 8,
  },
  spectrumTrack: {
    position: 'relative' as const,
    height: 8,
    borderRadius: 4,
    background: '#0F0F13',
    overflow: 'visible',
  },
  spectrumLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 6,
  },
}
