import { BAR_GRAD, CARD_BORDER } from '@/components/rpx/styles'

/**
 * Legacy panel chrome — matches ContentCard/Dialog exactly (#B0B0B0 border,
 * BAR_GRAD title strip) instead of the softer colors.border used by generic
 * content cards elsewhere. Opt-in per module (Cash-Up, Float, …).
 */
export const PANEL: React.CSSProperties = { border: CARD_BORDER, borderRadius: 3, overflow: 'hidden', background: '#fff' }
export const PANEL_HEAD: React.CSSProperties = { padding: '5px 10px', borderBottom: CARD_BORDER, background: BAR_GRAD }
