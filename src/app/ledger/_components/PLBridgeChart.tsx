'use client'

import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { formatMoney } from '../_lib/money'

export interface BridgeStep {
  label: string
  value: number
  /** 'total' | 'reduction' | 'result' — reduction rows draw negative and in
   * the danger hue regardless of the raw value's sign (COGS/Expenses are
   * always a reduction from revenue, even shown here as positive inputs);
   * 'result' rows (Gross/Net Profit) get a divider above them and bold type,
   * the same "subtotal" treatment a spreadsheet gives a running total. */
  kind: 'total' | 'reduction' | 'result'
}

/**
 * The P&L expressed as what it actually is — a step-by-step reduction from
 * Revenue down to Net Profit — rather than only a table. Each bar is scaled
 * to the same baseline so the visual drop from one step to the next is the
 * real proportion, not just a number to read. Same bar-list grammar as
 * CategoryProfitChart (grid label/bar/value columns), extended with a
 * "result" row style for subtotals.
 */
export function PLBridgeChart({ steps }: { steps: BridgeStep[] }) {
  const maxAbs = Math.max(...steps.map((s) => Math.abs(s.value)), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {steps.map((s) => {
        const negative = s.kind === 'reduction'
        const widthPct = (Math.abs(s.value) / maxAbs) * 100
        const barColor = s.kind === 'reduction' ? colors.danger : s.value < 0 ? colors.danger : colors.action
        return (
          <div
            key={s.label}
            style={{
              display: 'grid', gridTemplateColumns: '160px 1fr 130px', alignItems: 'center', gap: 10,
              padding: s.kind === 'result' ? '10px 0 6px' : '6px 0',
              borderTop: s.kind === 'result' ? `2px solid ${colors.border}` : 'none',
              marginTop: s.kind === 'result' ? 4 : 0,
            }}
          >
            <span style={{
              fontSize: fontSize.base, color: s.kind === 'result' ? colors.mainInstruction : colors.textPrimary,
              fontWeight: s.kind === 'result' ? fontWeight.semibold : fontWeight.regular,
            }}>
              {s.label}
            </span>
            <div style={{ position: 'relative', height: 14, background: colors.bg, borderRadius: 3 }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${widthPct}%`, background: barColor, borderRadius: 3, opacity: s.kind === 'result' ? 1 : 0.75 }} />
            </div>
            <span style={{
              fontFamily: 'monospace', fontSize: fontSize.base, textAlign: 'right',
              fontWeight: s.kind === 'result' ? fontWeight.bold : fontWeight.semibold,
              color: negative || s.value < 0 ? colors.danger : colors.action,
            }}>
              {negative ? '−' : s.value < 0 ? '−' : ''}{formatMoney(Math.abs(s.value).toFixed(2))}
            </span>
          </div>
        )
      })}
    </div>
  )
}
