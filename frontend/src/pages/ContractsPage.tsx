import React, { useState, useEffect } from 'react'
import {
  Layers, Trophy, Zap, Copy, Check, ExternalLink,
  Play, Loader, Shield, Code, AlertCircle, User,
  Clock, CheckCircle, XCircle, ArrowUpRight,
  type LucideIcon,
} from 'lucide-react'
import { CONTRACTS, INJ_DECIMALS } from '../config'
import {
  fetchStakingHubConfig,
  fetchExchangeRate,
  fetchEpochState,
  fetchDistributorConfig,
  fetchDrawState,
  fetchPoolBalances,
  fetchOracleConfig,
  fetchLatestRound,
  fetchInjBalance,
  fetchAccountTransactions,
} from '../services/contracts'

const EXPLORER_BASE = 'https://testnet.explorer.injective.network'

interface QueryDef {
  key: string
  label: string
  fn: () => Promise<any>
}

interface ContractDef {
  key: string
  name: string
  description: string
  address: string
  icon: LucideIcon
  color: string
  queries: QueryDef[]
}

const contractCards: ContractDef[] = [
  {
    key: 'stakingHub',
    name: 'Staking Hub',
    description: 'Manages INJ staking, csINJ minting/burning via Token Factory, epoch advancement, and reward distribution to prize pools.',
    address: CONTRACTS.stakingHub,
    icon: Layers,
    color: '#8B6FFF',
    queries: [
      { key: 'sh-config', label: 'Config', fn: fetchStakingHubConfig },
      { key: 'sh-exchange', label: 'Exchange Rate', fn: fetchExchangeRate },
      { key: 'sh-epoch', label: 'Epoch State', fn: fetchEpochState },
    ],
  },
  {
    key: 'rewardDistributor',
    name: 'Reward Distributor',
    description: 'Prize draw commit-reveal lifecycle, merkle-proof winner verification, and reward payouts.',
    address: CONTRACTS.rewardDistributor,
    icon: Trophy,
    color: '#f472b6',
    queries: [
      { key: 'rd-config', label: 'Config', fn: fetchDistributorConfig },
      { key: 'rd-draw-state', label: 'Draw State', fn: fetchDrawState },
      { key: 'rd-pools', label: 'Pool Balances', fn: fetchPoolBalances },
    ],
  },
  {
    key: 'drandOracle',
    name: 'drand Oracle',
    description: 'Stores and verifies drand quicknet BLS beacons for publicly verifiable randomness.',
    address: CONTRACTS.drandOracle,
    icon: Zap,
    color: '#38bdf8',
    queries: [
      { key: 'do-config', label: 'Config', fn: fetchOracleConfig },
      { key: 'do-latest', label: 'Latest Round', fn: fetchLatestRound },
    ],
  },
]

interface QueryResult {
  loading: boolean
  data: any | null
  error: string | null
}

interface OperatorData {
  address: string | null
  balance: string | null
  transactions: any[] | null
  loading: boolean
  error: string | null
}

function formatInj(raw: string): string {
  const num = parseFloat(raw) / Math.pow(10, INJ_DECIMALS)
  return num.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash
  return hash.slice(0, 10) + '...' + hash.slice(-6)
}

