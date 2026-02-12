import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2, Radio } from 'lucide-react'
import { useRpcStore, type Endpoint } from '../store/rpcStore'

export default function RpcModal() {
    const { endpoints, activeIndex, modalOpen, selectEndpoint, addCustomEndpoint, removeCustomEndpoint, closeModal } =
        useRpcStore()

    const [grpcInput, setGrpcInput] = useState('')
    const [restInput, setRestInput] = useState('')

    // Lock body scroll while open
    useEffect(() => {
        if (modalOpen) document.body.style.overflow = 'hidden'
        else document.body.style.overflow = ''
        return () => { document.body.style.overflow = '' }
    }, [modalOpen])

    // Close on escape
    useEffect(() => {
        if (!modalOpen) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [modalOpen, closeModal])

    if (!modalOpen) return null

    const handleAdd = () => {
        if (!grpcInput.trim()) return
        addCustomEndpoint(grpcInput, restInput || undefined)
        setGrpcInput('')
        setRestInput('')
    }

    const handleSelect = (i: number) => {
        selectEndpoint(i)
        closeModal()
    }

    return createPortal(
        <div style={styles.overlay} onClick={closeModal}>
            {/* Modal */}
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <span style={styles.title}>RPC Endpoints</span>
                    <button style={styles.closeBtn} onClick={closeModal}>
                        <X size={18} />
                    </button>
                </div>

                {/* Endpoint list */}
                <div style={styles.list}>
                    {endpoints.map((ep, i) => (
                        <EndpointRow
                            key={ep.grpc}
                            endpoint={ep}
                            active={i === activeIndex}
                            onSelect={() => handleSelect(i)}
                            onRemove={ep.custom ? () => removeCustomEndpoint(i) : undefined}
                        />
                    ))}
                </div>

                {/* Add custom */}
                <div style={styles.addSection}>
                    <span style={styles.addLabel}>Add Custom Endpoint</span>
                    <input
                        style={styles.input}
                        placeholder="gRPC URL (https://...)"
                        value={grpcInput}
                        onChange={(e) => setGrpcInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <input
                        style={styles.input}
                        placeholder="REST URL (optional, for block height)"
                        value={restInput}
                        onChange={(e) => setRestInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <button
                        style={{
                            ...styles.addBtn,
                            opacity: grpcInput.trim() ? 1 : 0.4,
                            cursor: grpcInput.trim() ? 'pointer' : 'default',
                        }}
                        onClick={handleAdd}
                        disabled={!grpcInput.trim()}
                    >
                        <Plus size={14} />
                        <span>Add Endpoint</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    )
}

function EndpointRow({
    endpoint,
    active,
    onSelect,
    onRemove,
}: {
    endpoint: Endpoint
    active: boolean
    onSelect: () => void
    onRemove?: () => void
}) {
    const hostname = endpoint.grpc.replace(/^https?:\/\//, '').split('/')[0]

    return (
        <div
            style={{
                ...styles.row,
                borderColor: active ? '#8B6FFF' : '#2A2A38',
                background: active ? 'rgba(139, 111, 255, 0.06)' : 'transparent',
            }}
            onClick={onSelect}
        >
            <div style={styles.rowLeft}>
                <div
                    style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        border: `2px solid ${active ? '#8B6FFF' : '#3A3A4A'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    {active && (
                        <div
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: '#8B6FFF',
                            }}
                        />
                    )}
                </div>
                <div style={styles.rowInfo}>
                    <span style={styles.rowLabel}>
                        {endpoint.label || 'Custom'}
                        {endpoint.custom && (
                            <span style={styles.customBadge}>custom</span>
                        )}
                    </span>
                    <span style={styles.rowHost}>{hostname}</span>
                </div>
            </div>
            {onRemove && (
                <button
                    style={styles.removeBtn}
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove()
                    }}
                    title="Remove endpoint"
                >
                    <Trash2 size={14} />
                </button>
            )}
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.15s ease-out',
    },
    modal: {
        width: 420,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 64px)',
        background: '#1A1A22',
        border: '1px solid #2A2A38',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column' as const,
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        animation: 'scaleIn 0.15s ease-out',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid #2A2A38',
    },
    title: {
        fontSize: 15,
        fontWeight: 600,
        color: '#F0F0F5',
    },
    closeBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'transparent',
        border: 'none',
        color: '#8E8EA0',
        cursor: 'pointer',
        transition: 'color 0.15s',
    },
    list: {
        padding: '8px 12px',
        overflowY: 'auto' as const,
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 6,
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid #2A2A38',
        cursor: 'pointer',
        transition: 'all 0.15s',
    },
    rowLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: 0,
        flex: 1,
    },
    rowInfo: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 2,
        minWidth: 0,
    },
    rowLabel: {
        fontSize: 13,
        fontWeight: 600,
        color: '#F0F0F5',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    customBadge: {
        fontSize: 10,
        fontWeight: 500,
        color: '#8E8EA0',
        background: '#252530',
        padding: '1px 6px',
        borderRadius: 4,
    },
    rowHost: {
        fontSize: 11,
        color: '#8E8EA0',
        fontFamily: "'JetBrains Mono', monospace",
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
    },
    removeBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        background: 'transparent',
        border: 'none',
        color: '#8E8EA0',
        cursor: 'pointer',
        transition: 'color 0.15s',
        flexShrink: 0,
    },
    addSection: {
        padding: '12px 16px 16px',
        borderTop: '1px solid #2A2A38',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 8,
    },
    addLabel: {
        fontSize: 12,
        fontWeight: 600,
        color: '#8E8EA0',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em',
    },
    input: {
        width: '100%',
        padding: '9px 12px',
        borderRadius: 8,
        background: '#13131a',
        border: '1px solid #2A2A38',
        color: '#F0F0F5',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        outline: 'none',
        transition: 'border-color 0.15s',
        boxSizing: 'border-box' as const,
    },
    addBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '9px 16px',
        borderRadius: 8,
        background: 'rgba(139, 111, 255, 0.1)',
        border: '1px solid rgba(139, 111, 255, 0.2)',
        color: '#8B6FFF',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s',
    },
}
