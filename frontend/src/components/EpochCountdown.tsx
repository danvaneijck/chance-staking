import React, { useState, useEffect } from 'react'
import { Timer } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function EpochCountdown() {
  const currentEpoch = useStore((s) => s.currentEpoch)
  const epochStartTime = useStore((s) => s.epochStartTime)
  const epochDurationSeconds = useStore((s) => s.epochDurationSeconds)

  const [remaining, setRemaining] = useState({ d: 0, h: 0, m: 0, s: 0 })
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!epochStartTime || epochStartTime === '0' || !epochDurationSeconds) return

    const update = () => {
      // epochStartTime is in nanoseconds
      const startSec = parseInt(epochStartTime) / 1e9
      const endSec = startSec + epochDurationSeconds
      const nowSec = Date.now() / 1000
      const left = Math.max(0, endSec - nowSec)
      const elapsed = nowSec - startSec
      const pct = Math.min(100, (elapsed / epochDurationSeconds) * 100)

      const d = Math.floor(left / 86400)
      const h = Math.floor((left % 86400) / 3600)
      const m = Math.floor((left % 3600) / 60)
      const s = Math.floor(left % 60)

      setRemaining({ d, h, m, s })
      setProgress(pct)
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [epochStartTime, epochDurationSeconds])

  const pad = (n: number) => String(n).padStart(2, '0')
  const isAlmostDone = progress > 90

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.label}>
          <div style={{
            ...styles.pulseCircle,
            background: isAlmostDone ? '#f59e0b' : '#10b981',
          }}>
            <div style={{
              ...styles.pulseInner,
              background: isAlmostDone ? '#f59e0b' : '#10b981',
            }} />
          </div>
          <Timer size={14} color="#A3A3A3" />
          <span style={styles.labelText}>Epoch {currentEpoch}</span>
        </div>
        <span style={styles.nextLabel}>Next Draw</span>
      </div>

      <div style={styles.countdown}>
        {remaining.d > 0 && (
          <div style={styles.unit}>
            <span style={styles.unitValue}>{remaining.d}</span>
            <span style={styles.unitLabel}>d</span>
          </div>
        )}
        <div style={styles.unit}>
          <span style={styles.unitValue}>{pad(remaining.h)}</span>
          <span style={styles.unitLabel}>h</span>
        </div>
        <div style={styles.separator}>:</div>
        <div style={styles.unit}>
          <span style={styles.unitValue}>{pad(remaining.m)}</span>
          <span style={styles.unitLabel}>m</span>
        </div>
        <div style={styles.separator}>:</div>
        <div style={styles.unit}>
          <span style={styles.unitValue}>{pad(remaining.s)}</span>
          <span style={styles.unitLabel}>s</span>
        </div>
      </div>

      <div style={styles.progressTrack}>
        <div style={{
          ...styles.progressBar,
          width: `${progress}%`,
          background: isAlmostDone
            ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
            : 'linear-gradient(90deg, #9E7FFF, #38bdf8)',
        }} />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: 'rgba(38, 38, 38, 0.8)',
    border: '1px solid #2F2F2F',
    borderRadius: 16,
    padding: '16px 20px',
    backdropFilter: 'blur(8px)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  pulseCircle: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    position: 'relative' as const,
  },
  pulseInner: {
    position: 'absolute' as const,
    inset: -3,
    borderRadius: '50%',
    opacity: 0.3,
    animation: 'pulse 2s ease-in-out infinite',
  },
  labelText: {
    fontSize: 13,
    fontWeight: 600,
    color: '#FFFFFF',
  },
  nextLabel: {
    fontSize: 12,
    color: '#A3A3A3',
    fontWeight: 500,
  },
  countdown: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 2,
    marginBottom: 12,
  },
  unit: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 2,
  },
  unitValue: {
    fontSize: 28,
    fontWeight: 800,
    color: '#FFFFFF',
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
  },
  unitLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: '#A3A3A3',
  },
  separator: {
    fontSize: 24,
    fontWeight: 700,
    color: '#A3A3A3',
    margin: '0 4px',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    background: '#1a1a1a',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 1s linear',
  },
}
