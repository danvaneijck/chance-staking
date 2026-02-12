import React, { useEffect, useState } from 'react'
import {
  ArrowLeft, Shield, ExternalLink, Copy, Check,
  Hash, Dice1, Trophy, Clock, Loader,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { colors } from '../theme'
import * as contractsService from '../services/contracts'
import type { Draw } from '../services/contracts'
import { formatInj } from '../utils/formatNumber'

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function truncateHex(hex: string, len: number = 12): string {
  if (hex.length <= len * 2) return hex
  return `${hex.slice(0, len)}...${hex.slice(-len)}`
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

function formatTimestamp(nanos: string): string {
  const ms = parseInt(nanos) / 1e6
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function DrawDetail({ drawId }: { drawId: number }) {
  const selectDraw = useStore((s) => s.selectDraw)
  const [draw, setDraw] = useState<Draw | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    contractsService
      .fetchDraw(drawId)
      .then(setDraw)
      .catch((err) => setError(err?.message || 'Failed to load draw'))
      .finally(() => setLoading(false))
  }, [drawId])

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
  }

  const drandRandomnessHex = draw?.drand_randomness ? bytesToHex(draw.drand_randomness) : null
  const operatorSecretHex = draw?.operator_secret ? bytesToHex(draw.operator_secret) : null
  const finalRandomnessHex = draw?.final_randomness ? bytesToHex(draw.final_randomness) : null

  return (
    <section style={styles.section}>
      <div className="draw-detail-container section-container" style={styles.container}>
        <button
          style={styles.backButton}
          onClick={() => { window.location.hash = '#/draws' }}
        >
          <ArrowLeft size={18} />
          Back to Draws
        </button>

        {loading && (
          <div style={styles.loadingState}>
            <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} color={colors.primary} />
            <span>Loading draw #{drawId}...</span>
          </div>
        )}

        {error && (
          <div style={styles.errorState}>{error}</div>
        )}

        {draw && !loading && (
          <>
            {/* Header */}
            <div className="draw-header" style={styles.drawHeader}>
              <div style={styles.drawHeaderLeft}>
                <div style={{
                  ...styles.typeBadge,
                  background: draw.draw_type === 'big'
                    ? 'rgba(244, 114, 182, 0.12)'
                    : colors.primaryAlpha(0.12),
                  color: draw.draw_type === 'big' ? '#f472b6' : colors.primary,
                }}>
                  {draw.draw_type === 'big' ? 'Big Jackpot' : 'Regular Draw'}
                </div>
                <h1 className="draw-detail-title" style={styles.drawTitle}>Draw #{draw.id}</h1>
                <div style={styles.drawTime}>
                  {draw.revealed_at
                    ? `Revealed ${timeAgo(draw.revealed_at)} · ${formatTimestamp(draw.revealed_at)}`
                    : `Created ${timeAgo(draw.created_at)}`}
                </div>
              </div>
              <div style={{
                ...styles.statusBadge,
                background: draw.status === 'revealed'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : draw.status === 'committed'
                    ? 'rgba(245, 158, 11, 0.12)'
                    : 'rgba(239, 68, 68, 0.12)',
                color: draw.status === 'revealed'
                  ? '#22c55e'
                  : draw.status === 'committed'
                    ? '#f59e0b'
                    : '#ef4444',
              }}>
                {draw.status.charAt(0).toUpperCase() + draw.status.slice(1)}
              </div>
            </div>

            {/* Winner Card */}
            {draw.status === 'revealed' && draw.winner && (
              <div style={styles.winnerCard}>
                <div style={styles.winnerCardHeader}>
                  <Trophy size={20} color="#f59e0b" />
                  <span style={styles.winnerCardTitle}>Winner</span>
                </div>
                <div style={styles.winnerAddress}>{draw.winner}</div>
                <div style={styles.winnerReward}>
                  +{formatInj(draw.reward_amount, 4)} INJ
                </div>
              </div>
            )}

            {/* Verification Section */}
            <div style={styles.verifySection}>
              <div style={styles.verifySectionHeader}>
                <Shield size={18} color={colors.primary} />
                <h2 style={styles.verifySectionTitle}>Randomness Verification</h2>
              </div>
              <p style={styles.verifyDescription}>
                This draw's winner was selected using verifiable randomness from the drand network,
                combined with a pre-committed operator secret via XOR.
              </p>

              {/* Step 1: drand beacon */}
              <div style={styles.verifyStep}>
                <div style={styles.stepNumber}>1</div>
                <div style={styles.stepContent}>
                  <div style={styles.stepTitle}>
                    <Dice1 size={14} />
                    drand Beacon (Round #{draw.target_drand_round})
                  </div>
                  <div style={styles.stepDescription}>
                    Public randomness from the drand quicknet network
                  </div>
                  {drandRandomnessHex ? (
                    <div style={styles.hexRow}>
                      <code style={styles.hexValue}>{truncateHex(drandRandomnessHex, 20)}</code>
                      <button
                        style={styles.copyBtn}
                        onClick={() => copyText(drandRandomnessHex, 'drand')}
                      >
                        {copied === 'drand' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  ) : (
                    <div style={styles.pendingValue}>Pending reveal...</div>
                  )}
                  <a
                    href={`https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/${draw.target_drand_round}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.verifyLink}
                  >
                    Verify on drand.sh <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* Step 2: Operator Secret */}
              <div style={styles.verifyStep}>
                <div style={styles.stepNumber}>2</div>
                <div style={styles.stepContent}>
                  <div style={styles.stepTitle}>
                    <Hash size={14} />
                    Operator Secret
                  </div>
                  <div style={styles.stepDescription}>
                    Pre-committed as SHA256 hash: {truncateHex(draw.operator_commit, 12)}
                  </div>
                  {operatorSecretHex ? (
                    <div style={styles.hexRow}>
                      <code style={styles.hexValue}>{truncateHex(operatorSecretHex, 20)}</code>
                      <button
                        style={styles.copyBtn}
                        onClick={() => copyText(operatorSecretHex, 'secret')}
                      >
                        {copied === 'secret' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  ) : (
                    <div style={styles.pendingValue}>Pending reveal...</div>
                  )}
                </div>
              </div>

              {/* Step 3: Final Randomness */}
              <div style={styles.verifyStep}>
                <div style={styles.stepNumber}>3</div>
                <div style={styles.stepContent}>
                  <div style={styles.stepTitle}>
                    <Shield size={14} />
                    Final Randomness (drand XOR secret)
                  </div>
                  <div style={styles.stepDescription}>
                    Combined randomness used to select winner: winning_ticket = final_randomness[0..16] mod total_weight
                  </div>
                  {finalRandomnessHex ? (
                    <div style={styles.hexRow}>
                      <code style={styles.hexValue}>{truncateHex(finalRandomnessHex, 20)}</code>
                      <button
                        style={styles.copyBtn}
                        onClick={() => copyText(finalRandomnessHex, 'final')}
                      >
                        {copied === 'final' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  ) : (
                    <div style={styles.pendingValue}>Pending reveal...</div>
                  )}
                </div>
              </div>

              {/* Computation Summary */}
              {draw.status === 'revealed' && draw.total_weight && finalRandomnessHex && (
                <div style={styles.computationCard}>
                  <div style={styles.computationTitle}>Winner Selection</div>
                  <div style={styles.computationRow}>
                    <span style={styles.computationLabel}>Total Weight</span>
                    <span style={styles.computationValue}>{draw.total_weight}</span>
                  </div>
                  <div style={styles.computationRow}>
                    <span style={styles.computationLabel}>Merkle Root</span>
                    <span style={styles.computationValue}>
                      {draw.merkle_root ? truncateHex(draw.merkle_root, 12) : 'N/A'}
                    </span>
                  </div>
                  <div style={styles.computationRow}>
                    <span style={styles.computationLabel}>Epoch</span>
                    <span style={styles.computationValue}>{draw.epoch}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Draw Metadata */}
            <div style={styles.metaGrid}>
              <div style={styles.metaCard}>
                <Clock size={16} color="#8E8EA0" />
                <div style={styles.metaLabel}>Created</div>
                <div style={styles.metaValue}>{formatTimestamp(draw.created_at)}</div>
              </div>
              <div style={styles.metaCard}>
                <Clock size={16} color="#8E8EA0" />
                <div style={styles.metaLabel}>Reveal Deadline</div>
                <div style={styles.metaValue}>{formatTimestamp(draw.reveal_deadline)}</div>
              </div>
              {draw.revealed_at && (
                <div style={styles.metaCard}>
                  <Check size={16} color="#22c55e" />
                  <div style={styles.metaLabel}>Revealed</div>
                  <div style={styles.metaValue}>{formatTimestamp(draw.revealed_at)}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    paddingTop: 96,
    paddingBottom: 80,
    minHeight: '100vh',
  },
  container: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '0 24px',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'transparent',
    color: '#8E8EA0',
    fontSize: 14,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    padding: '8px 0',
    marginBottom: 24,
    transition: 'color 0.2s',
  },
  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '80px 24px',
    color: '#8E8EA0',
    fontSize: 16,
  },
  errorState: {
    textAlign: 'center' as const,
    padding: '48px 24px',
    color: '#ef4444',
    fontSize: 14,
    background: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 16,
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  drawHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
    animation: 'fadeInUp 0.4s ease-out',
  },
  drawHeaderLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  typeBadge: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  drawTitle: {
    fontSize: 36,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.03em',
  },
  drawTime: {
    fontSize: 14,
    color: '#8E8EA0',
  },
  statusBadge: {
    padding: '8px 16px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
  },
  winnerCard: {
    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(244, 114, 182, 0.08))',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 32,
    animation: 'fadeInUp 0.5s ease-out',
  },
  winnerCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  winnerCardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#f59e0b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  winnerAddress: {
    fontSize: 16,
    fontWeight: 600,
    color: '#F0F0F5',
    fontFamily: "'JetBrains Mono', monospace",
    wordBreak: 'break-all' as const,
    marginBottom: 8,
  },
  winnerReward: {
    fontSize: 28,
    fontWeight: 800,
    color: '#22c55e',
    letterSpacing: '-0.02em',
  },
  verifySection: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 20,
    padding: 28,
    marginBottom: 24,
    animation: 'fadeInUp 0.6s ease-out',
  },
  verifySectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  verifySectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#F0F0F5',
  },
  verifyDescription: {
    fontSize: 14,
    color: '#8E8EA0',
    lineHeight: 1.6,
    marginBottom: 24,
  },
  verifyStep: {
    display: 'flex',
    gap: 16,
    padding: '20px 0',
    borderTop: '1px solid #2A2A38',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: colors.primaryAlpha(0.12),
    color: colors.primary,
    fontSize: 13,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepContent: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 15,
    fontWeight: 600,
    color: '#F0F0F5',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 13,
    color: '#8E8EA0',
    marginBottom: 10,
    lineHeight: 1.5,
  },
  hexRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#0F0F13',
    borderRadius: 10,
    padding: '10px 14px',
    marginBottom: 8,
  },
  hexValue: {
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    color: colors.primary,
    flex: 1,
    wordBreak: 'break-all' as const,
  },
  copyBtn: {
    background: 'transparent',
    border: 'none',
    color: '#8E8EA0',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pendingValue: {
    fontSize: 13,
    color: '#f59e0b',
    fontStyle: 'italic',
    padding: '8px 0',
  },
  verifyLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 500,
    color: '#38bdf8',
    textDecoration: 'none',
  },
  computationCard: {
    background: '#0F0F13',
    borderRadius: 14,
    padding: 20,
    marginTop: 20,
  },
  computationTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 14,
  },
  computationRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(47, 47, 47, 0.5)',
  },
  computationLabel: {
    fontSize: 13,
    color: '#8E8EA0',
  },
  computationValue: {
    fontSize: 13,
    fontWeight: 600,
    color: '#F0F0F5',
    fontFamily: "'JetBrains Mono', monospace",
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
    animation: 'fadeInUp 0.7s ease-out',
  },
  metaCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 14,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  metaLabel: {
    fontSize: 12,
    color: '#8E8EA0',
    fontWeight: 500,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: 600,
    color: '#F0F0F5',
  },
}
