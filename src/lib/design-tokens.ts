/**
 * Renovo Pro Design Tokens
 * Single source of truth for all colours, typography, and spacing.
 *
 * Usage:
 *   import { colors, tw, fontSize, spacing, styles, statusStyle } from '@/lib/design-tokens'
 *
 * - colors.*     → raw hex values for inline style={{ color: colors.action }}
 * - tw.*         → Tailwind class strings for className={tw.textPrimary}
 * - fontSize.*   → pixel values for inline style={{ fontSize: fontSize.sm }}
 * - spacing.*    → pixel values for inline style={{ gap: spacing[6] }}
 * - styles.*     → pre-built style objects for common UI patterns
 * - statusStyle  → semantic helper: returns inline styles for a given status string
 */

// ─── Colour Palette ───────────────────────────────────────────────────────────

export const colors = {
  // Brand
  /** Navy — top nav bar, active tab background, primary buttons (see @/components/rpx Btn) */
  primary:       '#1B3A6B',
  /**
   * Ledger green — success/status green ONLY (badges, positive money, net weight).
   * Matches tailwind.config.ts's rpx.green — the two files previously disagreed
   * (this used to be emerald #10b981) which caused ~15 files to hand-roll #217346
   * directly instead of importing this token. Now there is one green.
   * NOT for buttons: primary actions use the navy Btn from @/components/rpx.
   */
  action:        '#217346',
  /** Blue — secondary buttons, links, info states */
  process:       '#185ABD',
  /** Win7 dialog/wizard "main instruction" blue — page and section titles */
  mainInstruction: '#003399',
  /** Link blue — genuine navigational links only, not buttons styled as links */
  link:          '#0066CC',
  /** Amber — pending states, warnings, loan banners */
  warning:       '#C9A020',
  /** Red — void, delete, errors, blacklisted indicators */
  danger:        '#C0392B',

  // Surfaces
  /** White — all cards and table backgrounds */
  surface:       '#FFFFFF',
  /** Light grey — page / zone-3 background */
  bg:            '#F1F3F4',
  /** Off-white — toolbar (zone-2) strip */
  toolbar:       '#F8F9FA',
  /** Blue tint — hovered table row */
  rowHover:      '#EBF3FC',

  // Text
  /** Near-black — all primary body text */
  textPrimary:   '#212529',
  /** Darkened mid-grey — secondary labels, metadata, table/filter headers.
   * Was #6C757D — too low-contrast at the 10-11px sizes labels and column
   * headers actually render at, reading as faded rather than "secondary."
   * Still clearly a step down from textPrimary, just no longer washed out. */
  textSecondary: '#495057',
  /** Light grey — muted captions, placeholders */
  textMuted:     '#9CA3AF',
  /** White text — used on coloured backgrounds */
  textOnDark:    '#FFFFFF',

  // Borders & Outlines
  /** Standard border on cards, inputs, dividers — darkened from #E0E0E0 for
   * more definition; still a hairline, just no longer nearly invisible
   * against the #F1F3F4 page background. */
  border:        '#C9CDD1',
  /** Focused input / active element ring */
  borderFocus:   '#185ABD',

  // Extra UI tints (used in badges, backgrounds)
  /** Amber background tint — warning / pending badge fill */
  warningBg:     '#FEF9EC',
  /** Red background tint — danger / voided badge fill */
  dangerBg:      '#FDECEA',
  /** Emerald-50 background tint — active / completed badge fill */
  actionBg:      '#ECFDF5',
  /** Blue background tint — info badge fill */
  processBg:     '#EBF3FC',
  /** Grey background tint — inactive badge fill */
  neutralBg:     '#F1F3F4',

  // Tab bar
  /** Inactive tab text in the top nav */
  tabMuted:      '#8BA4D4',
  /** Active tab underline accent */
  tabAccent:     '#F2AB1A',

  // Dashboard dark-mode palette
  /** Portal main background (very dark navy) */
  dashBg:        '#0a1628',
  /** Portal header / footer background */
  dashSurface:   '#081120',
  /** Portal stats strip background */
  dashStrip:     '#0d1f3c',

  // Tile gradient "from" shades (lighter than the primary token color)
  tileNavyFrom:  '#1e4a8a',
  tileNavyHover: '#2558a8',
  tileBluFrom:   '#1d6bc7',
  tileBluHover:  '#2278d4',
  tileGreenFrom: '#10b981',
  tileGreenHover:'#059669',
  tileAmberFrom: '#c49b1c',
  tileAmberHover:'#d4a820',

  // Loan / alert banner (amber tones not covered by warning*)
  /** Amber-50 — loan/alert banner background */
  alertBg:           '#FFFBEB',
  /** Amber-200 — loan/alert banner bottom border */
  alertBorder:       '#FDE68A',
  /** Amber-600 — alert icons and strong text */
  alertIcon:         '#D97706',
  /** Amber-900 — alert body text (dark) */
  alertText:         '#92400E',
  /** Amber-100 — deduction input background */
  alertInput:        '#FEF3C7',
  /** Amber-300 — deduction input border */
  alertInputBorder:  '#FCD34D',

  // Role badges
  /** Purple — admin role badge text */
  purple:        '#7B2D8B',
  /** Purple tint — admin role badge background */
  purpleBg:      '#F3EBF9',
  /** Violet — sale photo type tag text */
  violet:        '#8B5CF6',
  /** Violet tint — sale photo type tag background */
  violetBg:      '#F3EFFF',

  // Button hover darkens
  /** Darkened ledger green — hover state for action/primary buttons */
  actionHover:   '#1a5c38',
  /** Darker blue — hover state for process/secondary buttons */
  processHover:  '#1249A0',

  // Utility
  /** Disabled / placeholder icon colour */
  disabled:      '#C0C0C0',
  /** Dense list row separator (very light grey) */
  rowDivider:    '#F0F0F0',

  // Net weight display
  /** Green-600 — net weight value in weighing mode */
  netWeightText: '#059669',
  /** Green-50 border tint for net weight box */
  netWeightBorder: '#A7F3D0',
  /** Green-50 background for net weight box */
  netWeightBg:   '#ECFDF5',
} as const

