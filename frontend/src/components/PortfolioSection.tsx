import React, { useState } from 'react'
import { Clock, Trophy, Download, Loader, Target } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatInj, formatNumber } from '../utils/formatNumber'

function formatTimestamp(nanos: string): string {
  const ms = parseInt(nanos) / 1e6
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PortfolioSection() {
  const unstakeRequests = useStore((s) => s.unstakeRequests)
  const userWins = useStore((s) => s.userWins)
  const userWinDraws = useStore((s) => s.userWinDraws)
  const claimUnstaked = useStore((s) => s.claimUnstaked)
  const isLoading = useStore((s) => s.isLoading)
  const injBalance = useStore((s) => s.injBalance)
  const csinjBalance = useStore((s) => s.csinjBalance)
  const snapshotTotalWeight = useStore((s) => s.snapshotTotalWeight)
  const snapshotNumHolders = useStore((s) => s.snapshotNumHolders)

  const [tab, setTab] = useState<'overview' | 'unstaking' | 'wins'>('overview')
  const [claiming, setClaiming] = useState<number | null>(null)

  const now = Date.now() * 1e6
  const pendingRequests = unstakeRequests.filter((r) => !r.request.claimed)
  const claimableRequests = pendingRequests.filter(
    (r) => parseInt(r.request.unlock_time) <= now / 1e6,
  )

  const handleClaim = async (ids: number[]) => {
    setClaiming(ids[0])
    try {
      await claimUnstaked(ids)
    } finally {
      setClaiming(null)
    }
  }

  return (
    <section id="portfolio" style={styles.section}>
      <div className="section-container" style={styles.container}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Your Portfolio</h2>
        </div>

        {/* Tabs */}
        <div style={styles.tabRow}>
          {(['overview', 'unstaking', 'wins'] as const).map((t) => (
            <button
              key={t}
              style={{
                ...styles.tab,
                ...(tab === t ? styles.tabActive : {}),
              }}
              onClick={() => setTab(t)}
            >
              {t === 'overview'
                ? 'Overview'
                : t === 'unstaking'
                ? `Unstaking (${pendingRequests.length})`
                : `Wins (${userWins?.total_wins ?? 0})`}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === 'overview' && (
          <>
            <div className="portfolio-overview-grid" style={styles.overviewGrid}>
              <div style={styles.balanceCard}>
                <div style={styles.balanceLabel}>INJ Balance</div>
                <div style={styles.balanceValue}>{formatInj(injBalance)} INJ</div>
              </div>
              <div style={styles.balanceCard}>
                <div style={styles.balanceLabel}>csINJ Balance</div>
                <div style={styles.balanceValue}>{formatInj(csinjBalance)} csINJ</div>
              </div>
              <div style={styles.balanceCard}>
                <div style={styles.balanceLabel}>Total Wins</div>
                <div style={{ ...styles.balanceValue, color: '#22c55e' }}>
                  {userWins?.total_wins ?? 0}
                </div>
              </div>
              <div style={styles.balanceCard}>
                <div style={styles.balanceLabel}>Total Won</div>
                <div style={{ ...styles.balanceValue, color: '#f59e0b' }}>
                  {formatInj(userWins?.total_won_amount ?? '0')} INJ
                </div>
              </div>
            </div>

            {/* Your Odds Card */}
            {parseFloat(csinjBalance) > 0 && (
              <div style={styles.oddsCard}>
                <div style={styles.oddsHeader}>
                  <div style={styles.oddsIconWrap}>
                    <Target size={16} color="#8B6FFF" />
                  </div>
                  <div>
                    <div style={styles.oddsTitle}>Your Draw Odds</div>
                    <div style={styles.oddsSubtitle}>
                      Based on current snapshot ({snapshotNumHolders} holders)
                    </div>
                  </div>
                </div>
                <div style={styles.oddsBody}>
                  <div style={styles.oddsMain}>
                    <div style={styles.oddsPercent}>
                      {parseFloat(snapshotTotalWeight) > 0
                        ? formatNumber((parseFloat(csinjBalance) / parseFloat(snapshotTotalWeight)) * 100, 4)
                        : '0'}%
                    </div>
                    <div style={styles.oddsLabel}>Regular Draw</div>
                    <div style={styles.oddsDetail}>
                      Weighted by csINJ balance
                    </div>
                  </div>
                  <div style={styles.oddsDivider} />
                  <div style={styles.oddsMain}>
                    <div style={styles.oddsPercent}>
                      {snapshotNumHolders > 0
                        ? formatNumber(100 / snapshotNumHolders, 4)
                        : '0'}%
                    </div>
                    <div style={styles.oddsLabel}>Big Jackpot</div>
                    <div style={styles.oddsDetail}>
                      Equal odds per holder
                    </div>
                  </div>
                </div>
                <div style={styles.oddsBarContainer}>
                  <div style={styles.oddsBarTrack}>
                    <div style={{
                      ...styles.oddsBarFill,
                      width: `${parseFloat(snapshotTotalWeight) > 0
                        ? Math.min(100, (parseFloat(csinjBalance) / parseFloat(snapshotTotalWeight)) * 100)
                        : 0}%`,
                    }} />
                  </div>
                  <div style={styles.oddsBarLabel}>
                    Your share of snapshot weight
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Unstaking tab - scrollable */}
        {tab === 'unstaking' && (
          <div style={styles.listScrollable}>
            {pendingRequests.length === 0 && (
              <div style={styles.emptyState}>
                No pending unstake requests.
              </div>
            )}
            {claimableRequests.length > 1 && (
              <button
                style={styles.claimAllButton}
                onClick={() => handleClaim(claimableRequests.map((r) => r.id))}
                disabled={isLoading}
              >
                <Download size={13} />
                Claim All ({claimableRequests.length})
              </button>
            )}
            {pendingRequests.map((entry) => {
              const unlockTime = parseInt(entry.request.unlock_time) / 1e6
              const isClaimable = unlockTime <= Date.now()
              const isClaiming = claiming === entry.id

              return (
                <div key={entry.id} style={styles.unstakeRow}>
                  <div style={styles.unstakeLeft}>
                    <div style={{
                      ...styles.unstakeIcon,
                      background: isClaimable
                        ? 'rgba(34, 197, 94, 0.1)'
                        : 'rgba(245, 158, 11, 0.1)',
                    }}>
                      <Clock size={15} color={isClaimable ? '#22c55e' : '#f59e0b'} />
                    </div>
                    <div>
                      <div style={styles.unstakeAmount}>
                        {formatInj(entry.request.inj_amount)} INJ
                      </div>
                      <div style={styles.unstakeMeta}>
                        {isClaimable ? (
                          <span style={{ color: '#22c55e' }}>Ready to claim</span>
                        ) : (
                          <span>Unlocks {formatTimestamp(entry.request.unlock_time)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isClaimable && (
                    <button
                      style={styles.claimButton}
                      onClick={() => handleClaim([entry.id])}
                      disabled={isClaiming || isLoading}
                    >
                      {isClaiming ? (
                        <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Download size={13} />
                      )}
                      {isClaiming ? 'Claiming...' : 'Claim'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Wins tab - scrollable */}
        {tab === 'wins' && (
          <div style={styles.listScrollable}>
            {(!userWinDraws || userWinDraws.length === 0) && (
              <div style={styles.emptyState}>
                No wins yet. Keep staking for more chances!
              </div>
            )}
            {userWinDraws.map((draw) => (
              <div key={draw.id} style={styles.winRow}>
                <div style={styles.winLeft}>
                  <div style={{
                    ...styles.winIcon,
                    background: draw.draw_type === 'big'
                      ? 'rgba(244, 114, 182, 0.1)'
                      : 'rgba(139, 111, 255, 0.1)',
                  }}>
                    <Trophy
                      size={15}
                      color={draw.draw_type === 'big' ? '#f472b6' : '#8B6FFF'}
                    />
                  </div>
                  <div>
                    <div style={styles.winLabel}>
                      {draw.draw_type === 'big' ? 'Big Jackpot' : 'Regular Draw'} #{draw.id}
                    </div>
                    <div style={styles.winMeta}>
                      Epoch {draw.epoch} · {formatTimestamp(draw.revealed_at || draw.created_at)}
                    </div>
                  </div>
                </div>
                <div style={{
                  ...styles.winAmount,
                  color: draw.draw_type === 'big' ? '#f472b6' : '#22c55e',
                }}>
                  +{formatInj(draw.reward_amount)} INJ
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    padding: '40px 0 80px',
  },
  container: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '0 24px',
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.03em',
  },
  tabRow: {
    display: 'flex',
    gap: 3,
    background: '#0F0F13',
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 10,
    background: 'transparent',
    color: '#8E8EA0',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center' as const,
  },
  tabActive: {
    background: '#252530',
    color: '#F0F0F5',
  },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  balanceCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 20,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: '#8E8EA0',
    marginBottom: 6,
  },
  balanceValue: {
    fontSize: 22,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.02em',
  },
  listScrollable: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    maxHeight: 380,
    overflowY: 'auto' as const,
    paddingRight: 4,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '40px 24px',
    color: '#8E8EA0',
    fontSize: 13,
    background: '#1A1A22',
    borderRadius: 14,
    border: '1px solid #2A2A38',
  },
  claimAllButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: '10px 20px',
    borderRadius: 10,
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    marginBottom: 6,
  },
  unstakeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderRadius: 14,
    background: '#1A1A22',
    border: '1px solid #2A2A38',
  },
  unstakeLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  unstakeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unstakeAmount: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F0F0F5',
  },
  unstakeMeta: {
    fontSize: 11,
    color: '#8E8EA0',
    marginTop: 2,
  },
  claimButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '7px 14px',
    borderRadius: 8,
    background: 'rgba(34, 197, 94, 0.1)',
    color: '#22c55e',
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid rgba(34, 197, 94, 0.15)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  winRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderRadius: 14,
    background: '#1A1A22',
    border: '1px solid #2A2A38',
  },
  winLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  winIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  winLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#F0F0F5',
  },
  winMeta: {
    fontSize: 11,
    color: '#8E8EA0',
    marginTop: 2,
  },
  winAmount: {
    fontSize: 15,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  oddsCard: {
    marginTop: 12,
    background: 'linear-gradient(135deg, rgba(26, 26, 34, 1), rgba(139, 111, 255, 0.03))',
    border: '1px solid rgba(139, 111, 255, 0.12)',
    borderRadius: 16,
    padding: 22,
  },
  oddsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  oddsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'rgba(139, 111, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  oddsTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F0F0F5',
  },
  oddsSubtitle: {
    fontSize: 11,
    color: '#8E8EA0',
    marginTop: 2,
  },
  oddsBody: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    marginBottom: 18,
  },
  oddsMain: {
    flex: 1,
    textAlign: 'center' as const,
  },
  oddsDivider: {
    width: 1,
    height: 48,
    background: '#2A2A38',
    flexShrink: 0,
  },
  oddsPercent: {
    fontSize: 26,
    fontWeight: 800,
    color: '#8B6FFF',
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  oddsLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#F0F0F5',
    marginTop: 4,
  },
  oddsDetail: {
    fontSize: 11,
    color: '#8E8EA0',
    marginTop: 2,
  },
  oddsBarContainer: {
    marginTop: 4,
  },
  oddsBarTrack: {
    height: 3,
    borderRadius: 2,
    background: '#0F0F13',
    overflow: 'hidden',
  },
  oddsBarFill: {
    height: '100%',
    borderRadius: 2,
    background: 'linear-gradient(90deg, #8B6FFF, #38bdf8)',
    transition: 'width 0.5s ease',
    minWidth: 2,
  },
  oddsBarLabel: {
    fontSize: 10,
    color: '#525260',
    marginTop: 5,
    textAlign: 'center' as const,
  },
}
