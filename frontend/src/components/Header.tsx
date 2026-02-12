import React, { useState, useEffect, useRef } from 'react'
import { Sparkles, ChevronDown, Wallet, LogOut, Copy, Check, Menu, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { WalletType } from '../store/useStore'

export default function Header() {
  const { isConnected, address, injectiveAddress, walletType, isConnecting, connect, disconnect } = useStore()
  const [showWalletMenu, setShowWalletMenu] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && mobileMenuOpen) {
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [mobileMenuOpen])

  const wallets: { id: WalletType; name: string; icon: string }[] = [
    { id: 'keplr', name: 'Keplr', icon: '🔑' },
    { id: 'leap', name: 'Leap', icon: '🦘' },
    { id: 'metamask', name: 'MetaMask', icon: '🦊' },
    { id: 'rabby', name: 'Rabby', icon: '🐰' },
  ]

  const handleNavClick = () => {
    setMobileMenuOpen(false)
  }

  return (
    <>
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

          {/* Desktop nav */}
          <nav className="header-nav header-nav-desktop" style={styles.nav}>
            <a href="#stake" style={styles.navLink}>Stake</a>
            <a href="#draws" style={styles.navLink}>Draws</a>
            <a href="#how-it-works" style={styles.navLink}>How It Works</a>
            {isConnected && <a href="#portfolio" style={styles.navLink}>Portfolio</a>}
          </nav>

          {/* Desktop wallet section */}
          <div className="header-wallet-desktop" style={styles.walletSection}>
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

          {/* Mobile burger button */}
          <button
            className="header-burger"
            style={styles.burgerButton}
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Mobile slide-out overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-nav-overlay"
          style={styles.mobileOverlay}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile slide-out drawer */}
      <div
        className="mobile-nav-drawer"
        style={{
          ...styles.mobileDrawer,
          transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <div style={styles.mobileDrawerHeader}>
          <div style={styles.logoSection}>
            <div style={styles.logoIcon}>
              <Sparkles size={20} color="#8B6FFF" />
            </div>
            <div style={styles.logoText}>
              <span style={{ ...styles.logoName, fontSize: 18 }}>Chance</span>
              <span style={{ ...styles.logoDot, fontSize: 18 }}>.</span>
              <span style={{ ...styles.logoSuffix, fontSize: 18 }}>Staking</span>
            </div>
          </div>
          <button
            style={styles.closeButton}
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        </div>

        <nav style={styles.mobileNav}>
          <a href="#stake" style={styles.mobileNavLink} onClick={handleNavClick}>
            Stake
          </a>
          <a href="#draws" style={styles.mobileNavLink} onClick={handleNavClick}>
            Draws
          </a>
          <a href="#how-it-works" style={styles.mobileNavLink} onClick={handleNavClick}>
            How It Works
          </a>
          {isConnected && (
            <a href="#portfolio" style={styles.mobileNavLink} onClick={handleNavClick}>
              Portfolio
            </a>
          )}
        </nav>

        <div style={styles.mobileDrawerDivider} />

        {/* Mobile wallet section */}
        <div style={styles.mobileWalletSection}>
          {!isConnected ? (
            <>
              <span style={styles.mobileWalletLabel}>Connect Wallet</span>
              <div style={styles.mobileWalletGrid}>
                {wallets.map((w) => (
                  <button
                    key={w.id}
                    style={styles.mobileWalletOption}
                    onClick={() => {
                      connect(w.id)
                      setMobileMenuOpen(false)
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{w.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#F0F0F5' }}>{w.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={styles.mobileAccountCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={styles.accountDot} />
                  <span style={{ fontSize: 12, color: '#8E8EA0', textTransform: 'capitalize' as const }}>
                    Connected via {walletType}
                  </span>
                </div>
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#F0F0F5',
                  fontFamily: "'JetBrains Mono', monospace",
                  wordBreak: 'break-all' as const,
                }}>
                  {injectiveAddress || address}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  style={styles.mobileActionButton}
                  onClick={() => {
                    copyAddress()
                  }}
                >
                  {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  style={{ ...styles.mobileActionButton, borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                  onClick={() => {
                    disconnect()
                    setMobileMenuOpen(false)
                  }}
                >
                  <LogOut size={14} />
                  <span>Disconnect</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
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

  // Burger button (hidden on desktop via CSS)
  burgerButton: {
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'transparent',
    border: '1px solid #2A2A38',
    color: '#F0F0F5',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },

  // Mobile overlay
  mobileOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    zIndex: 150,
    backdropFilter: 'blur(4px)',
    animation: 'fadeIn 0.2s ease-out',
  },

  // Mobile drawer
  mobileDrawer: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: 300,
    maxWidth: 'calc(100vw - 48px)',
    background: '#13131a',
    borderLeft: '1px solid #2A2A38',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column' as const,
    transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
    overflowY: 'auto' as const,
  },

  mobileDrawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(42, 42, 56, 0.5)',
  },

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'transparent',
    border: '1px solid #2A2A38',
    color: '#8E8EA0',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  mobileNav: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '16px 12px',
    gap: 2,
  },

  mobileNavLink: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 500,
    color: '#C8C8D4',
    textDecoration: 'none',
    transition: 'all 0.15s',
  },

  mobileDrawerDivider: {
    height: 1,
    background: 'rgba(42, 42, 56, 0.5)',
    margin: '4px 20px',
  },

  mobileWalletSection: {
    padding: '16px 20px',
  },

  mobileWalletLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#8E8EA0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 12,
  },

  mobileWalletGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },

  mobileWalletOption: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
    padding: '16px 8px',
    borderRadius: 12,
    background: '#1A1A22',
    border: '1px solid #2A2A38',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  mobileAccountCard: {
    padding: '14px 16px',
    borderRadius: 12,
    background: '#1A1A22',
    border: '1px solid #2A2A38',
  },

  mobileActionButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 12px',
    borderRadius: 10,
    background: 'transparent',
    border: '1px solid #2A2A38',
    color: '#8E8EA0',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
}
