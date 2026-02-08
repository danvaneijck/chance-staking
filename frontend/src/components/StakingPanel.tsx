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
    <section id="stake" style={styles.section}>
      <div style={styles.container}>
        <div style={styles.grid}>
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
                  <ArrowDownUp size={16} color="#9E7FFF" />
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
                  ...(txStatus === 'success' ? { background: 'linear-gradient(135deg, #10b981, #059669)' } : {}),
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
            <div style={styles.infoCard}>
              <div style={styles.infoIconWrap}>
                <TrendingUp size={20} color="#10b981" />
              </div>
              <h3 style={styles.infoTitle}>Base Yield</h3>
              <div style={styles.infoValue}>~5% APY</div>
              <p style={styles.infoDesc}>
                5% of staking rewards automatically increase the csINJ exchange rate.
                Your tokens appreciate in value over time.
              </p>
            </div>

            <div style={styles.infoCard}>
              <div style={{ ...styles.infoIconWrap, background: 'rgba(158, 127, 255, 0.12)' }}>
                <Shield size={20} color="#9E7FFF" />
              </div>
              <h3 style={styles.infoTitle}>Prize Draws</h3>
              <div style={styles.infoValue}>70% Regular + 20% Big</div>
              <p style={styles.infoDesc}>
                95% of staking rewards fund prize pools. Daily draws weighted by balance,
                monthly jackpots with equal odds.
              </p>
            </div>

            <div style={styles.infoCard}>
              <div style={{ ...styles.infoIconWrap, background: 'rgba(56, 189, 248, 0.12)' }}>
                <Clock size={20} color="#38bdf8" />
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
    padding: '120px 0 80px',
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
    gap: 32,
    alignItems: 'start',
  },
  stakingCard: {
    background: '#262626',
    border: '1px solid #2F2F2F',
    borderRadius: 24,
    overflow: 'hidden',
    boxShadow: '0 0 60px rgba(158, 127, 255, 0.06)',
  },
  cardHeader: {
    padding: '20px 24px 0',
  },
  tabRow: {
    display: 'flex',
    gap: 4,
    background: '#1a1a1a',
    borderRadius: 14,
    padding: 4,
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
  },
  tabActive: {
    background: '#2F2F2F',
    color: '#FFFFFF',
  },
  cardBody: {
    padding: 24,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  inputGroup: {
    background: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    border: '1px solid transparent',
    transition: 'border-color 0.2s',
  },
  inputLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: '#A3A3A3',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
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
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 700,
    outline: 'none',
    padding: 0,
    letterSpacing: '-0.02em',
  },
  outputValue: {
    flex: 1,
    fontSize: 28,
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-0.02em',
  },
  tokenBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 12,
    background: '#262626',
    border: '1px solid #2F2F2F',
  },
  tokenName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#FFFFFF',
  },
  balanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  balanceText: {
    fontSize: 12,
    color: '#A3A3A3',
  },
  maxButton: {
    fontSize: 11,
    fontWeight: 700,
    color: '#9E7FFF',
    background: 'rgba(158, 127, 255, 0.1)',
    border: 'none',
    borderRadius: 6,
    padding: '4px 8px',
    cursor: 'pointer',
    letterSpacing: '0.05em',
  },
  arrowContainer: {
    display: 'flex',
    justifyContent: 'center',
    margin: '-8px 0',
    position: 'relative' as const,
    zIndex: 2,
  },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#262626',
    border: '2px solid #2F2F2F',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    padding: '12px 0',
  },
  rateRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rateLabel: {
    fontSize: 13,
    color: '#A3A3A3',
  },
  rateValue: {
    fontSize: 13,
    fontWeight: 600,
    color: '#FFFFFF',
  },
  errorBar: {
    padding: '10px 14px',
    borderRadius: 12,
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    fontSize: 13,
  },
  actionButton: {
    width: '100%',
    padding: '16px',
    borderRadius: 16,
    background: 'linear-gradient(135deg, #9E7FFF, #7B5CE0)',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s',
    boxShadow: '0 0 30px rgba(158, 127, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  infoColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  infoCard: {
    background: '#262626',
    border: '1px solid #2F2F2F',
    borderRadius: 20,
    padding: 24,
    transition: 'all 0.3s',
  },
  infoIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'rgba(16, 185, 129, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 600,
    color: '#9E7FFF',
    marginBottom: 8,
  },
  infoDesc: {
    fontSize: 13,
    lineHeight: 1.6,
    color: '#A3A3A3',
  },
}
