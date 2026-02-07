import React from 'react'
import { useWallet } from './hooks/useWallet'
import Header from './components/Header'
import HeroSection from './components/HeroSection'
import StakingPanel from './components/StakingPanel'
import DrawsSection from './components/DrawsSection'
import HowItWorks from './components/HowItWorks'
import Footer from './components/Footer'

function App() {
  const {
    address,
    injectiveAddress,
    walletType,
    isConnecting,
    isConnected,
    connect,
    disconnect,
  } = useWallet()

  // Mock exchange rate — in production this would come from the staking hub contract
  const exchangeRate = 1.042

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header
        isConnected={isConnected}
        address={address}
        injectiveAddress={injectiveAddress}
        walletType={walletType}
        isConnecting={isConnecting}
        onConnect={connect}
        onDisconnect={disconnect}
      />

      <main>
        <HeroSection />
        <StakingPanel isConnected={isConnected} exchangeRate={exchangeRate} />
        <DrawsSection />
        <HowItWorks />
      </main>

      <Footer />
    </div>
  )
}

export default App
