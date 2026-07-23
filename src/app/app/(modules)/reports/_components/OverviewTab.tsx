'use client'

/**
 * Overview tab — the original reports dashboard, moved verbatim from the old
 * single-page module. Summary cards + inline CSV export over /api/reports.
 */
import { useState } from 'react'
import useSWR from 'swr'
import Decimal from 'decimal.js'
import { Loader2, TrendingUp, ShoppingCart, Users, ArrowRightLeft, Receipt, Download } from 'lucide-react'
import { colors, fontSize } from '@/lib/design-tokens'
import { TH, TD } from '@/components/rpx'
import { ActionButton } from './ActionButton'
import { DateRangeFilter } from './DateRangeFilter'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ReportData = {
  range:    { from: string; to: string }
  sales:    { total: string; count: number; average: string }
  purchases:{ total: string; count: number; average: string }
  payments: { total: string }
  netFlow:  string
  newCustomers: number
  expenses: { total: string; byCategory: { name: string; total: string }[] }
  topProducts:     { productId: string; productName: string; unit: string; totalValue: string }[]
  topSaleProducts: { productId: string; productName: string; unit: string; totalValue: string }[]
  cashUp:   { totalVariance: string; totalDeclared: string }
}

function fmt(v: string) {
  return `R ${new Decimal(v).toFixed(2)}`
}

function SummaryRow({ label, value, sub, positive, negative }: {
  label: string; value: string; sub?: string; positive?: boolean; negative?: boolean
}) {
  return (
    <div className="flex justify-between items-baseline py-2" style={{ borderBottom: `1px solid ${colors.bg}` }}>
      <div>
        <span style={{ fontSize: fontSize.base, color: colors.textPrimary }}>{label}</span>
        {sub && <span className="ml-2" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{sub}</span>}
      </div>
      <span
        className="font-mono font-semibold"
        style={{ fontSize: fontSize.base, color: positive ? colors.action : negative ? colors.danger : colors.textPrimary }}
      >
        {value}
      </span>
    </div>
  )
}

