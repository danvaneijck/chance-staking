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

  const sorted = [...filtered].sort((a, b) => {
    const timeA = parseInt(a.revealed_at || a.created_at)
    const timeB = parseInt(b.revealed_at || b.created_at)
    return timeB - timeA
  })

  const committedDraws = sorted.filter((d) => d.status === 'committed')
  const revealedDraws = sorted.filter((d) => d.status === 'revealed')

  return (
    <section id="draws" style={styles.section}>
      <div className="section-container" style={styles.container}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionBadge}>
            <Trophy size={13} color="#f59e0b" />
            <span>Live Draws</span>
          </div>
          <h2 className="draws-section-title" style={styles.sectionTitle}>Recent Winners</h2>
          <p style={styles.sectionSubtitle}>
            Every draw is verifiable on-chain using drand beacons and Merkle proofs.
            Click any draw to verify.
          </p>
        </div>

        {/* Pool status cards */}
        <div className="draws-pool-grid" style={styles.poolGrid}>
          <div style={styles.poolCard}>
            <div style={styles.poolHeader}>
              <div style={{ ...styles.poolIcon, background: 'rgba(139, 111, 255, 0.1)' }}>
                <Coins size={18} color="#8B6FFF" />
              </div>
              <div>
                <div style={styles.poolLabel}>Regular Pool</div>
                <div style={styles.poolValue}>{formatInj(regularPoolBalance)} INJ</div>
              </div>
            </div>
            <div style={styles.poolMeta}>
              <span style={styles.poolMetaItem}>
                <Clock size={11} /> Draws every epoch
              </span>
              <span style={styles.poolMetaItem}>
                <Users size={11} /> Weighted by balance
              </span>
            </div>
            <div style={styles.poolProgress}>
              <div style={{ ...styles.poolProgressBar, width: '68%' }} />
            </div>
          </div>

          <div style={styles.poolCard}>
            <div style={styles.poolHeader}>
              <div style={{ ...styles.poolIcon, background: 'rgba(244, 114, 182, 0.1)' }}>
                <Gift size={18} color="#f472b6" />
              </div>
              <div>
                <div style={styles.poolLabel}>Big Jackpot Pool</div>
                <div style={styles.poolValue}>{formatInj(bigPoolBalance)} INJ</div>
              </div>
            </div>
            <div style={styles.poolMeta}>
              <span style={styles.poolMetaItem}>
                <Clock size={11} /> Monthly draws
              </span>
              <span style={styles.poolMetaItem}>
                <Users size={11} /> Equal odds
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
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(245, 158, 11, 0.25)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(245, 158, 11, 0.12)' }}
                >
                  <div style={styles.drawLeft}>
                    <div style={{
                      ...styles.drawTypeBadge,
                      background: draw.draw_type === 'big'
                        ? 'rgba(244, 114, 182, 0.1)'
                        : 'rgba(139, 111, 255, 0.1)',
                      color: draw.draw_type === 'big' ? '#f472b6' : '#8B6FFF',
                    }}>
                      <Radio size={11} style={{ animation: 'pulse 2s ease-in-out infinite' }} />
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
                    <ChevronRight size={14} color="#8E8EA0" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revealed draws list - scrollable */}
        <div style={styles.drawsListScrollable}>
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
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#2A2A38' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent' }}
            >
              <div style={styles.drawLeft}>
                <div style={{
                  ...styles.drawTypeBadge,
                  background: draw.draw_type === 'big'
                    ? 'rgba(244, 114, 182, 0.1)'
                    : 'rgba(139, 111, 255, 0.1)',
                  color: draw.draw_type === 'big' ? '#f472b6' : '#8B6FFF',
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
                  color: draw.draw_type === 'big' ? '#f472b6' : '#22c55e',
                }}>
                  +{formatInj(draw.reward_amount)} INJ
                </div>
                <ChevronRight size={14} color="#8E8EA0" />
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
    marginBottom: 40,
  },
  sectionBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 13px',
    borderRadius: 9999,
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    fontSize: 11,
    fontWeight: 600,
    color: '#f59e0b',
    marginBottom: 14,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  sectionTitle: {
    fontSize: 38,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.03em',
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontSize: 15,
    color: '#8E8EA0',
    maxWidth: 460,
    margin: '0 auto',
  },
  poolGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginBottom: 32,
  },
  poolCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 20,
  },
  poolHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  poolIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: '#8E8EA0',
    marginBottom: 2,
  },
  poolValue: {
    fontSize: 22,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.02em',
  },
  poolMeta: {
    display: 'flex',
    gap: 14,
    marginBottom: 14,
  },
  poolMetaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    color: '#8E8EA0',
  },
  poolProgress: {
    height: 3,
    borderRadius: 2,
    background: '#0F0F13',
    overflow: 'hidden',
  },
  poolProgressBar: {
    height: '100%',
    borderRadius: 2,
    background: 'linear-gradient(90deg, #8B6FFF, #6B4FD6)',
    transition: 'width 0.5s ease',
  },
  filterRow: {
    display: 'flex',
    gap: 6,
    marginBottom: 20,
  },
  filterTab: {
    padding: '7px 16px',
    borderRadius: 8,
    background: 'transparent',
    color: '#8E8EA0',
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterTabActive: {
    background: 'rgba(139, 111, 255, 0.08)',
    color: '#8B6FFF',
    border: '1px solid rgba(139, 111, 255, 0.15)',
  },
  liveSection: {
    marginBottom: 12,
  },
  liveSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  liveIndicator: {
    position: 'relative' as const,
    width: 9,
    height: 9,
  },
  livePulse: {
    position: 'absolute' as const,
    inset: 0,
    borderRadius: '50%',
    background: '#f59e0b',
  },
  livePulseRing: {
    position: 'absolute' as const,
    inset: -3,
    borderRadius: '50%',
    border: '2px solid #f59e0b',
    opacity: 0.4,
    animation: 'pulse 2s ease-in-out infinite',
  },
  liveSectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#f59e0b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  drawsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  drawsListScrollable: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    maxHeight: 420,
    overflowY: 'auto' as const,
    paddingRight: 4,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '40px 24px',
    color: '#8E8EA0',
    fontSize: 13,
  },
  drawRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderRadius: 12,
    background: '#1A1A22',
    border: '1px solid transparent',
    transition: 'all 0.2s',
    cursor: 'pointer',
    animation: 'fadeInUp 0.4s ease-out both',
  },
  drawRowCommitted: {
    border: '1px solid rgba(245, 158, 11, 0.12)',
    background: 'linear-gradient(135deg, rgba(26, 26, 34, 1), rgba(245, 158, 11, 0.02))',
  },
  drawLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
  },
  drawTypeBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    borderRadius: 7,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  drawInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
  },
  drawWinner: {
    fontSize: 13,
    fontWeight: 600,
    color: '#F0F0F5',
    fontFamily: "'JetBrains Mono', monospace",
  },
  drawMeta: {
    fontSize: 11,
    color: '#8E8EA0',
  },
  drawRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  drawReward: {
    fontSize: 14,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
}
