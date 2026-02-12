import React from 'react'
import { colors } from '../theme'

export default function TermsPage() {
  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.heroContainer}>
          <h1 style={styles.heroTitle}>Terms of Use</h1>
          <p style={styles.heroSubtitle}>Last updated: February 2025</p>
        </div>
      </section>

      <div style={styles.content}>
        <Section title="1. Acceptance of Terms">
          <P>
            By accessing or using the Chance.Staking protocol ("Protocol"), including the
            website, smart contracts, and any related services, you agree to be bound by these
            Terms of Use. If you do not agree, do not use the Protocol.
          </P>
        </Section>

        <Section title="2. Description of the Protocol">
          <P>
            Chance.Staking is a prize-linked staking protocol deployed on the Injective blockchain.
            Users stake INJ tokens, receive csINJ (a liquid staking token), and are entered into
            periodic prize draws funded by staking rewards. The Protocol consists of three smart
            contracts: Staking Hub, Reward Distributor, and drand Oracle.
          </P>
        </Section>

        <Section title="3. Eligibility">
          <P>
            You must be of legal age in your jurisdiction to use the Protocol. You are solely
            responsible for ensuring that your use of the Protocol complies with all applicable
            laws and regulations in your jurisdiction. The Protocol is not available to persons
            or entities subject to sanctions or located in jurisdictions where participation in
            decentralized finance protocols or prize-linked savings products is prohibited.
          </P>
        </Section>

        <Section title="4. No Financial Advice">
          <P>
            Nothing provided by the Protocol constitutes financial, investment, legal, or tax
            advice. You should consult your own advisors before making any financial decisions.
            Staking, unstaking, and participating in prize draws involve risks, including but not
            limited to smart contract risk, validator slashing, and market volatility.
          </P>
        </Section>

        <Section title="5. Smart Contract Risks">
          <P>
            The Protocol operates via smart contracts on the Injective blockchain. While the
            contracts have been audited, no audit eliminates all risk. Smart contracts may
            contain bugs, vulnerabilities, or behave unexpectedly. By using the Protocol, you
            acknowledge and accept these risks. You are responsible for your own due diligence.
          </P>
        </Section>

        <Section title="6. Staking and Unstaking">
          <P>
            When you stake INJ, you receive csINJ at the current exchange rate. Unstaking
            requires a 21-day unbonding period (determined by the Injective network). During
            the unbonding period, your INJ is locked and cannot be accessed. The exchange rate
            between csINJ and INJ may fluctuate based on staking rewards and validator
            performance.
          </P>
        </Section>

        <Section title="7. Prize Draws">
          <P>
            Prize draws are funded by staking rewards, not by user principal. Eligibility for
            draws requires holding csINJ for a minimum number of epochs. Re-staking resets
            your eligibility timer. The probability of winning is proportional to your csINJ
            holdings. Draw outcomes are determined by verifiable randomness from the drand
            network combined with an operator-committed secret.
          </P>
          <P>
            The operator may, under certain circumstances, allow a draw to expire rather than
            revealing it. Expired draws return funds to the prize pool and do not result in
            loss of user funds, but may affect the fairness of draw distribution.
          </P>
        </Section>

        <Section title="8. Fees">
          <P>
            The Protocol charges a protocol fee on staking rewards as configured in the smart
            contracts. This fee is deducted before rewards are distributed to prize pools and
            base yield. Fee parameters are visible on-chain and may be updated by the protocol
            administrator.
          </P>
        </Section>

        <Section title="9. No Warranties">
          <P>
            The Protocol is provided "as is" and "as available" without warranties of any kind,
            whether express or implied. We do not guarantee that the Protocol will be
            uninterrupted, error-free, or secure. We make no warranties regarding the accuracy,
            reliability, or completeness of any information provided through the Protocol.
          </P>
        </Section>

        <Section title="10. Limitation of Liability">
          <P>
            To the maximum extent permitted by law, the Protocol developers, operators, and
            contributors shall not be liable for any indirect, incidental, special,
            consequential, or punitive damages, or any loss of profits or revenues, whether
            incurred directly or indirectly, or any loss of data, use, goodwill, or other
            intangible losses resulting from your use of the Protocol.
          </P>
        </Section>

        <Section title="11. Indemnification">
          <P>
            You agree to indemnify and hold harmless the Protocol developers, operators, and
            contributors from any claims, damages, losses, liabilities, and expenses arising
            out of or related to your use of the Protocol or your violation of these Terms.
          </P>
        </Section>

        <Section title="12. Modifications">
          <P>
            We reserve the right to modify these Terms at any time. Changes will be reflected
            by updating the "Last updated" date. Continued use of the Protocol after changes
            constitutes acceptance of the modified Terms.
          </P>
        </Section>

        <Section title="13. Governing Law">
          <P>
            These Terms shall be governed by and construed in accordance with applicable law,
            without regard to conflict of law principles. Any disputes arising from these Terms
            or your use of the Protocol shall be resolved through binding arbitration.
          </P>
        </Section>

        <Section title="14. Contact">
          <P>
            For questions about these Terms, please reach out via our community channels or
            open an issue on our{' '}
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
    background: `linear-gradient(180deg, ${colors.primaryAlpha(0.04)} 0%, transparent 100%)`,
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
  link: {
    color: colors.primary,
    textDecoration: 'underline',
  },
}