function timeAgo(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime()
  if (ms < 0) return 'just now'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function extractMsgType(messages: any[]): string {
  if (!messages || messages.length === 0) return 'Unknown'
  const msg = messages[0]
  // For MsgExecuteContract, extract the first key from the inner msg object
  const innerMsg = msg?.value?.msg
  if (innerMsg && typeof innerMsg === 'object') {
    const key = Object.keys(innerMsg)[0]
    if (key) return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
  // Fallback to the outer message type
  const type = msg?.type || msg?.['@type'] || ''
  const short = type.split(/[./]/).pop() || type
  return short.replace(/^Msg/, '').replace(/([A-Z])/g, ' $1').trim()
}

export default function ContractsPage() {
  const [results, setResults] = useState<Record<string, QueryResult>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [operator, setOperator] = useState<OperatorData>({
    address: null, balance: null, transactions: null, loading: true, error: null,
  })

  // Load operator data on mount
  useEffect(() => {
    (async () => {
      try {
        const config = await fetchStakingHubConfig()
        const operatorAddr = config.operator
        const [balance, txResult] = await Promise.all([
          fetchInjBalance(operatorAddr).catch(() => '0'),
          fetchAccountTransactions(operatorAddr, 15).catch(() => null),
        ])
        const txs = txResult && 'txs' in txResult ? txResult.txs : []
        setOperator({
          address: operatorAddr,
          balance,
          transactions: txs,
          loading: false,
          error: null,
        })
      } catch (err: any) {
        setOperator(prev => ({
          ...prev,
          loading: false,
          error: err?.message || 'Failed to load operator data',
        }))
      }
    })()
  }, [])

  const runQuery = async (queryKey: string, fn: () => Promise<any>) => {
    setResults(prev => ({ ...prev, [queryKey]: { loading: true, data: null, error: null } }))
    try {
      const data = await fn()
      setResults(prev => ({ ...prev, [queryKey]: { loading: false, data, error: null } }))
    } catch (err: any) {
      setResults(prev => ({
        ...prev,
        [queryKey]: { loading: false, data: null, error: err?.message || 'Query failed' },
      }))
    }
  }

  const copyAddress = (key: string, address: string) => {
    navigator.clipboard.writeText(address)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }


  return (
    <div style={styles.page}>
      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroContainer}>
          <h1 style={styles.heroTitle}>Smart Contracts</h1>
          <p style={styles.heroSubtitle}>
            Explore and query the Chance.Staking protocol contracts on Injective testnet
          </p>

          <div className="contracts-stats" style={styles.statsRow}>
            <div style={styles.statCard}>
              <Code size={16} color="#8B6FFF" />
              <div>
                <div style={styles.statValue}>3</div>
                <div style={styles.statLabel}>Contracts</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <Shield size={16} color="#22c55e" />
              <div>
                <div style={styles.statValue}>Audited</div>
                <div style={styles.statLabel}>Security</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <Zap size={16} color="#38bdf8" />
              <div>
                <div style={styles.statValue}>Testnet</div>
                <div style={styles.statLabel}>Network</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Operator Section */}
      <section style={styles.operatorSection}>
        <div style={styles.container}>
          <div style={styles.contractCard}>
            <div style={styles.cardHeader}>
              <div style={{ ...styles.cardIcon, background: 'rgba(245, 158, 11, 0.12)' }}>
                <User size={22} color="#f59e0b" />
              </div>
              <div>
                <h2 style={styles.cardTitle}>Protocol Operator</h2>
                <p style={styles.cardDesc}>
                  The operator manages epoch advancement, snapshot submission, and draw lifecycle operations.
                </p>
              </div>
            </div>

            {operator.loading ? (
              <div style={styles.operatorLoading}>
                <Loader size={16} color="#8E8EA0" className="animate-spin" />
                <span style={{ fontSize: 13, color: '#8E8EA0' }}>Loading operator data...</span>
              </div>
            ) : operator.error ? (
              <div style={styles.operatorError}>
                <AlertCircle size={14} color="#ef4444" />
                <span>{operator.error}</span>
              </div>
            ) : (
              <>
                {/* Address + Balance */}
                <div style={styles.addressSection}>
                  <div style={styles.operatorMeta}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.addressLabel}>Operator Address</div>
                      <div style={styles.addressRow}>
                        <code style={styles.addressText}>{operator.address}</code>
                        <button
                          onClick={() => copyAddress('operator', operator.address!)}
                          style={styles.iconBtn}
                          title="Copy address"
                        >
                          {copiedKey === 'operator' ? (
                            <Check size={14} color="#22c55e" />
                          ) : (
                            <Copy size={14} color="#8E8EA0" />
                          )}
                        </button>
                        <a
                          href={`${EXPLORER_BASE}/account/${operator.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={styles.explorerBtn}
                        >
                          <ExternalLink size={13} />
                          <span>Explorer</span>
                        </a>
                      </div>
                    </div>
                    <div style={styles.balanceCard}>
                      <div style={styles.balanceLabel}>INJ Balance</div>
                      <div style={styles.balanceValue}>
                        {operator.balance ? formatInj(operator.balance) : '0'} INJ
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Transactions */}
                <div>
                  <div style={styles.queryLabel}>Recent Transactions</div>
                  {operator.transactions && operator.transactions.length > 0 ? (
                    <div style={styles.txList}>
                      {operator.transactions.map((tx: any, i: number) => {
                        const hash = tx.hash || tx.txHash || ''
                        const success = tx.code === 0 || tx.code === undefined
                        const msgType = extractMsgType(tx.messages || [])
                        const timestamp = tx.blockTimestamp || tx.timestamp || ''
                        return (
                          <a
                            key={i}
                            href={`${EXPLORER_BASE}/transaction/${hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={styles.txRow}
                          >
                            <div style={styles.txLeft}>
                              {success ? (
                                <CheckCircle size={14} color="#22c55e" />
                              ) : (
                                <XCircle size={14} color="#ef4444" />
                              )}
                              <code style={styles.txHash}>{truncateHash(hash)}</code>
                              <span style={styles.txType}>{msgType}</span>
                            </div>
                            <div style={styles.txRight}>
                              {timestamp && (
                                <span style={styles.txTime}>
                                  <Clock size={11} />
                                  {timeAgo(timestamp)}
                                </span>
                              )}
                              <ArrowUpRight size={12} color="#525260" />
                            </div>
                          </a>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={styles.noTxs}>No recent transactions found</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Contract Cards */}
      <section style={styles.content}>
        <div style={styles.container}>
          {contractCards.map((contract) => {
            const Icon = contract.icon
            return (
              <div key={contract.key} style={styles.contractCard}>
                {/* Header */}
                <div style={styles.cardHeader}>
                  <div style={{ ...styles.cardIcon, background: `${contract.color}18` }}>
                    <Icon size={22} color={contract.color} />
                  </div>
                  <div>
                    <h2 style={styles.cardTitle}>{contract.name}</h2>
                    <p style={styles.cardDesc}>{contract.description}</p>
                  </div>
                </div>

                {/* Address */}
                <div style={styles.addressSection}>
                  <div style={styles.addressLabel}>Contract Address</div>
                  <div style={styles.addressRow}>
                    <code style={styles.addressText}>{contract.address}</code>
                    <button
                      onClick={() => copyAddress(contract.key, contract.address)}
                      style={styles.iconBtn}
                      title="Copy address"
                    >
                      {copiedKey === contract.key ? (
                        <Check size={14} color="#22c55e" />
                      ) : (
                        <Copy size={14} color="#8E8EA0" />
                      )}
                    </button>
                    <a
                      href={`${EXPLORER_BASE}/contract/${contract.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.explorerBtn}
                    >
                      <ExternalLink size={13} />
                      <span>Explorer</span>
                    </a>
                  </div>
                </div>

                {/* Queries */}
                <div style={styles.querySection}>
                  <div style={styles.queryLabel}>Queries</div>
                  <div className="contracts-query-buttons" style={styles.queryButtons}>
                    {contract.queries.map((q) => {
                      const result = results[q.key]
                      const isLoading = result?.loading
                      return (
                        <button
                          key={q.key}
                          onClick={() => runQuery(q.key, q.fn)}
                          disabled={isLoading}
                          style={{
                            ...styles.queryBtn,
                            borderColor: result?.data
                              ? 'rgba(34, 197, 94, 0.3)'
                              : result?.error
                                ? 'rgba(239, 68, 68, 0.3)'
                                : '#2A2A38',
                          }}
                        >
                          {isLoading ? (
                            <Loader size={13} color="#8E8EA0" className="animate-spin" />
                          ) : (
                            <Play size={13} color={contract.color} />
                          )}
                          {q.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Results */}
                  {contract.queries.map((q) => {
                    const result = results[q.key]
                    if (!result || result.loading) return null
                    return (
                      <div key={`result-${q.key}`} style={styles.resultContainer}>
                        <div style={styles.resultHeader}>
                          <span style={styles.resultLabel}>{q.label}</span>
                          {result.error ? (
                            <span style={styles.resultError}>
                              <AlertCircle size={12} /> Error
                            </span>
                          ) : (
                            <span style={styles.resultSuccess}>
                              <Check size={12} /> Success
                            </span>
                          )}
                        </div>
                        <div style={styles.resultBody}>
                          {result.error ? (
                            <div style={styles.errorText}>{result.error}</div>
                          ) : (
                            <pre style={styles.resultPre}>
                              <code style={styles.resultCode}>
                                {JSON.stringify(result.data, null, 2)}
                              </code>
                            </pre>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    paddingTop: 64,
  },

  // Hero
  hero: {
    padding: '56px 0 0',
    background: 'linear-gradient(180deg, rgba(139, 111, 255, 0.04) 0%, transparent 100%)',
  },
  heroContainer: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '0 24px',
    textAlign: 'center',
  },
  heroTitle: {
    fontSize: 46,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.03em',
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#8E8EA0',
    lineHeight: 1.7,
    marginBottom: 32,
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 0,
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
    fontSize: 16,
    fontWeight: 800,
    color: '#F0F0F5',
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8EA0',
    fontWeight: 500,
  },

  // Content
  content: {
    padding: '40px 0 80px',
  },
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '0 24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 24,
  },

  // Contract card
  contractCard: {
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 16,
    padding: 28,
  },

  // Card header
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 24,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: '#F0F0F5',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#8E8EA0',
    lineHeight: 1.6,
  },

  // Address section
  addressSection: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottom: '1px solid #2A2A38',
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#8E8EA0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 8,
  },
  addressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  addressText: {
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#F0F0F5',
    background: '#0F0F13',
    padding: '8px 14px',
    borderRadius: 8,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 8,
    border: '1px solid #2A2A38',
    background: 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'border-color 0.2s',
  },
  explorerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #2A2A38',
    background: 'transparent',
    color: '#8E8EA0',
    fontSize: 12,
    fontWeight: 600,
    textDecoration: 'none',
    flexShrink: 0,
    transition: 'color 0.2s, border-color 0.2s',
  },

  // Query section
  querySection: {},
  queryLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#8E8EA0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 10,
  },
  queryButtons: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
    marginBottom: 16,
  },
  queryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '9px 16px',
    borderRadius: 9,
    border: '1px solid #2A2A38',
    background: '#0F0F13',
    color: '#F0F0F5',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // Result
  resultContainer: {
    marginBottom: 12,
    borderRadius: 10,
    border: '1px solid #2A2A38',
    overflow: 'hidden',
  },
  resultHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    background: '#252530',
    borderBottom: '1px solid #2A2A38',
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#F0F0F5',
  },
  resultSuccess: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: '#22c55e',
  },
  resultError: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: '#ef4444',
  },
  resultBody: {
    padding: '12px 14px',
    background: '#0F0F13',
    maxHeight: 400,
    overflow: 'auto',
  },
  resultPre: {
    margin: 0,
  },
  resultCode: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#38bdf8',
    lineHeight: 1.6,
    whiteSpace: 'pre' as const,
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    fontFamily: "'JetBrains Mono', monospace",
  },

  // Operator section
  operatorSection: {
    padding: '40px 0 0',
  },
  operatorLoading: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 0',
  },
  operatorError: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#ef4444',
    padding: '12px 0',
  },
  operatorMeta: {
    display: 'flex',
    gap: 20,
    alignItems: 'flex-end',
    flexWrap: 'wrap' as const,
  },
  balanceCard: {
    background: '#0F0F13',
    borderRadius: 10,
    padding: '10px 18px',
    flexShrink: 0,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#8E8EA0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: 800,
    color: '#F0F0F5',
    fontFamily: "'JetBrains Mono', monospace",
  },

  // Transaction list
  txList: {
    borderRadius: 10,
    border: '1px solid #2A2A38',
    overflow: 'hidden',
  },
  txRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid #1A1A22',
    background: '#0F0F13',
    textDecoration: 'none',
    transition: 'background 0.15s',
    gap: 12,
  },
  txLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  txHash: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#38bdf8',
  },
  txType: {
    fontSize: 12,
    color: '#8E8EA0',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  txRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  txTime: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: '#525260',
    whiteSpace: 'nowrap' as const,
  },
  noTxs: {
    fontSize: 13,
    color: '#525260',
    padding: '16px 0',
  },
}
