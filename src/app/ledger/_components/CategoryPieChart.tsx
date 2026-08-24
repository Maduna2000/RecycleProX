'use client'

import { useState } from 'react'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { formatMoney } from '../_lib/money'

// Validated categorical palette (see the dataviz skill's references/palette.md) —
// fixed hue order, never cycled or reassigned per selection. Past 8 slices the
// remainder folds into "Other" rather than generating a 9th hue.
const SERIES_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
]
const OTHER_COLOR = '#9CA3AF'
const MAX_SLICES = 8

export interface PieDatum {
  label: string
  value: number
}

/**
 * Donut chart with a legend — categorical identity, so each slice keeps a
 * fixed color tied to its position in the (pre-sorted, largest-first) input,
 * never reassigned when the selection changes. A small surface gap separates
 * adjacent slices; only slices above ~6% get a direct percentage label so the
 * chart doesn't turn into a wall of tiny numbers.
 */
export function CategoryPieChart({ data, title }: { data: PieDatum[]; title?: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, MAX_SLICES - 1)
  const rest = sorted.slice(MAX_SLICES - 1)
  const otherValue = rest.reduce((sum, d) => sum + d.value, 0)
  const slices: (PieDatum & { color: string })[] = top.map((d, i) => ({ ...d, color: SERIES_COLORS[i]! }))
  if (otherValue > 0) slices.push({ label: 'Other', value: otherValue, color: OTHER_COLOR })

  const total = slices.reduce((sum, s) => sum + s.value, 0)

  if (total <= 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: colors.textSecondary, fontSize: fontSize.sm }}>
        No data to chart yet.
      </div>
    )
  }

  const size = 200
  const r = 80
  const strokeWidth = 34
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const gapPct = 0.6 // % of circumference reserved as a visual gap between slices

  let cumulativePct = 0
  const arcs = slices.map((s, i) => {
    const pct = (s.value / total) * 100
    const drawPct = Math.max(pct - gapPct, 0.2)
    const dashArray = `${(drawPct / 100) * circumference} ${circumference}`
    const dashOffset = -((cumulativePct / 100) * circumference)
    cumulativePct += pct
    return { ...s, pct, dashArray, dashOffset, index: i }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title ?? 'Category breakdown pie chart'}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={colors.bg} strokeWidth={strokeWidth} />
        {arcs.map((a) => (
          <circle
            key={a.label}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={hoverIdx === a.index ? strokeWidth + 4 : strokeWidth}
            strokeDasharray={a.dashArray}
            strokeDashoffset={a.dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ cursor: 'pointer', transition: 'stroke-width 0.1s' }}
            onMouseEnter={() => setHoverIdx(a.index)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <title>{`${a.label}: ${formatMoney(a.value.toFixed(2))} (${a.pct.toFixed(1)}%)`}</title>
          </circle>
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 15, fontWeight: fontWeight.bold, fill: colors.textPrimary }}>
          {formatMoney(total.toFixed(2))}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 10, fill: colors.textSecondary }}>
          Total
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
        {arcs.map((a) => (
          <div
            key={a.label}
            onMouseEnter={() => setHoverIdx(a.index)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: fontSize.sm,
              opacity: hoverIdx === null || hoverIdx === a.index ? 1 : 0.5,
              cursor: 'default',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 2, background: a.color, flexShrink: 0 }} />
            <span style={{ color: colors.textPrimary, flex: 1 }}>{a.label}</span>
            <span style={{ fontFamily: 'monospace', color: colors.textSecondary, fontSize: fontSize.xs }}>{a.pct.toFixed(1)}%</span>
            <span style={{ fontFamily: 'monospace', fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{formatMoney(a.value.toFixed(2))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
