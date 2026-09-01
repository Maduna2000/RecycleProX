'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/swrFetcher'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { PortalPage, TH, TD, HEADER_GRAD } from '@/components/rpx'
import { DateRangeFilter } from '../_components/DateRangeFilter'
import { StatCard } from '../_components/StatCard'
import { Panel } from '../_components/Panel'
import { PLBridgeChart, type BridgeStep } from '../_components/PLBridgeChart'
import { formatMoney } from '../_lib/money'
import type { ProfitAndLossReport } from '@/lib/services/ledgerReportService'

function todayLabel(): string {
  return new Date().toISOString().split('T')[0]!
}
function monthStartLabel(): string {
  return todayLabel().slice(0, 8) + '01'
}

function Section({ title, lines, total, totalLabel }: { title: string; lines: { code: string; name: string; amount: string }[]; total: string; totalLabel: string }) {
  return (
    <>
      <tr style={{ background: colors.bg }}>
        <td colSpan={2} style={{ ...TD, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>{title}</td>
      </tr>
      {lines.length === 0 ? (
        <tr><td colSpan={2} style={{ ...TD, color: colors.textMuted, paddingLeft: 24 }}>None</td></tr>
      ) : lines.map((l) => (
        <tr key={l.code} style={{ borderBottom: `1px solid ${colors.rowDivider}` }}>
          <td style={{ ...TD, paddingLeft: 24 }}>{l.name}</td>
          <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right' }}>{formatMoney(l.amount)}</td>
        </tr>
      ))}
      <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
        <td style={{ ...TD, paddingLeft: 24, fontWeight: fontWeight.semibold }}>{totalLabel}</td>
        <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', fontWeight: fontWeight.semibold }}>{formatMoney(total)}</td>
      </tr>
    </>
  )
}

export default function ProfitAndLossPage() {
  const [from, setFrom] = useState(monthStartLabel())
  const [to, setTo] = useState(todayLabel())
  const { data, isLoading } = useSWR<ProfitAndLossReport>(`/api/ledger/profit-loss?from=${from}&to=${to}`, fetcher)

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div>
        <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.mainInstruction }}>Profit &amp; Loss</h1>
        <p style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: 2 }}>Revenue minus cost of goods sold and operating expenses, for a period.</p>
      </div>
      <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Revenue" value={formatMoney(data.totalRevenue)} tone="action" />
          <StatCard label="Cost of Goods Sold" value={formatMoney(data.totalCogs)} />
          <StatCard label="Gross Profit" value={formatMoney(data.grossProfit)} tone="action" />
          <StatCard label="Net Profit" value={formatMoney(data.netProfit)} tone={Number(data.netProfit) < 0 ? 'danger' : 'action'} />
        </div>
      )}

      {data && (
        <Panel title="The Bridge from Revenue to Net Profit" subtitle="Each step scaled to the same baseline — how much COGS and expenses take out along the way.">
          <PLBridgeChart steps={[
            { label: 'Revenue', value: Number(data.totalRevenue), kind: 'total' },
            { label: 'Cost of Goods Sold', value: Number(data.totalCogs), kind: 'reduction' },
            { label: 'Gross Profit', value: Number(data.grossProfit), kind: 'result' },
            { label: 'Operating Expenses', value: Number(data.totalOperatingExpenses), kind: 'reduction' },
            { label: 'Net Profit', value: Number(data.netProfit), kind: 'result' },
          ] satisfies BridgeStep[]} />
        </Panel>
      )}

      <PortalPage title="Profit & Loss">
        <div style={{ overflow: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>Loading…</div>
          ) : !data ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textSecondary }}>No data for this period.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={TH}>Account</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <Section title="Revenue" lines={data.revenue} total={data.totalRevenue} totalLabel="Total Revenue" />
                <Section title="Cost of Goods Sold" lines={data.costOfGoodsSold} total={data.totalCogs} totalLabel="Total COGS" />
                <tr>
                  <td style={{ ...TD, fontWeight: fontWeight.semibold, color: colors.action }}>Gross Profit</td>
                  <td style={{ ...TD, fontFamily: 'monospace', textAlign: 'right', fontWeight: fontWeight.semibold, color: colors.action }}>{formatMoney(data.grossProfit)}</td>
                </tr>
                <Section title="Operating Expenses" lines={data.operatingExpenses} total={data.totalOperatingExpenses} totalLabel="Total Operating Expenses" />
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${colors.border}`, background: HEADER_GRAD }}>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: fontWeight.bold, fontSize: fontSize.md }}>Net Profit</td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontWeight: fontWeight.bold, fontSize: fontSize.md, textAlign: 'right', color: Number(data.netProfit) < 0 ? colors.danger : colors.action }}>
                    {formatMoney(data.netProfit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </PortalPage>
    </div>
  )
}
