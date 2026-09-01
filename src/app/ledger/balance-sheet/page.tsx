'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { PortalPage, TD, Field, inp, HEADER_GRAD } from '@/components/rpx'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { formatMoney } from '../_lib/money'
import { StatCard } from '../_components/StatCard'
import { Panel } from '../_components/Panel'
import { BalanceBar } from '../_components/BalanceBar'
import type { BalanceSheetReport } from '@/lib/services/ledgerReportService'

function todayLabel(): string {
  return new Date().toISOString().split('T')[0]!
}

function Section({ title, lines, total }: { title: string; lines: { code: string; name: string; amount: string }[]; total: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.mainInstruction, marginBottom: 6 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {lines.length === 0 ? (
            <tr><td style={{ ...TD, color: colors.textMuted }}>None</td></tr>
          ) : lines.map((l) => (
            <tr key={l.code} style={{ borderBottom: `1px solid ${colors.rowDivider}` }}>
              <td style={TD}>{l.name}</td>
              <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{formatMoney(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `2px solid ${colors.border}` }}>
            <td style={{ ...TD, fontWeight: fontWeight.semibold }}>Total {title}</td>
            <td style={{ ...TD, fontFamily: 'monospace', fontWeight: fontWeight.semibold, textAlign: 'right' }}>{formatMoney(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(todayLabel())
  const { data, isLoading } = useSWR<BalanceSheetReport>(`/api/ledger/balance-sheet?asOf=${asOf}`, fetcher)

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>Balance Sheet</h1>
          <p style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 }}>Assets = Liabilities + Equity, as of a date.</p>
        </div>
        <Field label="As of">
          <input type="date" value={asOf} max={todayLabel()} onChange={(e) => setAsOf(e.target.value)} style={{ ...inp, width: 170 }} />
        </Field>
      </div>

      {data && (
        <div
          className="flex items-center gap-2"
          style={{
            padding: '10px 14px', borderRadius: 6, fontSize: fontSize.base, fontWeight: fontWeight.semibold,
            background: data.balanced ? colors.actionBg : colors.dangerBg,
            color: data.balanced ? colors.action : colors.danger,
          }}
        >
          {data.balanced ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {data.balanced ? 'Balanced.' : 'Not balanced — this indicates a bug in posting logic.'}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total Assets" value={formatMoney(data.assets.total)} tone="action" />
          <StatCard label="Total Liabilities" value={formatMoney(data.liabilities.total)} tone="danger" />
          <StatCard label="Total Equity" value={formatMoney(data.equity.total)} />
        </div>
      )}

      {data && (
        <Panel title="Assets vs. Liabilities + Equity" subtitle="Same scale, side by side — balanced means the two bars are visibly the same length.">
          <BalanceBar assets={Number(data.assets.total)} liabilities={Number(data.liabilities.total)} equity={Number(data.equity.total)} />
        </Panel>
      )}

      <PortalPage title="Balance Sheet">
        <div style={{ overflow: 'auto', flex: 1, padding: 16 }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
          ) : !data ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>No data as of this date.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Section title="Assets" lines={data.assets.lines} total={data.assets.total} />
              <div>
                <Section title="Liabilities" lines={data.liabilities.lines} total={data.liabilities.total} />
                <Section title="Equity" lines={data.equity.lines} total={data.equity.total} />
                <div style={{ background: HEADER_GRAD, borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: fontWeight.bold, fontSize: fontSize.md }}>Total Liabilities + Equity</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: fontWeight.bold, fontSize: fontSize.md }}>{formatMoney(data.totalLiabilitiesAndEquity)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </PortalPage>
    </div>
  )
}