// ─── Tailwind Utility Classes ─────────────────────────────────────────────────
// Use these in className="" instead of hardcoding colour class names.
// They map to the rpx.* colours registered in tailwind.config.ts.

export const tw = {
  // Text colours
  textPrimary:   'text-rpx-text',
  textSecondary: 'text-rpx-muted',
  textAction:    'text-rpx-green',
  textProcess:   'text-rpx-blue',
  textWarning:   'text-rpx-amber',
  textDanger:    'text-rpx-red',

  // Background colours
  bgPage:        'bg-rpx-grey',
  bgSurface:     'bg-white',
  bgToolbar:     'bg-rpx-rowalt',
  bgRowHover:    'bg-rpx-hover',
  bgAction:      'bg-rpx-green',
  bgProcess:     'bg-rpx-blue',
  bgNavy:        'bg-rpx-navy',

  // Border colours
  border:        'border-rpx-border',
  borderFocus:   'focus:border-rpx-blue',

  // Common combinations
  card:          'bg-white border border-rpx-border rounded-lg',
  inputBase:     'border border-rpx-border rounded-md focus:outline-none focus:border-rpx-blue',
  /** @deprecated Use the navy <Btn variant="primary"> from @/components/rpx instead. */
  btnPrimary:    'bg-rpx-green text-white hover:opacity-90',
  btnSecondary:  'border border-rpx-blue text-rpx-blue bg-white hover:bg-rpx-hover',
  btnDanger:     'border border-rpx-red text-rpx-red bg-white hover:bg-red-50',
  btnGhost:      'text-rpx-muted hover:bg-white hover:text-rpx-text',
} as const

// ─── Typography ───────────────────────────────────────────────────────────────

export const fontSize = {
  /** 11px — status bar, timestamps, badges */
  xs:   11,
  /** 12px — table column headers, form labels */
  sm:   12,
  /** 13px — table row data, button text, body copy */
  base: 13,
  /** 14px — section titles, modal headers */
  md:   14,
  /** 16px — page titles */
  lg:   16,
  /** 20px — stat card labels */
  xl:   20,
  /** 24px — stat card values */
  '2xl': 24,
} as const

