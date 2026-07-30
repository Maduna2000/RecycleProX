/**
 * Renovo Pro house-style constants — the canonical officer-portal look.
 *
 * Extracted verbatim from the police officer portal (src/app/police/page.tsx),
 * which is the reference design for every page and dialog in the system:
 * navy primary actions, 10px uppercase labels, 30px bordered inputs,
 * gradient sticky table headers, folder tabs on white content cards.
 *
 * Use these for raw elements (`<input style={inp}>`, `<th style={TH}>`);
 * use the sibling components (Btn, Field, TabStrip, …) for anything richer.
 */

import { colors } from '@/lib/design-tokens'

export const NAVY = colors.primary

/** Sticky table-header row background. */
export const HEADER_GRAD = 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)'
/** Dialog / drawer / section title-bar background. */
export const BAR_GRAD = 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)'
/** Primary money/CTA affordance (Loans "+ New Loan" and equivalents). */
export const ACTION_GRAD = `linear-gradient(180deg,${colors.action} 0%,${colors.actionHover} 100%)`
/** Business-Loan CTA — deliberately distinct from ACTION_GRAD per the app's
 * "differentiate mirrored features" convention (Business Loan is the reverse
 * of Loan and must not look identical to it). */
export const VIOLET_GRAD = `linear-gradient(180deg,${colors.violet} 0%,#6B21A8 100%)`
/** Outer border of content cards and dialogs. */
export const CARD_BORDER = '1px solid #B0B0B0'

/**
 * Glossy Win7/Aero navy chrome — the same light-to-base sheen used for the
 * dashboard's tile treatment, applied to the app's title bar and footer so
 * every page (they all share one AppShell) gets the same lacquered look.
 */
export const NAVY_GLOSS_GRAD = 'linear-gradient(180deg,#1e4a8a 0%,#1B3A6B 100%)'
export const NAVY_GLOSS_BEVEL = 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 3px rgba(0,0,0,0.22)'
/** Same bevel shape as NAVY_GLOSS_BEVEL, tuned for light grey/white chrome
 * (buttons, dialog/panel title bars, table headers) rather than dark navy. */
export const GLOSS_BEVEL = 'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -2px 4px rgba(0,0,0,0.10)'

/** Standard 30px input / select / textarea skin. */
export const inp: React.CSSProperties = {
  height: 30, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 8px',
  fontSize: 13, color: colors.textPrimary, outline: 'none',
  background: '#fff', boxSizing: 'border-box',
}

/** 10px uppercase field label. */
export const lbl: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: colors.textSecondary, marginBottom: 3,
}

/** Table header cell — pair with a `HEADER_GRAD` sticky header row. */
export const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 10px', height: 30,
  fontSize: 10, fontWeight: 700, color: colors.textSecondary,
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}

/** Table data cell. */
export const TD: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12, color: colors.textPrimary,
}

/**
 * Legacy Windows-style grey button — the house style for every Btn variant.
 * Flat grey fill (BAR_GRAD) with a #B0B0B0 border, the way real legacy
 * dialogs looked; severity/emphasis is signalled by label, weight, and text
 * colour rather than a solid colour block.
 */
export const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 700, padding: '7px 16px',
  background: BAR_GRAD, color: colors.textPrimary, border: CARD_BORDER,
  borderRadius: 3, cursor: 'pointer',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
}

/** Grey secondary button — pairs with the (also grey) primary. Same 3px
 * radius as btnPrimary (previously 2px — the two variants disagreed). */
export const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  fontSize: 11, fontWeight: 600, padding: '5px 12px',
  background: BAR_GRAD, color: colors.textPrimary, border: CARD_BORDER,
  borderRadius: 3, cursor: 'pointer',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
}

/** Destructive button — same grey fill, red label instead of a solid red block. */
export const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  background: BAR_GRAD, color: colors.danger, border: CARD_BORDER,
}

/**
 * Panel chrome for grid-tile layouts (Cash-Up, Float, …) — matches
 * ContentCard/Dialog exactly (#B0B0B0 border, BAR_GRAD title strip) but,
 * unlike ContentCard, isn't hard-coded to a single full-bleed page body, so
 * it can be reused as one of several independently-sized tiles in a grid.
 */
export const PANEL: React.CSSProperties = { border: CARD_BORDER, borderRadius: 3, overflow: 'hidden', background: '#fff' }
export const PANEL_HEAD: React.CSSProperties = { padding: '5px 10px', borderBottom: CARD_BORDER, background: BAR_GRAD, boxShadow: GLOSS_BEVEL }
