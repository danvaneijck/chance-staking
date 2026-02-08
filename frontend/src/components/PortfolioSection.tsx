import React, { useState } from 'react'
import { Clock, Trophy, Download, Loader } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatInj } from '../utils/formatNumber'

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

  const [tab, setTab] = useState<'overview' | 'unstaking' | 'wins'>('overview')
  const [claiming, setClaiming] = useState<number | null>(null)

  const now = Date.now() * 1e6 // nanoseconds

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
      <div style={styles.container}>
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
          <div style={styles.overviewGrid}>
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
              <div style={{ ...styles.balanceValue, color: '#10b981' }}>
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
        )}

        {/* Unstaking tab */}
        {tab === 'unstaking' && (
          <div style={styles.list}>
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
                <Download size={14} />
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
                        ? 'rgba(16, 185, 129, 0.12)'
                        : 'rgba(245, 158, 11, 0.12)',
                    }}>
                      <Clock size={16} color={isClaimable ? '#10b981' : '#f59e0b'} />
                    </div>
                    <div>
                      <div style={styles.unstakeAmount}>
                        {formatInj(entry.request.inj_amount)} INJ
                      </div>
                      <div style={styles.unstakeMeta}>
                        {isClaimable ? (
                          <span style={{ color: '#10b981' }}>Ready to claim</span>
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
                        <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Download size={14} />
                      )}
                      {isClaiming ? 'Claiming...' : 'Claim'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Wins tab */}
        {tab === 'wins' && (
          <div style={styles.list}>
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
                      ? 'rgba(244, 114, 182, 0.12)'
                      : 'rgba(158, 127, 255, 0.12)',
                  }}>
                    <Trophy
                      size={16}
                      color={draw.draw_type === 'big' ? '#f472b6' : '#9E7FFF'}
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
                  color: draw.draw_type === 'big' ? '#f472b6' : '#10b981',
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
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: 800,
    color: '#FFFFFF',
    letterSpacing: '-0.03em',
  },
  tabRow: {
    display: 'flex',
    gap: 4,
    background: '#1a1a1a',
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    padding: '12px 0',
    borderRadius: 12,
    background: 'transparent',
    color: '#A3A3A3',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center' as const,
  },
  tabActive: {
    background: '#2F2F2F',
    color: '#FFFFFF',
  },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  balanceCard: {
    background: '#262626',
    border: '1px solid #2F2F2F',
    borderRadius: 20,
    padding: 24,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: '#A3A3A3',
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: 800,
    color: '#FFFFFF',
    letterSpacing: '-0.02em',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 24px',
    color: '#A3A3A3',
    fontSize: 14,
    background: '#262626',
    borderRadius: 16,
    border: '1px solid #2F2F2F',
  },
  claimAllButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 24px',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    marginBottom: 8,
  },
  unstakeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderRadius: 16,
    background: '#262626',
    border: '1px solid #2F2F2F',
  },
  unstakeLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  unstakeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unstakeAmount: {
    fontSize: 16,
    fontWeight: 700,
    color: '#FFFFFF',
  },
  unstakeMeta: {
    fontSize: 12,
    color: '#A3A3A3',
    marginTop: 2,
  },
  claimButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    borderRadius: 10,
    background: 'rgba(16, 185, 129, 0.12)',
    color: '#10b981',
    fontSize: 13,
    fontWeight: 600,
    border: '1px solid rgba(16, 185, 129, 0.2)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  winRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderRadius: 16,
    background: '#262626',
    border: '1px solid #2F2F2F',
  },
  winLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  winIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  winLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: '#FFFFFF',
  },
  winMeta: {
    fontSize: 12,
    color: '#A3A3A3',
    marginTop: 2,
  },
  winAmount: {
    fontSize: 16,
    fontWeight: 700,
  },
}
