'use client'

/**
 * Primary/secondary action button for the report viewer — Run Report is the
 * only primary action (the "search" button); PDF/Excel downloads are
 * secondary. Filters use selects and toggles, never buttons, so the visual
 * weight here signals "this is an action," not "this is a filter."
 */
import type { ReactNode, CSSProperties } from 'react'
import { Btn } from '@/components/rpx'

interface ActionButtonProps {
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
  title?: string
  children: ReactNode
  style?: CSSProperties
}

export function ActionButton({ onClick, disabled, variant = 'secondary', title, children, style }: ActionButtonProps) {
  return (
    <Btn variant={variant} onClick={onClick} disabled={disabled} title={title} style={style}>
      {children}
    </Btn>
  )
}
