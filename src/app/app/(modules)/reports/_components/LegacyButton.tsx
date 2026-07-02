'use client'

/**
 * The small gray "legacy" action button used across modules (reports page,
 * cashup ReportButton) — one component instead of six inline style copies.
 */
import type { ReactNode, CSSProperties } from 'react'

interface LegacyButtonProps {
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  title?: string
  children: ReactNode
  style?: CSSProperties
}

export function LegacyButton({ onClick, disabled, active, title, children, style }: LegacyButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        fontSize: 10,
        padding: '2px 8px',
        background: active ? '#C8D8E8' : '#E0E0E0',
        border: active ? '1px solid #4A6A8A' : '1px solid #999',
        borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        color: '#212529',
        ...style,
      }}
      onMouseEnter={(e) => { if (!disabled && !active) e.currentTarget.style.background = '#D0D0D0' }}
      onMouseLeave={(e) => { if (!disabled && !active) e.currentTarget.style.background = '#E0E0E0' }}
    >
      {children}
    </button>
  )
}
