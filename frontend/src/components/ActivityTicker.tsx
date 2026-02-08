import React, { useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatInj } from '../utils/formatNumber'

function truncateAddr(addr: string): string {
  if (!addr) return ''
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`
}

function timeAgo(timestampNanos: string): string {
  const ts = parseInt(timestampNanos) / 1e9
  const now = Date.now() / 1000
  const diff = now - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function ActivityTicker() {
  const recentDraws = useStore((s) => s.recentDraws)

  const revealedDraws = useMemo(() =>
    recentDraws
      .filter((d) => d.status === 'revealed' && d.winner)
      .sort((a, b) => parseInt(b.revealed_at || '0') - parseInt(a.revealed_at || '0'))
      .slice(0, 10),
    [recentDraws],
  )

  if (revealedDraws.length === 0) return null

  // Duplicate items for seamless loop
  const items = [...revealedDraws, ...revealedDraws]

  return (
    <div style={styles.wrapper}>
      <div style={styles.trackContainer}>
        <div style={styles.track}>
          {items.map((draw, i) => {
            const isBig = draw.draw_type === 'big'
            return (
              <div key={`${draw.id}-${i}`} style={styles.item}>
                <div style={{
                  ...styles.icon,
                  background: isBig
                    ? 'rgba(244, 114, 182, 0.15)'
                    : 'rgba(139, 111, 255, 0.15)',
                }}>
                  <Trophy size={12} color={isBig ? '#f472b6' : '#8B6FFF'} />
                </div>
                <span style={styles.address}>{truncateAddr(draw.winner!)}</span>
                <span style={styles.won}>won</span>
                <span style={{
                  ...styles.amount,
                  color: isBig ? '#f472b6' : '#22c55e',
                }}>
                  {formatInj(draw.reward_amount)} INJ
                </span>
                <span style={styles.time}>
                  {timeAgo(draw.revealed_at || draw.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const ITEM_COUNT_APPROX = 10
const SCROLL_DURATION = ITEM_COUNT_APPROX * 5 // ~5s per item

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    marginTop: 24,
    overflow: 'hidden',
    borderRadius: 12,
    background: 'rgba(26, 26, 34, 0.6)',
    border: '1px solid rgba(42, 42, 56, 0.4)',
    padding: '10px 0',
  },
  trackContainer: {
    overflow: 'hidden',
    maskImage: 'linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%)',
  },
  track: {
    display: 'flex',
    gap: 24,
    animation: `tickerScroll ${SCROLL_DURATION}s linear infinite`,
    width: 'max-content',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  icon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  address: {
    fontSize: 12,
    fontWeight: 600,
    color: '#F0F0F5',
    fontFamily: "'JetBrains Mono', monospace",
  },
  won: {
    fontSize: 12,
    color: '#8E8EA0',
  },
  amount: {
    fontSize: 12,
    fontWeight: 700,
  },
  time: {
    fontSize: 11,
    color: '#525252',
    marginLeft: 2,
  },
}
