import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

/** Small at-a-glance figure card — used across every ledger page for a quick summary before the detail table/report. */
export function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'action' | 'danger' }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '14px 16px' }}>
      <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: fontWeight.bold, color: tone === 'danger' ? colors.danger : tone === 'action' ? colors.action : colors.textPrimary, marginTop: 4, fontFamily: 'monospace' }}>
        {value}
      </div>
    </div>
  )
}
