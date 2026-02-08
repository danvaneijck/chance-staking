import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Header from './components/Header'
import HeroSection from './components/HeroSection'
import StakingPanel from './components/StakingPanel'
import PortfolioSection from './components/PortfolioSection'
import DrawsSection from './components/DrawsSection'
import HowItWorks from './components/HowItWorks'
import Footer from './components/Footer'

function App() {
  const isConnected = useStore((s) => s.isConnected)
  const walletType = useStore((s) => s.walletType)
  const connect = useStore((s) => s.connect)
  const fetchContractData = useStore((s) => s.fetchContractData)
  const fetchDraws = useStore((s) => s.fetchDraws)
  const fetchBalances = useStore((s) => s.fetchBalances)
  const fetchUserData = useStore((s) => s.fetchUserData)

  // On mount: fetch global contract data + draws
  useEffect(() => {
    fetchContractData()
    fetchDraws()
  }, [])

  // Reconnect persisted wallet session on mount
  useEffect(() => {
    if (isConnected && walletType) {
      connect(walletType)
    }
  }, [])

  // When wallet connects: fetch user-specific data
  useEffect(() => {
    if (isConnected) {
      fetchBalances()
      fetchUserData()
    }
  }, [isConnected])

  // Poll for fresh data every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchContractData()
      fetchDraws()
      if (isConnected) {
        fetchBalances()
        fetchUserData()
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [isConnected])

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />

      <main>
        <HeroSection />
        <StakingPanel />
        {isConnected && <PortfolioSection />}
        <DrawsSection />
        <HowItWorks />
      </main>

      <Footer />
    </div>
  )
}

export default App
