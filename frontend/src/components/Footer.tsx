import React from 'react'
import { Sparkles, Github, ExternalLink } from 'lucide-react'

export default function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.container}>
        <div style={styles.top}>
          <div style={styles.brand}>
            <div style={styles.logoRow}>
              <Sparkles size={20} color="#9E7FFF" />
              <span style={styles.logoText}>Chance.Staking</span>
            </div>
            <p style={styles.brandDesc}>
              Gamified liquid staking on Injective. Your principal stays safe,
              your rewards become prizes.
            </p>
          </div>

          <div style={styles.linksGrid}>
            <div style={styles.linkCol}>
              <h4 style={styles.linkTitle}>Protocol</h4>
              <a href="#stake" style={styles.link}>Stake</a>
              <a href="#draws" style={styles.link}>Draws</a>
              <a href="#stats" style={styles.link}>Statistics</a>
              <a href="#" style={styles.link}>Governance</a>
            </div>
            <div style={styles.linkCol}>
              <h4 style={styles.linkTitle}>Resources</h4>
              <a href="#" style={styles.link}>Documentation</a>
              <a href="#" style={styles.link}>Smart Contracts</a>
              <a href="#" style={styles.link}>Audit Report</a>
              <a href="#" style={styles.link}>Bug Bounty</a>
            </div>
            <div style={styles.linkCol}>
              <h4 style={styles.linkTitle}>Community</h4>
              <a href="#" style={styles.link}>Discord</a>
              <a href="#" style={styles.link}>Twitter</a>
              <a href="#" style={styles.link}>Telegram</a>
              <a href="#" style={styles.link}>
                <Github size={12} style={{ marginRight: 4 }} />
                GitHub
              </a>
            </div>
          </div>
        </div>

        <div style={styles.bottom}>
          <span style={styles.copyright}>
            © 2025 Chance.Staking. Built on Injective.
          </span>
          <div style={styles.bottomLinks}>
            <a href="#" style={styles.bottomLink}>Terms</a>
            <a href="#" style={styles.bottomLink}>Privacy</a>
            <a href="#" style={styles.bottomLink}>
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
    borderTop: '1px solid #2F2F2F',
    padding: '64px 0 32px',
    marginTop: 80,
  },
  container: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
  },
  top: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 64,
    marginBottom: 48,
    flexWrap: 'wrap' as const,
  },
  brand: {
    maxWidth: 300,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  logoText: {
    fontSize: 18,
    fontWeight: 800,
    color: '#FFFFFF',
  },
  brandDesc: {
    fontSize: 13,
    lineHeight: 1.7,
    color: '#A3A3A3',
  },
  linksGrid: {
    display: 'flex',
    gap: 64,
  },
  linkCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  linkTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#FFFFFF',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 4,
  },
  link: {
    fontSize: 13,
    color: '#A3A3A3',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s',
  },
  bottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 24,
    borderTop: '1px solid #2F2F2F',
    flexWrap: 'wrap' as const,
    gap: 16,
  },
  copyright: {
    fontSize: 12,
    color: '#A3A3A3',
  },
  bottomLinks: {
    display: 'flex',
    gap: 24,
  },
  bottomLink: {
    fontSize: 12,
    color: '#A3A3A3',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
}