export function OverviewTab() {
  const today = new Date().toISOString().split('T')[0]!
  const monthStart = today.substring(0, 8) + '01'

  const [from,  setFrom]  = useState(monthStart)
  const [to,    setTo]    = useState(today)
  const [query, setQuery] = useState(`from=${monthStart}&to=${today}`)

  const { data, isLoading, error } = useSWR<ReportData>(`/api/reports?${query}`, fetcher)

  function handleRun() { setQuery(`from=${from}&to=${to}`) }

  function exportCSV() {
    if (!data) return
    const rows = [
      ['Metric', 'Value'],
      ['Period', `${data.range.from} to ${data.range.to}`], ['', ''],
      ['Sales Revenue', data.sales.total], ['Sales Count', String(data.sales.count)], ['Average Sale', data.sales.average], ['', ''],
      ['Purchases Paid Out', data.purchases.total], ['Purchases Count', String(data.purchases.count)], ['Average Purchase', data.purchases.average], ['', ''],
      ['Account Payments', data.payments.total], ['Total Expenses', data.expenses?.total ?? '0'], ['Net Flow', data.netFlow], ['', ''],
      ['New Customers', String(data.newCustomers)], ['Cash-Up Variance', data.cashUp.totalVariance], ['', ''],
      ['--- Expenses by Category ---', ''], ...(data.expenses?.byCategory ?? []).map((e) => [e.name, e.total]), ['', ''],
      ['--- Top Products by Purchase ---', ''], ...data.topProducts.map((p, i) => [`${i + 1}. ${p.productName}`, p.totalValue]),
    ]
    const csv  = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `report-${data.range.from}-to-${data.range.to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-5 pb-6">

      {/* Date range controls */}
      <div className="rounded border p-4 space-y-3 bg-white" style={{ borderColor: colors.border }}>
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />

        <div className="flex flex-wrap items-center gap-2" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
          <ActionButton variant="primary" onClick={handleRun} disabled={isLoading}>
            {isLoading
              ? <><Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> Loading…</>
              : 'Run Report'}
          </ActionButton>
          {data && (
            <ActionButton onClick={exportCSV}>
              <Download style={{ width: 13, height: 13 }} /> Export CSV
            </ActionButton>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs px-4 py-3 rounded" style={{ background: colors.dangerBg, color: colors.danger }}>
          Failed to load report data.
        </div>
      )}

      {data && data.sales && data.purchases && data.cashUp && (
        <>
          <p style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
            Showing {data.range?.from} → {data.range?.to}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Sales */}
            <div className="rounded border p-4 bg-white" style={{ borderColor: colors.border }}>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4" style={{ color: colors.action }} />
                <h2 className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Sales</h2>
              </div>
              <SummaryRow label="Total Revenue"    value={fmt(data.sales.total)}    positive />
              <SummaryRow label="Transactions"     value={String(data.sales.count)} />
              <SummaryRow label="Average Sale"     value={fmt(data.sales.average)}  />
            </div>

            {/* Purchases */}
            <div className="rounded border p-4 bg-white" style={{ borderColor: colors.border }}>
              <div className="flex items-center gap-2 mb-3">
                <ShoppingCart className="w-4 h-4" style={{ color: colors.danger }} />
                <h2 className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Purchases</h2>
              </div>
              <SummaryRow label="Total Paid Out"   value={fmt(data.purchases.total)}    negative />
              <SummaryRow label="Transactions"     value={String(data.purchases.count)} />
              <SummaryRow label="Average Purchase" value={fmt(data.purchases.average)}  />
            </div>

            {/* Cash Flow */}
            <div className="rounded border p-4 bg-white" style={{ borderColor: colors.border }}>
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft className="w-4 h-4" style={{ color: colors.process }} />
                <h2 className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Cash Flow</h2>
              </div>
              <SummaryRow label="Sales Revenue"    value={fmt(data.sales.total)}                 positive />
              <SummaryRow label="Purchases Paid"   value={fmt(data.purchases.total)}              negative />
              <SummaryRow label="Account Payments" value={fmt(data.payments.total)}               negative />
              <SummaryRow label="Expenses"         value={fmt(data.expenses?.total ?? '0')}       negative />
              <SummaryRow
                label="Net Flow"
                value={fmt(data.netFlow)}
                positive={new Decimal(data.netFlow).gte(0)}
                negative={new Decimal(data.netFlow).lt(0)}
              />
            </div>

            {/* Customers */}
            <div className="rounded border p-4 bg-white" style={{ borderColor: colors.border }}>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4" style={{ color: colors.textSecondary }} />
                <h2 className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Customers</h2>
              </div>
              <SummaryRow label="New Customers"    value={String(data.newCustomers)} />
              <SummaryRow
                label="Cash-Up Variance"
                value={fmt(data.cashUp.totalVariance)}
                positive={new Decimal(data.cashUp.totalVariance).gte(0)}
                negative={new Decimal(data.cashUp.totalVariance).lt(0)}
              />
            </div>
          </div>

          {/* Expenses by category */}
          {data.expenses?.byCategory?.length > 0 && (
            <div className="rounded border p-4 bg-white" style={{ borderColor: colors.border }}>
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="w-4 h-4" style={{ color: colors.warning }} />
                <h2 className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Expenses by Category</h2>
                <span className="ml-auto font-mono font-semibold text-sm" style={{ color: colors.warning }}>
                  {fmt(data.expenses.total)}
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <th style={TH}>Category</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.expenses.byCategory.map((e) => (
                    <tr key={e.name} style={{ borderBottom: `1px solid ${colors.bg}` }}>
                      <td style={TD}>{e.name}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', color: colors.warning }}>{fmt(e.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top products — purchase */}
          {data.topProducts.length > 0 && (
            <div className="rounded border p-4 bg-white" style={{ borderColor: colors.border }}>
              <h2 className="font-semibold text-sm mb-3" style={{ color: colors.textPrimary }}>Top Products by Purchase Value</h2>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <th style={{ ...TH, width: 32 }}>#</th>
                    <th style={TH}>Product</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Total Paid Out</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((p, i) => (
                    <tr key={p.productId} style={{ borderBottom: `1px solid ${colors.bg}` }}>
                      <td style={{ ...TD, color: colors.textSecondary }}>{i + 1}</td>
                      <td style={TD}>{p.productName}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', color: colors.danger }}>{fmt(p.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top products — sale */}
          {data.topSaleProducts?.length > 0 && (
            <div className="rounded border p-4 bg-white" style={{ borderColor: colors.border }}>
              <h2 className="font-semibold text-sm mb-3" style={{ color: colors.textPrimary }}>Top Products by Sale Revenue</h2>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <th style={{ ...TH, width: 32 }}>#</th>
                    <th style={TH}>Product</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topSaleProducts.map((p, i) => (
                    <tr key={p.productId} style={{ borderBottom: `1px solid ${colors.bg}` }}>
                      <td style={{ ...TD, color: colors.textSecondary }}>{i + 1}</td>
                      <td style={TD}>{p.productName}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', color: colors.action }}>{fmt(p.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
