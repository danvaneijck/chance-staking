import React, { useState, useEffect, useRef } from 'react'
import { Sparkles, ChevronDown, Wallet, LogOut, Copy, Check } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { WalletType } from '../store/useStore'

export default function Header() {
  const { isConnected, address, injectiveAddress, walletType, isConnecting, connect, disconnect } = useStore()
  const [showWalletMenu, setShowWalletMenu] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const walletRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)

  const truncateAddress = (addr: string) => {
    if (!addr) return ''
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(injectiveAddress || address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) setShowWalletMenu(false)
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setShowAccountMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const wallets: { id: WalletType; name: string; icon: string }[] = [
    { id: 'keplr', name: 'Keplr', icon: '🔑' },
    { id: 'leap', name: 'Leap', icon: '🦘' },
    { id: 'metamask', name: 'MetaMask', icon: '🦊' },
    { id: 'rabby', name: 'Rabby', icon: '🐰' },
  ]

  return (
    <header style={styles.header}>
      <div className="header-inner" style={styles.headerInner}>
        <a href="#" style={{ textDecoration: 'none' }}>
          <div style={styles.logoSection}>
            <div style={styles.logoIcon}>
              <Sparkles size={22} color="#8B6FFF" />
            </div>
            <div style={styles.logoText}>
              <span style={styles.logoName}>Chance</span>
              <span style={styles.logoDot}>.</span>
              <span style={styles.logoSuffix}>Staking</span>
            </div>
          </div>
        </a>

        <nav className="header-nav" style={styles.nav}>
          <a href="#stake" style={styles.navLink}>Stake</a>
          <a href="#draws" style={styles.navLink}>Draws</a>
          <a href="#how-it-works" style={styles.navLink}>How It Works</a>
          {isConnected && <a href="#portfolio" style={styles.navLink}>Portfolio</a>}
        </nav>

        <div style={styles.walletSection}>
          {!isConnected ? (
            <div ref={walletRef} style={{ position: 'relative' }}>
              <button
                style={styles.connectButton}
                onClick={() => setShowWalletMenu(!showWalletMenu)}
                disabled={isConnecting}
              >
                <Wallet size={16} />
                <span>{isConnecting ? 'Connecting...' : 'Connect'}</span>
              </button>
              {showWalletMenu && (
                <div style={styles.walletDropdown}>
                  {wallets.map((w) => (
                    <button
                      key={w.id}
                      style={styles.walletOption}
                      onClick={() => {
                        connect(w.id)
                        setShowWalletMenu(false)
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139, 111, 255, 0.08)'
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                      }}
                    >
                      <span style={styles.walletIcon}>{w.icon}</span>
                      <span>{w.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div ref={accountRef} style={{ position: 'relative' }}>
              <button
                style={styles.accountButton}
                onClick={() => setShowAccountMenu(!showAccountMenu)}
              >
                <div style={styles.accountDot} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                  {truncateAddress(injectiveAddress || address)}
                </span>
                <ChevronDown size={14} style={{
                  transition: 'transform 0.2s',
                  transform: showAccountMenu ? 'rotate(180deg)' : 'rotate(0)',
                }} />
              </button>
              {showAccountMenu && (
                <div style={styles.accountDropdown}>
                  <div style={styles.accountInfo}>
                    <span style={styles.accountLabel}>Connected via {walletType}</span>
                    <span style={styles.accountAddr}>
                      {truncateAddress(injectiveAddress || address)}
                    </span>
                  </div>
                  <button
                    style={styles.accountAction}
                    onClick={copyAddress}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139, 111, 255, 0.06)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                    <span>{copied ? 'Copied!' : 'Copy Address'}</span>
                  </button>
                  <button
                    style={{ ...styles.accountAction, color: '#ef4444' }}
                    onClick={() => {
                      disconnect()
                      setShowAccountMenu(false)
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.06)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <LogOut size={14} />
                    <span>Disconnect</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    background: 'rgba(15, 15, 19, 0.8)',
    backdropFilter: 'blur(24px)',
    borderBottom: '1px solid rgba(42, 42, 56, 0.5)',
  },
  headerInner: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'rgba(139, 111, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 0,
  },
  logoName: {
    fontSize: 20,
    fontWeight: 800,
    color: '#F0F0F5',
    letterSpacing: '-0.02em',
  },
  logoDot: {
    fontSize: 20,
    fontWeight: 800,
    color: '#8B6FFF',
  },
  logoSuffix: {
    fontSize: 20,
    fontWeight: 500,
    color: '#8E8EA0',
    letterSpacing: '-0.02em',
  },
  nav: {
    display: 'flex',
    gap: 28,
  },
  navLink: {
    fontSize: 13,
    fontWeight: 500,
    color: '#8E8EA0',
    textDecoration: 'none',
    transition: 'color 0.2s',
    letterSpacing: '0.01em',
  },
  walletSection: {
    position: 'relative' as const,
  },
  connectButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 20px',
    borderRadius: 10,
    background: 'linear-gradient(135deg, #8B6FFF, #6B4FD6)',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 0 20px rgba(139, 111, 255, 0.15)',
  },
  walletDropdown: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    right: 0,
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 14,
    padding: 6,
    minWidth: 200,
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
    zIndex: 200,
    animation: 'scaleIn 0.15s ease-out',
  },
  walletOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    background: 'transparent',
    color: '#F0F0F5',
    fontSize: 14,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  walletIcon: {
    fontSize: 18,
  },
  accountButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 14px',
    borderRadius: 10,
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    color: '#F0F0F5',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  accountDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#22c55e',
    boxShadow: '0 0 8px rgba(34, 197, 94, 0.4)',
  },
  accountDropdown: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    right: 0,
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    borderRadius: 14,
    padding: 6,
    minWidth: 240,
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
    zIndex: 200,
    animation: 'scaleIn 0.15s ease-out',
  },
  accountInfo: {
    padding: '12px 14px',
    borderBottom: '1px solid #2A2A38',
    marginBottom: 4,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  accountLabel: {
    fontSize: 11,
    color: '#8E8EA0',
    textTransform: 'capitalize' as const,
    letterSpacing: '0.02em',
  },
  accountAddr: {
    fontSize: 13,
    fontWeight: 600,
    color: '#F0F0F5',
    fontFamily: "'JetBrains Mono', monospace",
  },
  accountAction: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    background: 'transparent',
    color: '#8E8EA0',
    fontSize: 13,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
}
