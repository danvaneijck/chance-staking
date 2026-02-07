import { useState, useMemo, useCallback } from 'react'
import { ChainId, EvmChainId } from '@injectivelabs/ts-types'
import { Network, getNetworkEndpoints } from '@injectivelabs/networks'
import { MsgBroadcaster } from '@injectivelabs/wallet-core'
import { Wallet } from '@injectivelabs/wallet-base'
import { getInjectiveAddress } from '@injectivelabs/sdk-ts'
import { WalletStrategy } from '@injectivelabs/wallet-strategy'

const NETWORK = Network.Mainnet

const walletStrategy = new WalletStrategy({
  chainId: ChainId.Mainnet,
  evmOptions: {
    rpcUrl: '',
    evmChainId: EvmChainId.Mainnet,
  },
  strategies: {},
})

const msgBroadcaster = new MsgBroadcaster({
  walletStrategy,
  simulateTx: true,
  network: NETWORK,
  endpoints: getNetworkEndpoints(NETWORK),
  gasBufferCoefficient: 1.1,
})

export type WalletType = 'metamask' | 'keplr' | 'leap' | 'rabby'

export function useWallet() {
  const [address, setAddress] = useState('')
  const [walletType, setWalletType] = useState<WalletType | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const injectiveAddress = useMemo(() => {
    if (address) {
      try {
        return getInjectiveAddress(address)
      } catch {
        return address
      }
    }
    return ''
  }, [address])

  const connect = useCallback(async (type: WalletType) => {
    setIsConnecting(true)
    setError(null)
    try {
      const walletMap: Record<WalletType, Wallet> = {
        metamask: Wallet.Metamask,
        keplr: Wallet.Keplr,
        leap: Wallet.Leap,
        rabby: Wallet.Metamask,
      }
      walletStrategy.setWallet(walletMap[type])
      const addresses = await walletStrategy.getAddresses()
      if (addresses.length > 0) {
        setAddress(addresses[0])
        setWalletType(type)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to connect wallet')
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress('')
    setWalletType(null)
    setError(null)
  }, [])

  return {
    address,
    injectiveAddress,
    walletType,
    isConnecting,
    error,
    isConnected: !!address,
    connect,
    disconnect,
    walletStrategy,
    msgBroadcaster,
  }
}
