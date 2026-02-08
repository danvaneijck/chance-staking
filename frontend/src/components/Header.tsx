import React, { useState } from 'react'
import { Sparkles, ChevronDown, Wallet, LogOut, Copy, Check } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { WalletType } from '../store/useStore'

export default function Header() {
  const { isConnected, address, injectiveAddress, walletType, isConnecting, connect, disconnect } = useStore()
  const [showWalletMenu, setShowWalletMenu] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [copied, setCopied] = useState(false)

  const truncateAddress = (addr: string) => {
    if (!addr) return ''
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(injectiveAddress || address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const wallets: { id: WalletType; name: string; icon: string }[] = [
    { id: 'keplr', name: 'Keplr', icon: '🔑' },
    { id: 'leap', name: 'Leap', icon: '🦘' },
    { id: 'metamask', name: 'MetaMask', icon: '🦊' },
    { id: 'rabby', name: 'Rabby', icon: '🐰' },
  ]

  return (
    <header style={styles.header}>
      <div style={styles.headerInner}>
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>
            <Sparkles size={24} color="#9E7FFF" />
          </div>
          <div style={styles.logoText}>
            <span style={styles.logoName}>Chance</span>
            <span style={styles.logoDot}>.</span>
            <span style={styles.logoSuffix}>Staking</span>
          </div>
        </div>

        <nav style={styles.nav}>
          <a href="#stake" style={styles.navLink}>Stake</a>
          <a href="#draws" style={styles.navLink}>Draws</a>
          {isConnected && <a href="#portfolio" style={styles.navLink}>Portfolio</a>}
        </nav>

        <div style={styles.walletSection}>
          {!isConnected ? (
            <div style={{ position: 'relative' }}>
              <button
                style={styles.connectButton}
                onClick={() => setShowWalletMenu(!showWalletMenu)}
                disabled={isConnecting}
              >
                <Wallet size={18} />
                <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
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
                    >
                      <span style={styles.walletIcon}>{w.icon}</span>
                      <span>{w.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <button
                style={styles.accountButton}
                onClick={() => setShowAccountMenu(!showAccountMenu)}
              >
                <div style={styles.accountDot} />
                <span>{truncateAddress(injectiveAddress || address)}</span>
                <ChevronDown size={14} />
              </button>
              {showAccountMenu && (
                <div style={styles.accountDropdown}>
                  <div style={styles.accountInfo}>
                    <span style={styles.accountLabel}>Connected via {walletType}</span>
                    <span style={styles.accountAddr}>
                      {truncateAddress(injectiveAddress || address)}
                    </span>
                  </div>
                  <button style={styles.accountAction} onClick={copyAddress}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copied ? 'Copied!' : 'Copy Address'}</span>
                  </button>
                  <button style={styles.accountAction} onClick={() => {
                    disconnect()
                    setShowAccountMenu(false)
                  }}>
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
    background: 'rgba(23, 23, 23, 0.85)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(47, 47, 47, 0.6)',
  },
  headerInner: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
    height: 72,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: 'rgba(158, 127, 255, 0.12)',
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
    fontSize: 22,
    fontWeight: 800,
    color: '#FFFFFF',
    letterSpacing: '-0.02em',
  },
  logoDot: {
    fontSize: 22,
    fontWeight: 800,
    color: '#9E7FFF',
  },
  logoSuffix: {
    fontSize: 22,
    fontWeight: 500,
    color: '#A3A3A3',
    letterSpacing: '-0.02em',
  },
  nav: {
    display: 'flex',
    gap: 32,
  },
  navLink: {
    fontSize: 14,
    fontWeight: 500,
    color: '#A3A3A3',
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
    padding: '10px 20px',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #9E7FFF, #7B5CE0)',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 0 20px rgba(158, 127, 255, 0.2)',
  },
  walletDropdown: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    right: 0,
    background: '#262626',
    border: '1px solid #2F2F2F',
    borderRadius: 16,
    padding: 8,
    minWidth: 200,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    zIndex: 200,
  },
  walletOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    background: 'transparent',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  walletIcon: {
    fontSize: 20,
  },
  accountButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderRadius: 12,
    background: '#262626',
    border: '1px solid #2F2F2F',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  accountDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#10b981',
  },
  accountDropdown: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    right: 0,
    background: '#262626',
    border: '1px solid #2F2F2F',
    borderRadius: 16,
    padding: 8,
    minWidth: 240,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    zIndex: 200,
  },
  accountInfo: {
    padding: '12px 16px',
    borderBottom: '1px solid #2F2F2F',
    marginBottom: 4,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  accountLabel: {
    fontSize: 12,
    color: '#A3A3A3',
    textTransform: 'capitalize' as const,
  },
  accountAddr: {
    fontSize: 13,
    fontWeight: 600,
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  accountAction: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 16px',
    borderRadius: 10,
    background: 'transparent',
    color: '#A3A3A3',
    fontSize: 13,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
}