export const fontWeight = {
  regular:    400,
  medium:     500,
  semibold:   600,
  bold:       700,
} as const

export const fontFamily = '"Segoe UI", -apple-system, Arial, sans-serif'

// ─── Spacing ──────────────────────────────────────────────────────────────────

/** Standard spacing scale (multiples of 4px), keys match Tailwind p-/gap-/m- scale */
export const spacing: Record<number, number> = {
  1:  4,
  2:  8,
  3: 12,
  4: 16,   // component internal padding
  5: 20,
  6: 24,   // section gap
  8: 32,
}

export const layout = {
  /** All cards, table wrappers */
  cardRadius:    8,
  /** All buttons (portal house style) */
  btnRadius:     3,
  /** Input / select fields (portal house style) */
  inputRadius:   2,
  /** Height of each table data row (portal house style) */
  tableRowH:     30,
  /** Top nav zone height — matches AppShell's actual rendered Zone-1 header
   * (`AppShell.tsx`'s `header` element, `height: 40`). Previously declared
   * as 48 here, disagreeing with the real chrome — fixed so a page can
   * actually compute "space left for content" from this token instead of
   * guessing. */
  navbarH:       40,
  /** Contextual toolbar zone height — matches AppShell's actual rendered
   * `var(--rpx-toolbar-h, 32px)` (previously declared as 36 here, disagreeing
   * with what the shell actually renders). */
  toolbarH:      32,
  /** Zone 3 content padding (all sides) — the table-wrapper padding nearly
   * every `(modules)/*` list/detail page already converges on by hand
   * (10px). Previously declared as 24 here, a value no page actually used —
   * fixed to match reality so this token is worth importing instead of
   * every page re-deriving its own magic number. */
  contentPadding: 10,
} as const

// ─── Pre-built Inline Style Objects ──────────────────────────────────────────
// Drop these directly into style={} for consistent component styling.

export const styles = {
  // Text
  textPrimary:   { color: colors.textPrimary }   as React.CSSProperties,
  textSecondary: { color: colors.textSecondary } as React.CSSProperties,
  textMuted:     { color: colors.textMuted }     as React.CSSProperties,
  textAction:    { color: colors.action }        as React.CSSProperties,
  textProcess:   { color: colors.process }       as React.CSSProperties,
  textWarning:   { color: colors.warning }       as React.CSSProperties,
  textDanger:    { color: colors.danger }        as React.CSSProperties,

  // Cards
  card: {
    background:   colors.surface,
    border:       `1px solid ${colors.border}`,
    borderRadius: layout.cardRadius,
  } as React.CSSProperties,

  // Table header cell
  tableHeader: {
    fontSize:      fontSize.sm,
    fontWeight:    fontWeight.semibold,
    color:         colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    background:    colors.bg,
  } as React.CSSProperties,

  // Table row cell
  tableCell: {
    fontSize:   fontSize.base,
    fontWeight: fontWeight.regular,
    color:      colors.textPrimary,
    height:     layout.tableRowH,
  } as React.CSSProperties,

  // Money values
  moneyPositive: {
    fontFamily: 'monospace',
    color:      colors.action,
    fontWeight: fontWeight.semibold,
  } as React.CSSProperties,

  moneyNegative: {
    fontFamily: 'monospace',
    color:      colors.danger,
    fontWeight: fontWeight.semibold,
  } as React.CSSProperties,

  moneyNeutral: {
    fontFamily: 'monospace',
    color:      colors.textPrimary,
    fontWeight: fontWeight.semibold,
  } as React.CSSProperties,

  // Page title — Win7 main-instruction blue, not body-text black
  pageTitle: {
    fontSize:   fontSize.lg,
    fontWeight: fontWeight.semibold,
    color:      colors.mainInstruction,
  } as React.CSSProperties,

  // Section title — Win7 main-instruction blue, not body-text black
  sectionTitle: {
    fontSize:   fontSize.md,
    fontWeight: fontWeight.semibold,
    color:      colors.mainInstruction,
  } as React.CSSProperties,

  // Stat card value
  statValue: {
    fontSize:   fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color:      colors.textPrimary,
  } as React.CSSProperties,

  statLabel: {
    fontSize:   fontSize.xl,
    fontWeight: fontWeight.medium,
    color:      colors.textSecondary,
  } as React.CSSProperties,
} as const

