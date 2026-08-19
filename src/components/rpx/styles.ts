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

/** Sticky table-header row background — deepened from #E8E8E8 for more
 * contrast against the white row body beneath it. */
export const HEADER_GRAD = 'linear-gradient(180deg,#FFFFFF 0%,#DCDCDC 100%)'
/** Dialog / drawer / section title-bar background — deepened from
 * #EAEAEA/#D4D4D4 so title bars read as a defined bar, not a pale wash. */
export const BAR_GRAD = 'linear-gradient(180deg,#E2E2E2 0%,#C4C4C4 100%)'
/** Primary money/CTA affordance (Loans "+ New Loan" and equivalents). */
export const ACTION_GRAD = `linear-gradient(180deg,${colors.action} 0%,${colors.actionHover} 100%)`
/** Business-Loan CTA — deliberately distinct from ACTION_GRAD per the app's
 * "differentiate mirrored features" convention (Business Loan is the reverse
 * of Loan and must not look identical to it). */
export const VIOLET_GRAD = `linear-gradient(180deg,${colors.violet} 0%,#6B21A8 100%)`
/** Outer border of content cards and dialogs — darkened from #B0B0B0 to
 * match winBevel's own dark edge below, so a card's outer frame and its
 * internal raised/sunken bevels read as the same weight of line. */
export const CARD_BORDER = '1px solid #9E9E9E'

/**
 * Glossy Win7/Aero navy chrome — the same light-to-base sheen used for the
 * dashboard's tile treatment, applied to the app's title bar and footer so
 * every page (they all share one AppShell) gets the same lacquered look.
 */
export const NAVY_GLOSS_GRAD = 'linear-gradient(180deg,#1e4a8a 0%,#1B3A6B 100%)'
export const NAVY_GLOSS_BEVEL = 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 3px rgba(0,0,0,0.22)'
/** Same bevel shape as NAVY_GLOSS_BEVEL, tuned for light grey/white chrome
 * (dialog/panel title bars, table headers) rather than dark navy. */
export const GLOSS_BEVEL = 'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -2px 4px rgba(0,0,0,0.10)'

/**
 * Real Win32-style raised/pressed bevel — hard 1px border-color pairs
 * instead of a soft box-shadow standing in for one, the way an actual
 * Windows button or title bar is built. No new colors: the light edge is
 * `colors.surface` (white), the dark edge is the same `#B0B0B0` already
 * used everywhere as CARD_BORDER.
 *
 * Raised (idle): light top/left, dark bottom/right — reads as popping out.
 * Pressed (active/selected): inverted — reads as pushed in.
 *
 * Used by Btn, PageTitleBar, RpxDialogHeader, and WindowTaskbar tabs.
 */
export function winBevel(pressed = false): React.CSSProperties {
  const light = colors.surface
  const dark  = '#9E9E9E'
  return pressed
    ? { borderTop: `1px solid ${dark}`, borderLeft: `1px solid ${dark}`, borderRight: `1px solid ${light}`, borderBottom: `1px solid ${light}` }
    : { borderTop: `1px solid ${light}`, borderLeft: `1px solid ${light}`, borderRight: `1px solid ${dark}`, borderBottom: `1px solid ${dark}` }
}

/** Same idea as winBevel, tuned for a dark navy surface (the open-windows
 * taskbar) — a light gray/white edge would be nearly invisible or look like
 * a stray highlight against navy, so this uses white/black tint pairs
 * already used elsewhere for dark-chrome bevels (NAVY_GLOSS_BEVEL). */
export function winBevelDark(pressed = false): React.CSSProperties {
  const light = 'rgba(255,255,255,0.25)'
  const dark  = 'rgba(0,0,0,0.35)'
  return pressed
    ? { borderTop: `1px solid ${dark}`, borderLeft: `1px solid ${dark}`, borderRight: `1px solid ${light}`, borderBottom: `1px solid ${light}` }
    : { borderTop: `1px solid ${light}`, borderLeft: `1px solid ${light}`, borderRight: `1px solid ${dark}`, borderBottom: `1px solid ${dark}` }
}

/** Title-bar/header title text — shared by PageTitleBar (module pages) and
 * RpxDialogHeader (dialogs) so both "window" surfaces render provably
 * identical title typography instead of two separately hand-tuned values. */
export const windowTitleText: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: NAVY,
}

/** Standard 30px input / select / textarea skin — sunken (winBevel(true)),
 * the way a real Win32 text field is recessed into the page rather than
 * sitting flat on top of it. Same visual family as the raised buttons: this
 * is the "pressed in, waiting for data" counterpart. */
export const inp: React.CSSProperties = {
  height: 30, width: '100%', borderRadius: 2,
  padding: '0 8px',
  fontSize: 13, color: colors.textPrimary, outline: 'none',
  background: '#fff', boxSizing: 'border-box',
  ...winBevel(true),
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
 * Legacy Win32-style grey button — the house style for every Btn variant.
 * Flat grey fill (BAR_GRAD) with a real raised bevel (winBevel), the way an
 * actual Windows button is built; severity/emphasis is signalled by label,
 * weight, and text colour rather than a solid colour block. Fixed height
 * (not padding-derived) so every button on a page shares the same box
 * regardless of label length.
 */
export const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 30, fontSize: 12, fontWeight: 700, padding: '0 16px',
  background: BAR_GRAD, color: colors.textPrimary,
  borderRadius: 3, cursor: 'pointer',
  ...winBevel(),
}

/** Grey secondary button — pairs with the (also grey) primary. Same 3px
 * radius as btnPrimary (previously 2px — the two variants disagreed). */
export const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  height: 30, fontSize: 11, fontWeight: 600, padding: '0 12px',
  background: BAR_GRAD, color: colors.textPrimary,
  borderRadius: 3, cursor: 'pointer',
  ...winBevel(),
}

/** Destructive button — same grey fill, red label instead of a solid red block. */
export const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  background: BAR_GRAD, color: colors.danger,
}

/** Same raised bevel, inverted — the "pushed in" look Btn swaps to on
 * mousedown, and what a pressed/active toggle state should reuse. */
export const btnPressed: React.CSSProperties = {
  ...winBevel(true),
  background: 'linear-gradient(180deg,#D4D4D4 0%,#EAEAEA 100%)',
  transform: 'translateY(1px)',
}

/**
 * Panel chrome for grid-tile layouts (Cash-Up, Float, …) — matches
 * ContentCard/Dialog exactly (raised winBevel border, BAR_GRAD title strip)
 * but, unlike ContentCard, isn't hard-coded to a single full-bleed page
 * body, so it can be reused as one of several independently-sized tiles in
 * a grid. Whole panel reads as one raised window (same as RpxDialogContent)
 * — PANEL_HEAD inside it is a flat strip, not a second nested bevel.
 */
export const PANEL: React.CSSProperties = { borderRadius: 3, overflow: 'hidden', background: '#fff', ...winBevel() }
export const PANEL_HEAD: React.CSSProperties = { padding: '5px 10px', borderBottom: CARD_BORDER, background: BAR_GRAD }
