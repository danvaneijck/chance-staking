import React, { useState } from 'react'
import { ArrowDownUp, TrendingUp, Clock, Shield, Loader } from 'lucide-react'
import { useStore } from '../store/useStore'
import { INJ_DECIMALS } from '../config'
import { formatInjString, formatNumber } from '../utils/formatNumber'

function toRawAmount(human: string): string {
  const n = parseFloat(human)
  if (isNaN(n) || n <= 0) return '0'
  return (BigInt(Math.floor(n * 10 ** 6)) * BigInt(10 ** (INJ_DECIMALS - 6))).toString()
}

export default function StakingPanel() {
  const {
    isConnected,
    exchangeRate,
    injBalance,
    csinjBalance,
    isLoading,
    error,
    stake: doStake,
    unstake: doUnstake,
  } = useStore()

  const [mode, setMode] = useState<'stake' | 'unstake'>('stake')
  const [amount, setAmount] = useState('')
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')

  const rate = parseFloat(exchangeRate) || 1
  const outputAmount = amount
    ? formatNumber(mode === 'stake' ? parseFloat(amount) / rate : parseFloat(amount) * rate, 4)
    : '0'

  const balance = mode === 'stake' ? injBalance : csinjBalance
  const formattedBalance = formatInjString(balance)

  const handleMax = () => {
    setAmount(formattedBalance)
  }

  const handleAction = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    setTxStatus('pending')
    try {
      const raw = toRawAmount(amount)
      if (mode === 'stake') {
        await doStake(raw)
      } else {
        await doUnstake(raw)
      }
      setTxStatus('success')
      setAmount('')
      setTimeout(() => setTxStatus('idle'), 3000)
    } catch {
      setTxStatus('error')
      setTimeout(() => setTxStatus('idle'), 4000)
    }
  }

  const buttonLabel = () => {
    if (!isConnected) return 'Connect Wallet'
    if (txStatus === 'pending' || isLoading) return 'Broadcasting...'
    if (txStatus === 'success') return 'Success!'
    if (txStatus === 'error') return 'Failed - Try Again'
    return mode === 'stake' ? 'Stake INJ' : 'Unstake csINJ'
  }

  return (
    <section id="stake" className="staking-section" style={styles.section}>
      <div className="section-container" style={styles.container}>
        <div className="staking-grid" style={styles.grid}>
          {/* Staking Card */}
          <div style={styles.stakingCard}>
            <div style={styles.cardHeader}>
              <div style={styles.tabRow}>
                <button
                  style={{
                    ...styles.tab,
                    ...(mode === 'stake' ? styles.tabActive : {}),
                  }}
                  onClick={() => { setMode('stake'); setAmount('') }}
                >
                  Stake
                </button>
                <button
                  style={{
                    ...styles.tab,
                    ...(mode === 'unstake' ? styles.tabActive : {}),
                  }}
                  onClick={() => { setMode('unstake'); setAmount('') }}
                >
                  Unstake
                </button>
              </div>
            </div>

            <div style={styles.cardBody}>
              {/* Input */}
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>
                  {mode === 'stake' ? 'You stake' : 'You unstake'}
                </label>
                <div style={styles.inputRow}>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={styles.amountInput}
                  />
                  <div style={styles.tokenBadge}>
                    <span style={styles.tokenName}>
                      {mode === 'stake' ? 'INJ' : 'csINJ'}
                    </span>
                  </div>
                </div>
                <div style={styles.balanceRow}>
                  <span style={styles.balanceText}>Balance: {formattedBalance}</span>
                  <button style={styles.maxButton} onClick={handleMax}>MAX</button>
                </div>
              </div>

              {/* Arrow */}
              <div style={styles.arrowContainer}>
                <div style={styles.arrowCircle}>
                  <ArrowDownUp size={15} color="#8B6FFF" />
                </div>
              </div>

              {/* Output */}
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>
                  {mode === 'stake' ? 'You receive' : 'You receive (after 21d)'}
                </label>
                <div style={styles.inputRow}>
                  <div style={styles.outputValue}>{outputAmount}</div>
                  <div style={styles.tokenBadge}>
                    <span style={styles.tokenName}>
                      {mode === 'stake' ? 'csINJ' : 'INJ'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Rate info */}
              <div style={styles.rateInfo}>
                <div style={styles.rateRow}>
                  <span style={styles.rateLabel}>Exchange Rate</span>
                  <span style={styles.rateValue}>1 csINJ = {formatNumber(rate, 4)} INJ</span>
                </div>
                <div style={styles.rateRow}>
                  <span style={styles.rateLabel}>
                    {mode === 'unstake' ? 'Unbonding Period' : 'Network Fee'}
                  </span>
                  <span style={styles.rateValue}>
                    {mode === 'unstake' ? '21 days' : '~0.001 INJ'}
                  </span>
                </div>
              </div>

              {/* Error display */}
              {error && txStatus === 'error' && (
                <div style={styles.errorBar}>
                  {error}
                </div>
              )}

              {/* CTA */}
              <button
                style={{
                  ...styles.actionButton,
                  opacity: isConnected && amount && txStatus !== 'pending' ? 1 : 0.5,
                  ...(txStatus === 'success' ? { background: 'linear-gradient(135deg, #22c55e, #16a34a)' } : {}),
                  ...(txStatus === 'error' ? { background: 'linear-gradient(135deg, #ef4444, #dc2626)' } : {}),
                }}
                disabled={!isConnected || !amount || txStatus === 'pending'}
                onClick={handleAction}
              >
                {txStatus === 'pending' && <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                {buttonLabel()}
              </button>
            </div>
          </div>

          {/* Info Cards */}
          <div style={styles.infoColumn}>
            <div
              style={styles.infoCard}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(34, 197, 94, 0.2)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#2A2A38' }}
            >
              <div style={styles.infoIconWrap}>
                <TrendingUp size={18} color="#22c55e" />
              </div>
              <h3 style={styles.infoTitle}>Base Yield</h3>
              <div style={styles.infoValue}>~5% APY</div>
              <p style={styles.infoDesc}>
                5% of staking rewards automatically increase the csINJ exchange rate.
                Your tokens appreciate in value over time.
              </p>
            </div>

            <div
              style={styles.infoCard}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(139, 111, 255, 0.2)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#2A2A38' }}
            >
              <div style={{ ...styles.infoIconWrap, background: 'rgba(139, 111, 255, 0.1)' }}>
                <Shield size={18} color="#8B6FFF" />
              </div>
              <h3 style={styles.infoTitle}>Prize Draws</h3>
              <div style={styles.infoValue}>70% Regular + 20% Big</div>
              <p style={styles.infoDesc}>
                95% of staking rewards fund prize pools. Daily draws weighted by balance,
                monthly jackpots with equal odds.
              </p>
            </div>

            <div
              style={styles.infoCard}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(56, 189, 248, 0.2)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#2A2A38' }}
            >
              <div style={{ ...styles.infoIconWrap, background: 'rgba(56, 189, 248, 0.1)' }}>
                <Clock size={18} color="#38bdf8" />
              </div>
              <h3 style={styles.infoTitle}>Verifiable Randomness</h3>
              <div style={styles.infoValue}>drand + Commit-Reveal</div>
              <p style={styles.infoDesc}>
                Winners selected using drand quicknet beacons with BLS verification.
                Fully transparent and tamper-proof.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    padding: '100px 0 80px',
    position: 'relative',
  },
  container: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 28,
    alignItems: 'start',
  },
  stakingCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 0 48px rgba(139, 111, 255, 0.04)',
  },
  cardHeader: {
    padding: '18px 20px 0',
  },
  tabRow: {
    display: 'flex',
    gap: 4,
    background: '#0F0F13',
    borderRadius: 12,
    padding: 3,
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
  },
  tabActive: {
    background: '#252530',
    color: '#F0F0F5',
  },
  cardBody: {
    padding: 20,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },
  inputGroup: {
    background: '#0F0F13',
    borderRadius: 14,
    padding: 16,
    border: '1px solid transparent',
    transition: 'border-color 0.2s',
  },
  inputLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 500,
    color: '#8E8EA0',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  amountInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#F0F0F5',
    fontSize: 26,
    fontWeight: 700,
    outline: 'none',
    padding: 0,
    letterSpacing: '-0.02em',
  },
  outputValue: {
    flex: 1,
    fontSize: 26,
    fontWeight: 700,
    color: '#F0F0F5',
    letterSpacing: '-0.02em',
  },
  tokenBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    borderRadius: 10,
    background: '#1A1A22',
    border: '1px solid #2A2A38',
  },
  tokenName: {
    fontSize: 13,
    fontWeight: 700,
    color: '#F0F0F5',
  },
  balanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  balanceText: {
    fontSize: 12,
    color: '#8E8EA0',
  },
  maxButton: {
    fontSize: 10,
    fontWeight: 700,
    color: '#8B6FFF',
    background: 'rgba(139, 111, 255, 0.08)',
    border: 'none',
    borderRadius: 6,
    padding: '3px 8px',
    cursor: 'pointer',
    letterSpacing: '0.06em',
  },
  arrowContainer: {
    display: 'flex',
    justifyContent: 'center',
    margin: '-6px 0',
    position: 'relative' as const,
    zIndex: 2,
  },
  arrowCircle: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: '#1A1A22',
    border: '2px solid #2A2A38',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    padding: '10px 0',
  },
  rateRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rateLabel: {
    fontSize: 12,
    color: '#8E8EA0',
  },
  rateValue: {
    fontSize: 12,
    fontWeight: 600,
    color: '#F0F0F5',
  },
  errorBar: {
    padding: '10px 14px',
    borderRadius: 10,
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    fontSize: 13,
  },
  actionButton: {
    width: '100%',
    padding: '14px',
    borderRadius: 14,
    background: 'linear-gradient(135deg, #8B6FFF, #6B4FD6)',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s',
    boxShadow: '0 0 24px rgba(139, 111, 255, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  infoColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },
  infoCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 22,
    transition: 'all 0.3s',
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'rgba(34, 197, 94, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: 600,
    color: '#8B6FFF',
    marginBottom: 8,
  },
  infoDesc: {
    fontSize: 13,
    lineHeight: 1.6,
    color: '#8E8EA0',
  },
}
