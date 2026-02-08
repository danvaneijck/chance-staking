import React from 'react'
import { X, Trophy, Info, AlertTriangle } from 'lucide-react'
import { useStore, type Toast as ToastType } from '../store/useStore'

const iconMap = {
  success: <Trophy size={18} color="#22c55e" />,
  info: <Info size={18} color="#38bdf8" />,
  warning: <AlertTriangle size={18} color="#f59e0b" />,
}

const borderColorMap = {
  success: 'rgba(16, 185, 129, 0.3)',
  info: 'rgba(56, 189, 248, 0.3)',
  warning: 'rgba(245, 158, 11, 0.3)',
}

const bgColorMap = {
  success: 'rgba(16, 185, 129, 0.08)',
  info: 'rgba(56, 189, 248, 0.08)',
  warning: 'rgba(245, 158, 11, 0.08)',
}

function ToastItem({ toast }: { toast: ToastType }) {
  const removeToast = useStore((s) => s.removeToast)

  return (
    <div style={{
      ...styles.toast,
      borderColor: borderColorMap[toast.type],
      background: bgColorMap[toast.type],
    }}>
      <div style={styles.toastIcon}>
        {iconMap[toast.type]}
      </div>
      <div style={styles.toastContent}>
        <div style={styles.toastTitle}>{toast.title}</div>
        <div style={styles.toastMessage}>{toast.message}</div>
      </div>
      <button
        style={styles.toastClose}
        onClick={() => removeToast(toast.id)}
      >
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div style={styles.container}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 88,
    right: 24,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    maxWidth: 380,
  },
  toast: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 14,
    border: '1px solid',
    backdropFilter: 'blur(16px)',
    animation: 'fadeInUp 0.3s ease-out',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },
  toastIcon: {
    flexShrink: 0,
    marginTop: 2,
  },
  toastContent: {
    flex: 1,
    minWidth: 0,
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#F0F0F5',
    marginBottom: 2,
  },
  toastMessage: {
    fontSize: 12,
    color: '#8E8EA0',
    lineHeight: 1.4,
  },
  toastClose: {
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    color: '#8E8EA0',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}
