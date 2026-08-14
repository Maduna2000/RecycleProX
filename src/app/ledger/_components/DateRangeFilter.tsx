'use client'

/** Local copy of the Reports module's date-range picker — kept inside /ledger's own tree so this sub-app stays fully standalone, per its design (own route tree, no shared chrome/imports with /app). */
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Field, inp } from '@/components/rpx'

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
      <Field label="From">
        <input type="date" value={from} max={to} onChange={(e) => onChange(e.target.value, to)} style={{ ...inp, width: 160 }} />
      </Field>
      <Field label="To">
        <input type="date" value={to} min={from} max={today} onChange={(e) => onChange(from, e.target.value)} style={{ ...inp, width: 160 }} />
      </Field>

      <Field label="Quick range">
        <div className="inline-flex overflow-hidden" style={{ height: 30, border: `1px solid ${colors.border}`, borderRadius: 2 }}>
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
      </Field>
    </div>
  )
}
