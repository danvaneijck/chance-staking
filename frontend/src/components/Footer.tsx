import React from 'react'
import { Sparkles, Github, ExternalLink } from 'lucide-react'
import { CONTRACTS, NETWORK } from '../config'

const explorerBase = (NETWORK as string).includes('mainnet')
  ? 'https://explorer.injective.network'
  : 'https://testnet.explorer.injective.network'

export default function Footer() {
  return (
    <footer style={styles.footer}>
      <div className="section-container" style={styles.container}>
        <div className="footer-top" style={styles.top}>
          <div style={styles.brand}>
            <div style={styles.logoRow}>
              <Sparkles size={18} color="#8B6FFF" />
              <span style={styles.logoText}>Chance.Staking</span>
            </div>
            <p style={styles.brandDesc}>
              Gamified liquid staking on Injective. Your principal stays safe,
              your rewards become prizes.
            </p>
          </div>

          <div className="footer-links-grid" style={styles.linksGrid}>
            <div style={styles.linkCol}>
              <h4 style={styles.linkTitle}>Protocol</h4>
              <a href="#/stake" style={styles.link}>Stake</a>
              <a href="#/draws" style={styles.link}>Draws</a>
              <a href="#/how-it-works" style={styles.link}>How It Works</a>
              <a href="#/validators" style={styles.link}>Validators</a>
            </div>
            <div style={styles.linkCol}>
              <h4 style={styles.linkTitle}>Resources</h4>
              <a href="#/docs" style={styles.link}>Documentation</a>
              <a href="#/contracts" style={styles.link}>Smart Contracts</a>
              <a href="#/audit" style={styles.link}>Audit Report</a>
            </div>
            <div style={styles.linkCol}>
              <h4 style={styles.linkTitle}>Community</h4>
              {/* <a href="#" style={styles.link}>Discord</a>
              <a href="#" style={styles.link}>Twitter</a> */}
              <a href="https://github.com/danvaneijck/chance-staking" style={styles.link}>
                <Github size={12} style={{ marginRight: 4 }} />
                GitHub
              </a>
            </div>
          </div>
        </div>

        <div className="footer-bottom" style={styles.bottom}>
          <span style={styles.copyright}>
            2025 Chance.Staking. Built on Injective.
          </span>
          <div style={styles.bottomLinks}>
            <a href="#/terms" style={styles.bottomLink}>Terms</a>
            <a href="#/privacy" style={styles.bottomLink}>Privacy</a>
            <a href={`${explorerBase}/contract/${CONTRACTS.stakingHub}`} target="_blank" rel="noopener noreferrer" style={styles.bottomLink}>
              Injective Explorer <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

const styles: Record<string, React.CSSProperties> = {
  footer: {
    borderTop: '1px solid #2A2A38',
    padding: '56px 0 28px',
    marginTop: 60,
  },
  container: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
  },
  top: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 56,
    marginBottom: 40,
    flexWrap: 'wrap' as const,
  },
  brand: {
    maxWidth: 280,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  logoText: {
    fontSize: 17,
    fontWeight: 800,
    color: '#F0F0F5',
  },
  brandDesc: {
    fontSize: 13,
    lineHeight: 1.7,
    color: '#8E8EA0',
  },
  linksGrid: {
    display: 'flex',
    gap: 56,
  },
  linkCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 9,
  },
  linkTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#F0F0F5',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 4,
  },
  link: {
    fontSize: 13,
    color: '#8E8EA0',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s',
  },
  bottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    borderTop: '1px solid #2A2A38',
    flexWrap: 'wrap' as const,
    gap: 16,
  },
  copyright: {
    fontSize: 12,
    color: '#525260',
  },
  bottomLinks: {
    display: 'flex',
    gap: 20,
  },
  bottomLink: {
    fontSize: 12,
    color: '#525260',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    transition: 'color 0.2s',
  },
}
