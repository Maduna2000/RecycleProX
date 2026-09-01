import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

/**
 * Zone divider for a long report page — an uppercase label plus a hairline
 * rule filling the rest of the row. Tells the reader what kind of numbers
 * come next (a live position vs. this period's trading vs. things that need
 * action) instead of leaving every panel to read as equally-weighted,
 * undifferentiated stack. Distinct from rpx's SectionLabel (which is scoped
 * to tight form/filter contexts) — this one is sized for a whole page zone.
 */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3" style={{ marginTop: 4 }}>
      <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: colors.border }} />
    </div>
  )
}

/**
 * The Ledger module's own card shell — flat white surface, hairline border,
 * a titled header strip. Deliberately not the rest of the app's Win32-bevel
 * PANEL (see @/components/rpx): this module reads as a reporting dashboard,
 * not a transactional form, so its cards stay flat. Shared by every ledger
 * page that groups content into titled blocks, so spacing/typography for
 * "a card with a title" only has one definition.
 */
export function Panel({
  title, subtitle, actions, bodyStyle, children,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  bodyStyle?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>{title}</div>
          {subtitle && <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {actions}
      </div>
      <div style={{ padding: 16, ...bodyStyle }}>{children}</div>
    </div>
  )
}

/**
 * A label/value row inside a Panel — shared by every "breakdown" list
 * (Trading Breakdown, Cash Reconciliation, P&L bridge) so their divider
 * weight, subtotal styling, and tone coloring only need to agree once.
 * `first` drops the row's own top divider — the Panel header's bottom
 * border already closes that seam, so the first row doesn't need a second
 * line directly under it.
 */
export function PanelRow({
  label, value, first, subtotal, tone,
}: {
  label: string
  value: string
  first?: boolean
  subtotal?: boolean
  tone?: 'action' | 'danger'
}) {
  return (
    <div
      style={{
        display: 'flex', justifyContent: 'space-between', padding: '8px 0',
        borderTop: first ? 'none' : subtotal ? `2px solid ${colors.border}` : `1px solid ${colors.rowDivider}`,
        fontWeight: subtotal ? fontWeight.bold : fontWeight.regular,
      }}
    >
      <span style={{ color: colors.textPrimary, fontSize: fontSize.base }}>{label}</span>
      <span style={{
        fontFamily: 'monospace', fontSize: fontSize.base,
        color: tone === 'danger' ? colors.danger : tone === 'action' ? colors.action : colors.textPrimary,
      }}>
        {value}
      </span>
    </div>
  )
}
