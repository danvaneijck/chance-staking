import React, { useState } from 'react'
import { Trophy, Clock, ChevronRight, Gift, Users, Coins, Radio } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatInj } from '../utils/formatNumber'

function truncateAddr(addr: string): string {
  if (!addr) return ''
  if (addr.length <= 16) return addr
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`
}

function timeAgo(timestampNanos: string): string {
  const ts = parseInt(timestampNanos) / 1e9
  const now = Date.now() / 1000
  const diff = now - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  return `${Math.floor(diff / 86400)} days ago`
}

export default function DrawsSection() {
  const recentDraws = useStore((s) => s.recentDraws)
  const regularPoolBalance = useStore((s) => s.regularPoolBalance)
  const bigPoolBalance = useStore((s) => s.bigPoolBalance)
  const selectDraw = useStore((s) => s.selectDraw)

  const [filter, setFilter] = useState<'all' | 'regular' | 'big'>('all')

  const filtered = filter === 'all'
    ? recentDraws
    : recentDraws.filter((d) => d.draw_type === filter)

  // Sort by time descending (newest first)
  const sorted = [...filtered].sort((a, b) => {
    const timeA = parseInt(a.revealed_at || a.created_at)
    const timeB = parseInt(b.revealed_at || b.created_at)
    return timeB - timeA
  })

  // Split into committed (live) and revealed draws
  const committedDraws = sorted.filter((d) => d.status === 'committed')
  const revealedDraws = sorted.filter((d) => d.status === 'revealed')

  return (
    <section id="draws" style={styles.section}>
      <div style={styles.container}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionBadge}>
            <Trophy size={14} color="#f59e0b" />
            <span>Live Draws</span>
          </div>
          <h2 style={styles.sectionTitle}>Recent Winners</h2>
          <p style={styles.sectionSubtitle}>
            Every draw is verifiable on-chain using drand beacons and Merkle proofs.
            Click any draw to verify.
          </p>
        </div>

        {/* Pool status cards */}
        <div style={styles.poolGrid}>
          <div style={styles.poolCard}>
            <div style={styles.poolHeader}>
              <div style={{ ...styles.poolIcon, background: 'rgba(158, 127, 255, 0.12)' }}>
                <Coins size={20} color="#9E7FFF" />
              </div>
              <div>
                <div style={styles.poolLabel}>Regular Pool</div>
                <div style={styles.poolValue}>{formatInj(regularPoolBalance)} INJ</div>
              </div>
            </div>
            <div style={styles.poolMeta}>
              <span style={styles.poolMetaItem}>
                <Clock size={12} /> Draws every epoch
              </span>
              <span style={styles.poolMetaItem}>
                <Users size={12} /> Weighted by balance
              </span>
            </div>
            <div style={styles.poolProgress}>
              <div style={{ ...styles.poolProgressBar, width: '68%' }} />
            </div>
          </div>

          <div style={styles.poolCard}>
            <div style={styles.poolHeader}>
              <div style={{ ...styles.poolIcon, background: 'rgba(244, 114, 182, 0.12)' }}>
                <Gift size={20} color="#f472b6" />
              </div>
              <div>
                <div style={styles.poolLabel}>Big Jackpot Pool</div>
                <div style={styles.poolValue}>{formatInj(bigPoolBalance)} INJ</div>
              </div>
            </div>
            <div style={styles.poolMeta}>
              <span style={styles.poolMetaItem}>
                <Clock size={12} /> Monthly draws
              </span>
              <span style={styles.poolMetaItem}>
                <Users size={12} /> Equal odds
              </span>
            </div>
            <div style={styles.poolProgress}>
              <div style={{
                ...styles.poolProgressBar,
                width: '42%',
                background: 'linear-gradient(90deg, #f472b6, #ec4899)',
              }} />
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={styles.filterRow}>
          {(['all', 'regular', 'big'] as const).map((f) => (
            <button
              key={f}
              style={{
                ...styles.filterTab,
                ...(filter === f ? styles.filterTabActive : {}),
              }}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All Draws' : f === 'regular' ? 'Regular' : 'Big Jackpot'}
            </button>
          ))}
        </div>

        {/* Committed (live) draws */}
        {committedDraws.length > 0 && (
          <div style={styles.liveSection}>
            <div style={styles.liveSectionHeader}>
              <div style={styles.liveIndicator}>
                <div style={styles.livePulse} />
                <div style={styles.livePulseRing} />
              </div>
              <span style={styles.liveSectionTitle}>
                Awaiting Reveal ({committedDraws.length})
              </span>
            </div>
            <div style={styles.drawsList}>
              {committedDraws.map((draw, i) => (
                <div
                  key={draw.id}
                  style={{
                    ...styles.drawRow,
                    ...styles.drawRowCommitted,
                    animationDelay: `${i * 0.05}s`,
                  }}
                  onClick={() => selectDraw(draw.id)}
                >
                  <div style={styles.drawLeft}>
                    <div style={{
                      ...styles.drawTypeBadge,
                      background: draw.draw_type === 'big'
                        ? 'rgba(244, 114, 182, 0.12)'
                        : 'rgba(158, 127, 255, 0.12)',
                      color: draw.draw_type === 'big' ? '#f472b6' : '#9E7FFF',
                    }}>
                      <Radio size={12} style={{ animation: 'pulse 2s ease-in-out infinite' }} />
                      #{draw.id}
                    </div>
                    <div style={styles.drawInfo}>
                      <div style={styles.drawWinner}>
                        Pending reveal...
                      </div>
                      <div style={styles.drawMeta}>
                        Epoch {draw.epoch} · drand #{draw.target_drand_round} · {timeAgo(draw.created_at)}
                      </div>
                    </div>
                  </div>
                  <div style={styles.drawRight}>
                    <div style={{ ...styles.drawReward, color: '#f59e0b' }}>
                      {formatInj(draw.reward_amount)} INJ
                    </div>
                    <ChevronRight size={16} color="#A3A3A3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revealed draws list */}
        <div style={styles.drawsList}>
          {revealedDraws.length === 0 && committedDraws.length === 0 && (
            <div style={styles.emptyState}>
              No draws yet. Draws appear here once the first epoch completes.
            </div>
          )}
          {revealedDraws.map((draw, i) => (
            <div
              key={draw.id}
              style={{
                ...styles.drawRow,
                animationDelay: `${i * 0.05}s`,
              }}
              onClick={() => selectDraw(draw.id)}
            >
              <div style={styles.drawLeft}>
                <div style={{
                  ...styles.drawTypeBadge,
                  background: draw.draw_type === 'big'
                    ? 'rgba(244, 114, 182, 0.12)'
                    : 'rgba(158, 127, 255, 0.12)',
                  color: draw.draw_type === 'big' ? '#f472b6' : '#9E7FFF',
                }}>
                  {draw.draw_type === 'big' ? '🏆' : '✨'} #{draw.id}
                </div>
                <div style={styles.drawInfo}>
                  <div style={styles.drawWinner}>
                    {truncateAddr(draw.winner || '')}
                  </div>
                  <div style={styles.drawMeta}>
                    Epoch {draw.epoch} · drand #{draw.target_drand_round} · {timeAgo(draw.revealed_at || draw.created_at)}
                  </div>
                </div>
              </div>
              <div style={styles.drawRight}>
                <div style={{
                  ...styles.drawReward,
                  color: draw.draw_type === 'big' ? '#f472b6' : '#10b981',
                }}>
                  +{formatInj(draw.reward_amount)} INJ
                </div>
                <ChevronRight size={16} color="#A3A3A3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    padding: '80px 0',
  },
  container: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
  },
  sectionHeader: {
    textAlign: 'center' as const,
    marginBottom: 48,
  },
  sectionBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 14px',
    borderRadius: 9999,
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    fontSize: 12,
    fontWeight: 600,
    color: '#f59e0b',
    marginBottom: 16,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  sectionTitle: {
    fontSize: 42,
    fontWeight: 800,
    color: '#FFFFFF',
    letterSpacing: '-0.03em',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#A3A3A3',
    maxWidth: 480,
    margin: '0 auto',
  },
  poolGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
    marginBottom: 40,
  },
  poolCard: {
    background: '#262626',
    border: '1px solid #2F2F2F',
    borderRadius: 20,
    padding: 24,
  },
  poolHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  poolIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: '#A3A3A3',
    marginBottom: 2,
  },
  poolValue: {
    fontSize: 24,
    fontWeight: 800,
    color: '#FFFFFF',
    letterSpacing: '-0.02em',
  },
  poolMeta: {
    display: 'flex',
    gap: 16,
    marginBottom: 16,
  },
  poolMetaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#A3A3A3',
  },
  poolProgress: {
    height: 4,
    borderRadius: 2,
    background: '#1a1a1a',
    overflow: 'hidden',
  },
  poolProgressBar: {
    height: '100%',
    borderRadius: 2,
    background: 'linear-gradient(90deg, #9E7FFF, #7B5CE0)',
    transition: 'width 0.5s ease',
  },
  filterRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 24,
  },
  filterTab: {
    padding: '8px 18px',
    borderRadius: 10,
    background: 'transparent',
    color: '#A3A3A3',
    fontSize: 13,
    fontWeight: 600,
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterTabActive: {
    background: 'rgba(158, 127, 255, 0.1)',
    color: '#9E7FFF',
    border: '1px solid rgba(158, 127, 255, 0.2)',
  },
  liveSection: {
    marginBottom: 16,
  },
  liveSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  liveIndicator: {
    position: 'relative' as const,
    width: 10,
    height: 10,
  },
  livePulse: {
    position: 'absolute' as const,
    inset: 0,
    borderRadius: '50%',
    background: '#f59e0b',
  },
  livePulseRing: {
    position: 'absolute' as const,
    inset: -4,
    borderRadius: '50%',
    border: '2px solid #f59e0b',
    opacity: 0.4,
    animation: 'pulse 2s ease-in-out infinite',
  },
  liveSectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#f59e0b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  drawsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 24px',
    color: '#A3A3A3',
    fontSize: 14,
  },
  drawRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderRadius: 14,
    background: '#262626',
    border: '1px solid transparent',
    transition: 'all 0.2s',
    cursor: 'pointer',
    animation: 'fadeInUp 0.4s ease-out both',
  },
  drawRowCommitted: {
    border: '1px solid rgba(245, 158, 11, 0.15)',
    background: 'linear-gradient(135deg, rgba(38, 38, 38, 1), rgba(245, 158, 11, 0.03))',
  },
  drawLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  drawTypeBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
  },
  drawInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  drawWinner: {
    fontSize: 14,
    fontWeight: 600,
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  drawMeta: {
    fontSize: 12,
    color: '#A3A3A3',
  },
  drawRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  drawReward: {
    fontSize: 15,
    fontWeight: 700,
  },
}
