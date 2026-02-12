import React, { useEffect, useState } from 'react'
import { Shield, ExternalLink, Percent, TrendingUp, Coins, PieChart } from 'lucide-react'
import { useStore } from '../store/useStore'
import { colors } from '../theme'
import { formatNumber } from '../utils/formatNumber'
import * as contracts from '../services/contracts'

interface ValidatorInfo {
  address: string
  moniker: string
  commission: number
  delegationAmount: number
  shareOfTotal: number
  effectiveApr: number
}

export default function ValidatorsPage() {
  const validators = useStore((s) => s.validators)
  const [validatorData, setValidatorData] = useState<ValidatorInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nominalApr, setNominalApr] = useState(0)

  useEffect(() => {
    if (validators.length === 0) return
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError('')
      try {
        const [provisions, pool, ...results] = await Promise.allSettled([
          contracts.fetchAnnualProvisions(),
          contracts.fetchStakingPool(),
          ...validators.map((addr) =>
            Promise.all([
              contracts.fetchValidatorDetails(addr).catch(() => null),
              contracts.fetchProtocolDelegation(addr).catch(() => null),
            ])
          ),
        ])

        if (cancelled) return

        // Calculate nominal APR
        let apr = 0
        if (provisions.status === 'fulfilled' && pool.status === 'fulfilled') {
          const annualProv = parseFloat(provisions.value.annualProvisions) / 1e18
          const bonded = parseFloat(pool.value.bondedTokens)
          if (bonded > 0 && annualProv > 0) {
            apr = (annualProv / bonded) * 100
          }
        }
        setNominalApr(apr)

        // Build validator info
        const infos: ValidatorInfo[] = []
        let totalDelegated = 0

        for (let i = 0; i < validators.length; i++) {
          const result = results[i]
          if (result.status !== 'fulfilled') continue
          const [validator, delegation] = result.value

          const delegated = delegation ? parseFloat(delegation.balance.amount) / 1e18 : 0
          totalDelegated += delegated

          const commission = validator
            ? parseFloat(validator.commission.commissionRates.rate)
            : 0

          infos.push({
            address: validators[i],
            moniker: validator?.description?.moniker || validators[i].slice(0, 16) + '...',
            commission,
            delegationAmount: delegated,
            shareOfTotal: 0,
            effectiveApr: apr * (1 - commission),
          })
        }

        // Calculate shares
        for (const info of infos) {
          info.shareOfTotal = totalDelegated > 0 ? (info.delegationAmount / totalDelegated) * 100 : 0
        }

        // Sort by delegation (largest first)
        infos.sort((a, b) => b.delegationAmount - a.delegationAmount)
        setValidatorData(infos)
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load validator data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [validators])

  const totalDelegated = validatorData.reduce((sum, v) => sum + v.delegationAmount, 0)
  const weightedApr = validatorData.length > 0 && totalDelegated > 0
    ? validatorData.reduce((sum, v) => sum + v.effectiveApr * v.delegationAmount, 0) / totalDelegated
    : 0

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.heroContainer}>
          <h1 style={styles.heroTitle}>Protocol Validators</h1>
          <p style={styles.heroSubtitle}>
            Chance.Staking delegates INJ across multiple validators for security and decentralization.
            All staking rewards fund the prize pools and base yield.
          </p>

          <div className="validators-page-stats" style={styles.statsRow}>
            <div style={styles.statCard}>
              <Coins size={16} color={colors.primary} />
              <div>
                <div style={styles.statValue}>{formatNumber(totalDelegated, 1)} INJ</div>
                <div style={styles.statLabel}>Total Delegated</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <TrendingUp size={16} color="#22c55e" />
              <div>
                <div style={styles.statValue}>{formatNumber(weightedApr, 2)}%</div>
                <div style={styles.statLabel}>Weighted APR</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <Shield size={16} color="#38bdf8" />
              <div>
                <div style={styles.statValue}>{validatorData.length}</div>
                <div style={styles.statLabel}>Active Validators</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={styles.content}>
        <div style={styles.container}>
          {loading ? (
            <div className="validators-grid" style={styles.grid}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={styles.skeletonCard}>
                  <div style={styles.skeletonBar} />
                  <div style={{ ...styles.skeletonBar, width: '60%' }} />
                  <div style={{ ...styles.skeletonBar, width: '80%', marginTop: 12 }} />
                </div>
              ))}
            </div>
          ) : error ? (
            <div style={styles.errorCard}>
              <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>
            </div>
          ) : (
            <div className="validators-grid" style={styles.grid}>
              {validatorData.map((v) => (
                <div key={v.address} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.monikerRow}>
                      <div style={styles.validatorIcon}>
                        <Shield size={16} color={colors.primary} />
                      </div>
                      <div>
                        <div style={styles.moniker}>{v.moniker}</div>
                        <div style={styles.address}>
                          {v.address.slice(0, 16)}...{v.address.slice(-8)}
                        </div>
                      </div>
                    </div>
                    <a
                      href={`https://testnet.explorer.injective.network/validators/${v.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.explorerLink}
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>

                  <div style={styles.cardMetrics}>
                    <div style={styles.metricRow}>
                      <div style={styles.metricLeft}>
                        <Percent size={13} color="#f59e0b" />
                        <span style={styles.metricLabel}>Commission</span>
                      </div>
                      <span style={styles.metricValue}>
                        {(v.commission * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={styles.metricRow}>
                      <div style={styles.metricLeft}>
                        <TrendingUp size={13} color="#22c55e" />
                        <span style={styles.metricLabel}>Effective APR</span>
                      </div>
                      <span style={{ ...styles.metricValue, color: '#22c55e' }}>
                        {formatNumber(v.effectiveApr, 2)}%
                      </span>
                    </div>
                    <div style={styles.metricRow}>
                      <div style={styles.metricLeft}>
                        <Coins size={13} color="#38bdf8" />
                        <span style={styles.metricLabel}>Delegated</span>
                      </div>
                      <span style={styles.metricValue}>
                        {formatNumber(v.delegationAmount, 1)} INJ
                      </span>
                    </div>
                    <div style={styles.metricRow}>
                      <div style={styles.metricLeft}>
                        <PieChart size={13} color={colors.primary} />
                        <span style={styles.metricLabel}>Allocation</span>
                      </div>
                      <span style={{ ...styles.metricValue, color: colors.primary }}>
                        {formatNumber(v.shareOfTotal, 1)}%
                      </span>
                    </div>
                  </div>

                  {/* Allocation bar */}
                  <div style={styles.allocBar}>
                    <div
                      style={{
                        ...styles.allocFill,
                        width: `${Math.max(v.shareOfTotal, 2)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info note */}
          <div style={styles.infoNote}>
            <Shield size={14} color="#8E8EA0" />
            <span>
              The protocol distributes delegations across validators to reduce centralization risk.
              Validators can be updated by governance. Nominal network APR: {formatNumber(nominalApr, 2)}%.
            </span>
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
  content: {
    padding: '0 0 80px',
  },
  container: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '0 24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 20,
    transition: 'border-color 0.2s',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  monikerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  validatorIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: colors.primaryAlpha(0.1),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  moniker: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F0F0F5',
  },
  address: {
    fontSize: 11,
    color: '#8E8EA0',
    fontFamily: "'JetBrains Mono', monospace",
    marginTop: 2,
  },
  explorerLink: {
    color: '#8E8EA0',
    padding: 6,
    borderRadius: 8,
    transition: 'color 0.2s',
  },
  cardMetrics: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: '#8E8EA0',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: 700,
    color: '#F0F0F5',
    fontVariantNumeric: 'tabular-nums',
  },
  allocBar: {
    height: 4,
    borderRadius: 2,
    background: '#0F0F13',
    marginTop: 14,
    overflow: 'hidden',
  },
  allocFill: {
    height: '100%',
    borderRadius: 2,
    background: colors.primaryGradient,
    transition: 'width 0.4s ease',
  },
  skeletonCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 24,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  skeletonBar: {
    height: 14,
    borderRadius: 6,
    background: 'linear-gradient(90deg, #2A2A38 25%, #1A1A22 50%, #2A2A38 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease infinite',
    width: '100%',
  },
  errorCard: {
    background: '#1A1A22',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 16,
    padding: 24,
    textAlign: 'center' as const,
  },
  infoNote: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 24,
    padding: '14px 16px',
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 12,
    fontSize: 12,
    color: '#8E8EA0',
    lineHeight: 1.6,
  },
}
