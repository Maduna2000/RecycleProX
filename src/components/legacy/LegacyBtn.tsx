'use client'

import { Btn, type BtnProps } from '@/components/rpx'
import { BAR_GRAD, CARD_BORDER } from '@/components/rpx/styles'
import { colors } from '@/lib/design-tokens'

/**
 * Legacy Windows-style grey button — opt-in per module (Cash-Up, Float, …).
 * Every action — including destructive ones — gets the same flat grey
 * fill, the way real legacy dialogs looked; severity is signalled by the
 * label and text colour, not by a solid colour block.
 */
export function LegacyBtn({ variant = 'secondary', style, ...rest }: BtnProps) {
  return (
    <Btn
      {...rest}
      variant={variant}
      hoverBg="#D2D2D2"
      style={{
        background:  BAR_GRAD,
        border:      CARD_BORDER,
        color:       variant === 'danger' ? colors.danger : colors.textPrimary,
        fontWeight:  variant === 'primary' ? 700 : 600,
        ...style,
      }}
    />
  )
}
