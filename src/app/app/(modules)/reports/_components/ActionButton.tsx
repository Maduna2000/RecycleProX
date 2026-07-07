'use client'

/**
 * Primary/secondary action button for the report viewer — Run Report is the
 * only primary action (the "search" button); PDF/Excel downloads are
 * secondary. Filters use selects and toggles, never buttons, so the visual
 * weight here signals "this is an action," not "this is a filter."
 */
import type { ReactNode, CSSProperties } from 'react'
import { colors, fontSize, fontWeight, layout } from '@/lib/design-tokens'

interface ActionButtonProps {
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
  title?: string
  children: ReactNode
  style?: CSSProperties
}

export function ActionButton({ onClick, disabled, variant = 'secondary', title, children, style }: ActionButtonProps) {
  const isPrimary = variant === 'primary'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 36,
        padding: '0 14px',
        fontSize: fontSize.sm,
        fontWeight: fontWeight.semibold,
        borderRadius: layout.btnRadius,
        border: isPrimary ? 'none' : `1px solid ${colors.border}`,
        background: isPrimary ? colors.action : colors.surface,
        color: isPrimary ? colors.textOnDark : colors.textPrimary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 0.12s ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = isPrimary ? colors.actionHover : colors.rowHover
      }}
      onMouseLeave={(e) => {
        if (disabled) return
        e.currentTarget.style.background = isPrimary ? colors.action : colors.surface
      }}
    >
      {children}
    </button>
  )
}