// ─── Semantic Status Helpers ──────────────────────────────────────────────────
// Used by status badges throughout the app.

type AppStatus =
  | 'active' | 'inactive'
  | 'completed' | 'pending' | 'voided'
  | 'settled' | 'approved' | 'submitted' | 'open'
  | 'blacklisted' | 'locked'
  | 'in_progress' | 'waiting_for_customer' | 'resolved' | 'closed'
  | 'on site' | 'paid' | 'processed' | 'expired'

interface StatusStyle {
  color:      string
  background: string
  label:      string
}

const STATUS_MAP: Record<AppStatus, StatusStyle> = {
  active:      { color: colors.action,    background: colors.actionBg,   label: 'Active' },
  completed:   { color: colors.action,    background: colors.actionBg,   label: 'Completed' },
  settled:     { color: colors.action,    background: colors.actionBg,   label: 'Settled' },
  approved:    { color: colors.action,    background: colors.actionBg,   label: 'Approved' },
  paid:        { color: colors.action,    background: colors.actionBg,   label: 'Paid' },
  processed:   { color: colors.action,    background: colors.actionBg,   label: 'Processed' },

  pending:     { color: colors.warning,   background: colors.warningBg,  label: 'Pending' },
  submitted:   { color: colors.warning,   background: colors.warningBg,  label: 'Submitted' },
  open:        { color: colors.process,   background: colors.processBg,  label: 'Open' },
  'on site':   { color: colors.process,   background: colors.processBg,  label: 'On Site' },
  in_progress: { color: colors.process,   background: colors.processBg,  label: 'In Progress' },
  waiting_for_customer: { color: colors.warning, background: colors.warningBg, label: 'Awaiting Your Reply' },
  resolved:    { color: colors.action,    background: colors.actionBg,   label: 'Resolved' },

  voided:      { color: colors.danger,    background: colors.dangerBg,   label: 'Voided' },
  blacklisted: { color: colors.danger,    background: colors.dangerBg,   label: 'Blacklisted' },
  locked:      { color: colors.danger,    background: colors.dangerBg,   label: 'Locked' },
  expired:     { color: colors.danger,    background: colors.dangerBg,   label: 'Expired' },

  inactive:    { color: colors.textSecondary, background: colors.neutralBg, label: 'Inactive' },
  closed:      { color: colors.textSecondary, background: colors.neutralBg, label: 'Closed' },
}

/**
 * The one canonical badge/pill shape used app-wide — pill radius, 11px
 * medium-weight text, 2px/8px padding. `statusStyle()` below is this same
 * shape driven by `STATUS_MAP`; use `badgeStyle()` directly for badges that
 * aren't a lifecycle status (role, direction, category, pin, etc.) so every
 * badge in the app renders identically regardless of what it labels.
 */
export function badgeStyle(color: string, background: string): React.CSSProperties {
  return {
    display:      'inline-flex',
    alignItems:   'center',
    padding:      '2px 8px',
    borderRadius: 999,
    fontSize:     fontSize.xs,
    fontWeight:   fontWeight.medium,
    color,
    background,
  }
}

/**
 * Returns inline style + display label for a given status string.
 * Falls back to neutral styling for unknown values.
 *
 * @example
 * const s = statusStyle('completed')
 * <span style={s.badge}>{s.label}</span>
 */
export function statusStyle(status: string): {
  badge:      React.CSSProperties
  dotColor:   string
  label:      string
} {
  const s = STATUS_MAP[status as AppStatus] ?? {
    color:      colors.textSecondary,
    background: colors.neutralBg,
    label:      status.charAt(0).toUpperCase() + status.slice(1),
  }

  return {
    badge:    badgeStyle(s.color, s.background),
    dotColor: s.color,
    label:    s.label,
  }
}

// ─── Re-export as grouped object (optional convenience) ───────────────────────

const designTokens = {
  colors,
  tw,
  fontSize,
  fontWeight,
  fontFamily,
  spacing,
  layout,
  styles,
  statusStyle,
  badgeStyle,
}

export default designTokens
