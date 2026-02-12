import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRpcStore, useCurrentRest, useCurrentGrpc } from '../store/rpcStore'
import { colors } from '../theme'

interface BlockInfo {
    height: number
    time: string
}

type Health = 'good' | 'warn' | 'bad' | 'offline'

const STATUS_COLORS: Record<Health, { bg: string; shadow: string }> = {
    good: { bg: '#22c55e', shadow: 'rgba(34, 197, 94, 0.4)' },
    warn: { bg: '#f59e0b', shadow: 'rgba(245, 158, 11, 0.4)' },
    bad: { bg: '#ef4444', shadow: 'rgba(239, 68, 68, 0.4)' },
    offline: { bg: '#ef4444', shadow: 'rgba(239, 68, 68, 0.4)' },
}

function getHealth(blockTime: string | undefined): { health: Health; label: string } {
    if (!blockTime) return { health: 'offline', label: '' }
    const ageSec = (Date.now() - new Date(blockTime).getTime()) / 1000
    if (ageSec < 0 || isNaN(ageSec)) return { health: 'offline', label: '' }

    let label: string
    if (ageSec < 60) label = `${Math.round(ageSec)}s ago`
    else if (ageSec < 3600) label = `${Math.floor(ageSec / 60)}m ago`
    else label = `${Math.floor(ageSec / 3600)}h ago`

    if (ageSec <= 15) return { health: 'good', label }
    if (ageSec <= 60) return { health: 'warn', label }
    return { health: 'bad', label }
}

async function fetchLatestBlock(restEndpoint: string): Promise<BlockInfo> {
    const url = `${restEndpoint}/cosmos/base/tendermint/v1beta1/blocks/latest`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const header = json.block?.header ?? json.sdk_block?.header
    return {
        height: parseInt(header.height, 10),
        time: header.time,
    }
}

export default function RpcSelector() {
    const openModal = useRpcStore((s) => s.openModal)
    const currentGrpc = useCurrentGrpc()
    const currentRest = useCurrentRest()

    const [block, setBlock] = useState<BlockInfo | null>(null)
    const [online, setOnline] = useState(false)
    const [now, setNow] = useState(Date.now())
    const displayHeight = useAnimatedNumber(block?.height ?? 0)

    const poll = useCallback(async () => {
        if (!currentRest) {
            try {
                await fetch(currentGrpc, {
                    method: 'POST',
                    signal: AbortSignal.timeout(5000),
                })
                setOnline(true)
            } catch {
                setOnline(false)
            }
            setBlock(null)
            return
        }
        try {
            const b = await fetchLatestBlock(currentRest)
            setBlock(b)
            setOnline(true)
        } catch {
            setOnline(false)
            setBlock(null)
        }
    }, [currentGrpc, currentRest])

    useEffect(() => {
        poll()
        const id = setInterval(poll, 5_000)
        return () => clearInterval(id)
    }, [poll])

    // Tick every second so the "Xs ago" label stays fresh
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1_000)
        return () => clearInterval(id)
    }, [])

    const { health, label: ageLabel } = online
        ? getHealth(block?.time)
        : { health: 'offline' as Health, label: '' }

    const colors = STATUS_COLORS[health]
    const dotStyle: React.CSSProperties = {
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: colors.bg,
        boxShadow: `0 0 8px ${colors.shadow}`,
        animation: 'pulse 2s ease-in-out infinite',
        flexShrink: 0,
    }

    return (
        <button onClick={openModal} title={currentGrpc} style={styles.button}>
            <span style={dotStyle} />
            {block?.height != null && (
                <span style={styles.height}>
                    #{displayHeight.toLocaleString()}
                </span>
            )}
            {ageLabel && (
                <span style={{ ...styles.age, color: colors.bg }}>
                    {ageLabel}
                </span>
            )}
        </button>
    )
}

/** Smoothly animates a number toward its target value. */
function useAnimatedNumber(target: number): number {
    const [display, setDisplay] = useState(target)
    const rafRef = useRef(0)

    useEffect(() => {
        if (target === 0) {
            setDisplay(0)
            return
        }
        let current = display || target
        const step = () => {
            const diff = target - current
            if (Math.abs(diff) < 1) {
                setDisplay(target)
                return
            }
            current += diff * 0.25
            setDisplay(Math.round(current))
            rafRef.current = requestAnimationFrame(step)
        }
        rafRef.current = requestAnimationFrame(step)
        return () => cancelAnimationFrame(rafRef.current)
    }, [target])

    return display
}

const styles: Record<string, React.CSSProperties> = {
    button: {
        display: 'flex',
        flexWrap: 'nowrap' as const,
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 8,
        background: 'rgba(26, 26, 34, 0.8)',
        border: '1px solid #2A2A38',
        color: '#8E8EA0',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        cursor: 'pointer',
        transition: 'border-color 0.2s',
        whiteSpace: 'nowrap' as const,
        width: '100%',
    },
    height: {
        color: colors.primary,
        fontWeight: 600,
    },
    age: {
        fontSize: 11,
        fontWeight: 500,
    },
    host: {
        color: '#8E8EA0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minWidth: 0,
        flex: 1,
    },
}
