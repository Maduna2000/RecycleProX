'use client'

import { colors, fontSize } from '@/lib/design-tokens'
import { formatMoney } from '../_lib/money'

/**
 * The Balance Sheet's own thesis (Assets = Liabilities + Equity) drawn, not
 * just stated — two bars on the same scale. Balanced, they're visibly the
 * same length; the "Not balanced" banner above already says so in words,
 * this is the same fact in a form that's obvious at a glance, and shows
 * *how much* of the funding side is debt (Liabilities) vs. the owner's
 * stake (Equity), which the text banner alone doesn't.
 */
export function BalanceBar({ assets, liabilities, equity }: { assets: number; liabilities: number; equity: number }) {
  const liabPlusEquity = liabilities + equity
  const scale = Math.max(assets, liabPlusEquity, 1)
  const assetsPct = (assets / scale) * 100
  const liabPct = (liabilities / scale) * 100
  const equityPct = (equity / scale) * 100

  const track: React.CSSProperties = { position: 'relative', height: 28, background: colors.bg, borderRadius: 4, overflow: 'hidden' }
  const rowLabel: React.CSSProperties = { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 4 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={rowLabel}>Assets</div>
        <div style={track}>
          <div style={{ position: 'absolute', inset: 0, width: `${assetsPct}%`, background: colors.action, borderRadius: 4 }} />
        </div>
      </div>
      <div>
        <div style={rowLabel}>Liabilities + Equity</div>
        <div style={track}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${liabPct}%`, background: colors.danger }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${liabPct}%`, width: `${equityPct}%`, background: colors.process }} />
        </div>
        <div className="flex items-center gap-4" style={{ marginTop: 6 }}>
          <span className="flex items-center gap-1.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors.danger, display: 'inline-block' }} />
            Liabilities {formatMoney(liabilities.toFixed(2))}
          </span>
          <span className="flex items-center gap-1.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors.process, display: 'inline-block' }} />
            Equity {formatMoney(equity.toFixed(2))}
          </span>
        </div>
      </div>
    </div>
  )
}
