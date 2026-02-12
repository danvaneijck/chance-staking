import { useEffect, useState, useRef } from 'react'
import { useStore } from './store/useStore'
import { setMsgBroadcasterEndpoints } from './store/useStore'
import { useRpcStore } from './store/rpcStore'
import { setGrpcEndpoint } from './services/contracts'
import Header from './components/Header'
import HeroSection from './components/HeroSection'
import StakingPanel from './components/StakingPanel'
import PortfolioSection from './components/PortfolioSection'
import DrawsSection from './components/DrawsSection'
import DrawDetail from './components/DrawDetail'
import RewardsCalculator from './components/RewardsCalculator'
import HowItWorks from './components/HowItWorks'
import Footer from './components/Footer'
import ToastContainer from './components/Toast'
import Confetti from './components/Confetti'
import StakingPage from './pages/StakingPage'
import DrawsPage from './pages/DrawsPage'
import HowItWorksPage from './pages/HowItWorksPage'
import ValidatorsPage from './pages/ValidatorsPage'
import DocsPage from './pages/DocsPage'
import ContractsPage from './pages/ContractsPage'
import AuditPage from './pages/AuditPage'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'

// ── Router ──
type Route =
  | { page: 'home'; anchor?: string }
  | { page: 'stake' }
  | { page: 'draws' }
  | { page: 'draw-detail'; drawId: number }
  | { page: 'how-it-works' }
  | { page: 'validators' }
  | { page: 'docs' }
  | { page: 'contracts' }
  | { page: 'audit' }
  | { page: 'terms' }
  | { page: 'privacy' }

function parseRoute(hash: string): Route {
  const h = hash || ''
  // Page routes (with leading slash)
  if (h === '#/' || h === '' || h === '#') return { page: 'home' }
  if (h === '#/stake') return { page: 'stake' }
  if (h === '#/draws') return { page: 'draws' }
  if (h === '#/how-it-works') return { page: 'how-it-works' }
  if (h === '#/validators') return { page: 'validators' }
  if (h === '#/docs') return { page: 'docs' }
  if (h === '#/contracts') return { page: 'contracts' }
  if (h === '#/audit') return { page: 'audit' }
  if (h === '#/terms') return { page: 'terms' }
  if (h === '#/privacy') return { page: 'privacy' }

  // Draw detail: support #/draws/N and legacy #draw/N
  const drawMatch = h.match(/^#\/?draws?\/(\d+)$/)
  if (drawMatch) return { page: 'draw-detail', drawId: parseInt(drawMatch[1]) }

  // Section anchors on home page (#stake, #draws, #how-it-works, #portfolio)
  const anchorMatch = h.match(/^#([a-z-]+)$/)
  if (anchorMatch) return { page: 'home', anchor: anchorMatch[1] }

  return { page: 'home' }
}

function App() {
  const isConnected = useStore((s) => s.isConnected)
  const walletType = useStore((s) => s.walletType)
  const connect = useStore((s) => s.connect)
  const fetchContractData = useStore((s) => s.fetchContractData)
  const fetchDraws = useStore((s) => s.fetchDraws)
  const fetchBalances = useStore((s) => s.fetchBalances)
  const fetchUserData = useStore((s) => s.fetchUserData)

  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  const prevPageRef = useRef(route.page)

  // Listen for hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseRoute(window.location.hash))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // Scroll to top when page changes; scroll to section anchor on home
  useEffect(() => {
    if (route.page !== prevPageRef.current) {
      window.scrollTo(0, 0)
      prevPageRef.current = route.page
    }
    if (route.page === 'home' && 'anchor' in route && route.anchor) {
      setTimeout(() => {
        document.getElementById(route.anchor!)?.scrollIntoView({ behavior: 'smooth' })
      }, 50)
    }
  }, [route])

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

  // Sync gRPC endpoint from rpcStore (on mount + when user switches)
  const activeEndpoint = useRpcStore((s) => s.endpoints[s.activeIndex])
  const activeGrpc = activeEndpoint?.grpc
  const prevGrpcRef = useRef(activeGrpc)
  useEffect(() => {
    if (!activeGrpc) return
    setGrpcEndpoint(activeGrpc)
    setMsgBroadcasterEndpoints({ grpc: activeGrpc })
    // Refetch data when endpoint actually changes (skip initial mount — handled above)
    if (prevGrpcRef.current && prevGrpcRef.current !== activeGrpc) {
      fetchContractData()
      fetchDraws()
      if (isConnected) {
        fetchBalances()
        fetchUserData()
      }
    }
    prevGrpcRef.current = activeGrpc
  }, [activeGrpc])

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

  const renderPage = () => {
    switch (route.page) {
      case 'stake':
        return <StakingPage />
      case 'draws':
        return <DrawsPage />
      case 'draw-detail':
        return <DrawDetail drawId={route.drawId} />
      case 'how-it-works':
        return <HowItWorksPage />
      case 'validators':
        return <ValidatorsPage />
      case 'docs':
        return <DocsPage />
      case 'contracts':
        return <ContractsPage />
      case 'audit':
        return <AuditPage />
      case 'terms':
        return <TermsPage />
      case 'privacy':
        return <PrivacyPage />
      case 'home':
      default:
        return (
          <>
            <HeroSection />
            <StakingPanel />
            <RewardsCalculator />
            {isConnected && <PortfolioSection />}
            <DrawsSection />
            <HowItWorks />
          </>
        )
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />
      <ToastContainer />
      <Confetti />
      <main>{renderPage()}</main>
      <Footer />
    </div>
  )
}

export default App
