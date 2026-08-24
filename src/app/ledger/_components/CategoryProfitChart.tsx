'use client'

import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { formatMoney } from '../_lib/money'

export interface ProfitDatum {
  label: string
  value: number
}

/**
 * Horizontal diverging bar chart — profit can go negative per category, so
 * this is a polarity job (above/below zero), not identity: bars share one
 * "good" hue and switch to the status "critical" hue below zero, rather than
 * a per-category color (the axis label already names the category).
 */
export function CategoryProfitChart({ data }: { data: ProfitDatum[] }) {
  const sorted = [...data].sort((a, b) => b.value - a.value)
  if (sorted.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary, fontSize: fontSize.sm }}>
        No category activity in this period yet.
      </div>
    )
  }

  const maxAbs = Math.max(...sorted.map((d) => Math.abs(d.value)), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.map((d) => {
        const widthPct = (Math.abs(d.value) / maxAbs) * 100
        const positive = d.value >= 0
        return (
          <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: fontSize.sm, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>
              {d.label}
            </span>
            <div style={{ position: 'relative', height: 16, background: colors.bg, borderRadius: 3 }}>
              <div
                style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: positive ? '0%' : undefined,
                  right: positive ? undefined : '0%',
                  width: `${widthPct}%`,
                  background: positive ? colors.action : colors.danger,
                  borderRadius: 3,
                }}
              />
            </div>
            <span style={{
              fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: fontWeight.semibold, textAlign: 'right',
              color: positive ? colors.action : colors.danger,
            }}>
              {positive ? '' : '−'}{formatMoney(Math.abs(d.value).toFixed(2))}
            </span>
          </div>
        )
      })}
    </div>
  )
}
