'use client'

import { colors } from '@/lib/design-tokens'

/**
 * The running balance's shape over the filtered period, at a glance — the
 * table already lists every value, but a page of numbers doesn't show a
 * drift or a swing the way a line does. Purely a trend read: no axis, no
 * tooltip math, just "did this account climb, fall, or hold" — the table
 * underneath still owns the actual figures.
 */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null

  const width = 640
  const height = 48
  const pad = 4
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2)
    const y = height - pad - ((v - min) / range) * (height - pad * 2)
    return [x, y] as const
  })
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `${path} L${points[points.length - 1]![0].toFixed(1)},${height - pad} L${points[0]![0].toFixed(1)},${height - pad} Z`
  const trendUp = values[values.length - 1]! >= values[0]!
  const lineColor = trendUp ? colors.action : colors.danger

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Running balance trend over the selected period">
      <path d={areaPath} fill={lineColor} opacity={0.08} />
      <path d={path} fill="none" stroke={lineColor} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={points[0]![0]} cy={points[0]![1]} r={2.5} fill={colors.textMuted} />
      <circle cx={points[points.length - 1]![0]} cy={points[points.length - 1]![1]} r={2.5} fill={lineColor} />
    </svg>
  )
}
