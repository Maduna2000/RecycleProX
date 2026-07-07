'use client'

/**
 * Shared date-range picker for the report viewer — From/To inputs plus a
 * segmented "quick range" control. The active preset is derived from the
 * current from/to (no separate selected-state to fall out of sync) and
 * rendered filled, so it's obvious at a glance which range is applied.
 */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

interface DateRangeFilterProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}

export function DateRangeFilter({ from, to, onChange }: DateRangeFilterProps) {
  const today = new Date().toISOString().split('T')[0]!
  const monthStart = today.substring(0, 8) + '01'

  const presets = [
    { label: 'Today',       from: today, to: today },
    { label: 'Last 7 days', from: (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]! })(), to: today },
    { label: 'This week',   from: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0]! })(), to: today },
    { label: 'This month',  from: monthStart, to: today },
  ]

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>From</Label>
        <Input type="date" value={from} max={to} onChange={(e) => onChange(e.target.value, to)} className="w-40 h-9 text-sm" />
      </div>
      <div>
        <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>To</Label>
        <Input type="date" value={to} min={from} max={today} onChange={(e) => onChange(from, e.target.value)} className="w-40 h-9 text-sm" />
      </div>

      <div>
        <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>Quick range</Label>
        <div className="inline-flex h-9 rounded-md border overflow-hidden" style={{ borderColor: colors.border }}>
          {presets.map((p, i) => {
            const active = from === p.from && to === p.to
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(p.from, p.to)}
                style={{
                  fontSize: fontSize.xs,
                  fontWeight: active ? fontWeight.semibold : fontWeight.regular,
                  padding: '0 12px',
                  background: active ? colors.process : colors.surface,
                  color: active ? colors.textOnDark : colors.textSecondary,
                  borderLeft: i === 0 ? 'none' : `1px solid ${colors.border}`,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = colors.rowHover }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = colors.surface }}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
