import React from 'react'

export default function PrivacyPage() {
  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.heroContainer}>
          <h1 style={styles.heroTitle}>Privacy Policy</h1>
          <p style={styles.heroSubtitle}>Last updated: February 2025</p>
        </div>
      </section>

      <div style={styles.content}>
        <Section title="1. Introduction">
          <P>
            This Privacy Policy describes how the Chance.Staking protocol ("Protocol") handles
            information when you use our website and interact with our smart contracts on the
            Injective blockchain. We are committed to transparency about our data practices.
          </P>
        </Section>

        <Section title="2. Information We Do Not Collect">
          <P>
            The Protocol is a decentralized application. We do not collect, store, or process:
          </P>
          <ul style={styles.list}>
            <li style={styles.listItem}>Personal identification information (name, email, phone number)</li>
            <li style={styles.listItem}>Account credentials or passwords</li>
            <li style={styles.listItem}>Private keys or seed phrases</li>
            <li style={styles.listItem}>Financial information beyond what is publicly visible on-chain</li>
          </ul>
        </Section>

        <Section title="3. Blockchain Data">
          <P>
            When you interact with the Protocol's smart contracts, your transactions are recorded
            on the Injective blockchain. This data is publicly accessible and includes:
          </P>
          <ul style={styles.list}>
            <li style={styles.listItem}>Your wallet address</li>
            <li style={styles.listItem}>Transaction amounts and timestamps</li>
            <li style={styles.listItem}>Staking and unstaking activity</li>
            <li style={styles.listItem}>Prize draw participation and results</li>
          </ul>
          <P>
            This on-chain data is inherent to blockchain technology and is not controlled by us.
            It is permanently recorded on the public blockchain and cannot be deleted or modified.
          </P>
        </Section>

        <Section title="4. Website Analytics">
          <P>
            Our website may use minimal, privacy-respecting analytics to understand general
            usage patterns (such as page views and visitor counts). We do not use invasive
            tracking technologies, fingerprinting, or cross-site tracking. No personal data
            is collected through analytics.
          </P>
        </Section>

        <Section title="5. Wallet Connection">
          <P>
            When you connect your wallet (e.g., MetaMask, Keplr) to the Protocol, the
            connection is handled entirely by your wallet provider. We only receive your
            public wallet address, which is necessary to interact with the smart contracts.
            We do not have access to your private keys or wallet credentials.
          </P>
        </Section>

        <Section title="6. Cookies and Local Storage">
          <P>
            The website may use local storage (browser storage) to remember your preferences
            such as wallet connection state. This data is stored locally on your device and
            is not transmitted to any server. You can clear this data at any time through
            your browser settings.
          </P>
        </Section>

        <Section title="7. Third-Party Services">
          <P>
            The Protocol may interact with third-party services including:
          </P>
          <ul style={styles.list}>
            <li style={styles.listItem}>
              <strong style={{ color: '#F0F0F5' }}>Injective blockchain nodes</strong> — for
              submitting and querying transactions
            </li>
            <li style={styles.listItem}>
              <strong style={{ color: '#F0F0F5' }}>drand network</strong> — for verifiable
              randomness used in prize draws
            </li>
            <li style={styles.listItem}>
              <strong style={{ color: '#F0F0F5' }}>Wallet providers</strong> — for signing
              transactions (MetaMask, Keplr, etc.)
            </li>
          </ul>
          <P>
            Each of these services has its own privacy policy. We encourage you to review
            their respective policies.
          </P>
        </Section>

        <Section title="8. Data Security">
          <P>
            Since the Protocol does not collect or store personal data on centralized servers,
            there is no centralized database to breach. All interactions occur directly between
            your browser/wallet and the Injective blockchain. Smart contract security is
            maintained through code audits and on-chain transparency.
          </P>
        </Section>

        <Section title="9. Children's Privacy">
          <P>
            The Protocol is not intended for use by individuals under the age of 18. We do not
            knowingly collect information from minors.
          </P>
        </Section>

        <Section title="10. Changes to This Policy">
          <P>
            We may update this Privacy Policy from time to time. Changes will be reflected by
            updating the "Last updated" date at the top of this page. We encourage you to
            review this policy periodically.
          </P>
        </Section>

        <Section title="11. Contact">
          <P>
            For questions about this Privacy Policy, please reach out via our community channels
            or open an issue on our{' '}
            <a
              href="https://github.com/danvaneijck/chance-staking"
              style={styles.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub repository
            </a>.
          </P>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={styles.paragraph}>{children}</p>
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    paddingTop: 64,
  },
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
    fontSize: 14,
    color: '#8E8EA0',
    marginBottom: 0,
  },
  content: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '40px 24px 80px',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 14,
    color: '#8E8EA0',
    lineHeight: 1.8,
    marginBottom: 12,
  },
  list: {
    margin: '0 0 12px 0',
    paddingLeft: 20,
  },
  listItem: {
    fontSize: 14,
    color: '#8E8EA0',
    lineHeight: 1.8,
    marginBottom: 4,
  },
  link: {
    color: '#8B6FFF',
    textDecoration: 'underline',
  },
}
