'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import { BarChart2, Loader2, TrendingUp, ShoppingCart, Users, ArrowRightLeft, Receipt, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize } from '@/lib/design-tokens'

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

export default function ReportsPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const today = new Date().toISOString().split('T')[0]!
  const monthStart = today.substring(0, 8) + '01'

  const [from,  setFrom]  = useState(monthStart)
  const [to,    setTo]    = useState(today)
  const [query, setQuery] = useState(`from=${monthStart}&to=${today}`)

  const { data, isLoading, error } = useSWR<ReportData>(
    isManager ? `/api/reports?${query}` : null,
    fetcher,
  )

  if (!isManager) {
    return (
      <PageShell title="Reports" subtitle="Business insights">
        <div className="flex items-center justify-center h-40 text-sm" style={{ color: colors.textSecondary }}>
          Access restricted to managers and administrators.
        </div>
      </PageShell>
    )
  }

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

  const PRESETS = [
    { label: 'Today',       from: today,                                                                                              to: today },
    { label: 'Last 7 days', from: (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]! })(), to: today },
    { label: 'This week',   from: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0]! })(), to: today },
    { label: 'This month',  from: monthStart,                                                                                         to: today },
  ]

  return (
    <PageShell title="Reports" subtitle="Business insights">
      <div className="max-w-3xl space-y-5 pb-6">

        {/* Date range controls */}
        <div className="rounded-lg border p-4 flex flex-wrap items-end gap-3 bg-white" style={{ borderColor: colors.border }}>
          <div>
            <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>From</Label>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>To</Label>
            <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="w-40 h-8 text-xs" />
          </div>
          <button
            onClick={handleRun}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
            style={{ background: colors.action }}
          >
            {isLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</> : 'Run Report'}
          </button>
          {data && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border"
              style={{ borderColor: colors.border, background: colors.surface, color: colors.textPrimary }}
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => { setFrom(p.from); setTo(p.to); setQuery(`from=${p.from}&to=${p.to}`) }}
                className="text-xs px-2.5 py-1 rounded border transition-colors"
                style={{ borderColor: colors.border, color: colors.textSecondary, background: colors.surface }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.bg)}
                onMouseLeave={(e) => (e.currentTarget.style.background = colors.surface)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-xs px-4 py-3 rounded-lg" style={{ background: colors.dangerBg, color: colors.danger }}>
            Failed to load report data.
          </div>
        )}

        {data && (
          <>
            <p style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
              Showing {data.range.from} → {data.range.to}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Sales */}
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: colors.border }}>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4" style={{ color: colors.action }} />
                  <h2 className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Sales</h2>
                </div>
                <SummaryRow label="Total Revenue"    value={fmt(data.sales.total)}    positive />
                <SummaryRow label="Transactions"     value={String(data.sales.count)} />
                <SummaryRow label="Average Sale"     value={fmt(data.sales.average)}  />
              </div>

              {/* Purchases */}
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: colors.border }}>
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart className="w-4 h-4" style={{ color: colors.danger }} />
                  <h2 className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Purchases</h2>
                </div>
                <SummaryRow label="Total Paid Out"   value={fmt(data.purchases.total)}    negative />
                <SummaryRow label="Transactions"     value={String(data.purchases.count)} />
                <SummaryRow label="Average Purchase" value={fmt(data.purchases.average)}  />
              </div>

              {/* Cash Flow */}
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: colors.border }}>
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
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: colors.border }}>
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
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: colors.border }}>
                <div className="flex items-center gap-2 mb-3">
                  <Receipt className="w-4 h-4" style={{ color: colors.warning }} />
                  <h2 className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Expenses by Category</h2>
                  <span className="ml-auto font-mono font-semibold text-sm" style={{ color: colors.warning }}>
                    {fmt(data.expenses.total)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <th className="pb-2 font-medium text-left" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Category</th>
                      <th className="pb-2 font-medium text-right" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.byCategory.map((e) => (
                      <tr key={e.name} style={{ borderBottom: `1px solid ${colors.bg}` }}>
                        <td className="py-1.5" style={{ color: colors.textPrimary, fontSize: fontSize.sm }}>{e.name}</td>
                        <td className="py-1.5 text-right font-mono" style={{ color: colors.warning, fontSize: fontSize.sm }}>{fmt(e.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top products — purchase */}
            {data.topProducts.length > 0 && (
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: colors.border }}>
                <h2 className="font-semibold text-sm mb-3" style={{ color: colors.textPrimary }}>Top Products by Purchase Value</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <th className="pb-2 font-medium text-left w-8" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>#</th>
                      <th className="pb-2 font-medium text-left" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Product</th>
                      <th className="pb-2 font-medium text-right" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Total Paid Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p, i) => (
                      <tr key={p.productId} style={{ borderBottom: `1px solid ${colors.bg}` }}>
                        <td className="py-1.5" style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>{i + 1}</td>
                        <td className="py-1.5" style={{ color: colors.textPrimary, fontSize: fontSize.sm }}>{p.productName}</td>
                        <td className="py-1.5 text-right font-mono" style={{ color: colors.danger, fontSize: fontSize.sm }}>{fmt(p.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top products — sale */}
            {data.topSaleProducts?.length > 0 && (
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: colors.border }}>
                <h2 className="font-semibold text-sm mb-3" style={{ color: colors.textPrimary }}>Top Products by Sale Revenue</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <th className="pb-2 font-medium text-left w-8" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>#</th>
                      <th className="pb-2 font-medium text-left" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Product</th>
                      <th className="pb-2 font-medium text-right" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topSaleProducts.map((p, i) => (
                      <tr key={p.productId} style={{ borderBottom: `1px solid ${colors.bg}` }}>
                        <td className="py-1.5" style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>{i + 1}</td>
                        <td className="py-1.5" style={{ color: colors.textPrimary, fontSize: fontSize.sm }}>{p.productName}</td>
                        <td className="py-1.5 text-right font-mono" style={{ color: colors.action, fontSize: fontSize.sm }}>{fmt(p.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
