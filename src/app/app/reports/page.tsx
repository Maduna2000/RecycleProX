'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import { BarChart2, Loader2, TrendingUp, ShoppingCart, Users, ArrowRightLeft, Receipt, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    <div className="flex justify-between items-baseline py-2" style={{ borderBottom: '1px solid #F1F3F4' }}>
      <div>
        <span style={{ fontSize: 13, color: '#212529' }}>{label}</span>
        {sub && <span className="ml-2" style={{ fontSize: 11, color: '#6C757D' }}>{sub}</span>}
      </div>
      <span
        className="font-mono font-semibold"
        style={{ fontSize: 13, color: positive ? '#217346' : negative ? '#C0392B' : '#212529' }}
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
      <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#6C757D' }}>
        Access restricted to managers and administrators.
      </div>
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
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl space-y-5 pb-6">

        {/* Page header */}
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5" style={{ color: '#217346' }} />
          <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Reports</h1>
        </div>

        {/* Date range controls */}
        <div className="rounded-lg border p-4 flex flex-wrap items-end gap-3 bg-white" style={{ borderColor: '#E0E0E0' }}>
          <div>
            <Label className="text-xs mb-1 block" style={{ color: '#6C757D' }}>From</Label>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs mb-1 block" style={{ color: '#6C757D' }}>To</Label>
            <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="w-40 h-8 text-xs" />
          </div>
          <button
            onClick={handleRun}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
            style={{ background: '#217346' }}
          >
            {isLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</> : 'Run Report'}
          </button>
          {data && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-[#E0E0E0] bg-white"
              style={{ color: '#212529' }}
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => { setFrom(p.from); setTo(p.to); setQuery(`from=${p.from}&to=${p.to}`) }}
                className="text-xs px-2.5 py-1 rounded border border-[#E0E0E0] hover:bg-[#F1F3F4] transition-colors"
                style={{ color: '#6C757D' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-xs px-4 py-3 rounded-lg" style={{ background: '#FEF2F2', color: '#C0392B' }}>
            Failed to load report data.
          </div>
        )}

        {data && (
          <>
            <p style={{ fontSize: 11, color: '#6C757D' }}>
              Showing {data.range.from} → {data.range.to}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Sales */}
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#E0E0E0' }}>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4" style={{ color: '#217346' }} />
                  <h2 className="font-semibold text-sm" style={{ color: '#212529' }}>Sales</h2>
                </div>
                <SummaryRow label="Total Revenue"    value={fmt(data.sales.total)}    positive />
                <SummaryRow label="Transactions"     value={String(data.sales.count)} />
                <SummaryRow label="Average Sale"     value={fmt(data.sales.average)}  />
              </div>

              {/* Purchases */}
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#E0E0E0' }}>
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart className="w-4 h-4" style={{ color: '#C0392B' }} />
                  <h2 className="font-semibold text-sm" style={{ color: '#212529' }}>Purchases</h2>
                </div>
                <SummaryRow label="Total Paid Out"   value={fmt(data.purchases.total)}    negative />
                <SummaryRow label="Transactions"     value={String(data.purchases.count)} />
                <SummaryRow label="Average Purchase" value={fmt(data.purchases.average)}  />
              </div>

              {/* Cash Flow */}
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#E0E0E0' }}>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowRightLeft className="w-4 h-4" style={{ color: '#185ABD' }} />
                  <h2 className="font-semibold text-sm" style={{ color: '#212529' }}>Cash Flow</h2>
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
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#E0E0E0' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4" style={{ color: '#6C757D' }} />
                  <h2 className="font-semibold text-sm" style={{ color: '#212529' }}>Customers</h2>
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
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#E0E0E0' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Receipt className="w-4 h-4" style={{ color: '#C9A020' }} />
                  <h2 className="font-semibold text-sm" style={{ color: '#212529' }}>Expenses by Category</h2>
                  <span className="ml-auto font-mono font-semibold text-sm" style={{ color: '#C9A020' }}>
                    {fmt(data.expenses.total)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E0E0E0' }}>
                      <th className="pb-2 font-medium text-left" style={{ fontSize: 11, color: '#6C757D' }}>Category</th>
                      <th className="pb-2 font-medium text-right" style={{ fontSize: 11, color: '#6C757D' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.byCategory.map((e) => (
                      <tr key={e.name} style={{ borderBottom: '1px solid #F1F3F4' }}>
                        <td className="py-1.5" style={{ color: '#212529', fontSize: 12 }}>{e.name}</td>
                        <td className="py-1.5 text-right font-mono" style={{ color: '#C9A020', fontSize: 12 }}>{fmt(e.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top products — purchase */}
            {data.topProducts.length > 0 && (
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#E0E0E0' }}>
                <h2 className="font-semibold text-sm mb-3" style={{ color: '#212529' }}>Top Products by Purchase Value</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E0E0E0' }}>
                      <th className="pb-2 font-medium text-left w-8" style={{ fontSize: 11, color: '#6C757D' }}>#</th>
                      <th className="pb-2 font-medium text-left" style={{ fontSize: 11, color: '#6C757D' }}>Product</th>
                      <th className="pb-2 font-medium text-right" style={{ fontSize: 11, color: '#6C757D' }}>Total Paid Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p, i) => (
                      <tr key={p.productId} style={{ borderBottom: '1px solid #F1F3F4' }}>
                        <td className="py-1.5" style={{ color: '#6C757D', fontSize: 12 }}>{i + 1}</td>
                        <td className="py-1.5" style={{ color: '#212529', fontSize: 12 }}>{p.productName}</td>
                        <td className="py-1.5 text-right font-mono" style={{ color: '#C0392B', fontSize: 12 }}>{fmt(p.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top products — sale */}
            {data.topSaleProducts?.length > 0 && (
              <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#E0E0E0' }}>
                <h2 className="font-semibold text-sm mb-3" style={{ color: '#212529' }}>Top Products by Sale Revenue</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E0E0E0' }}>
                      <th className="pb-2 font-medium text-left w-8" style={{ fontSize: 11, color: '#6C757D' }}>#</th>
                      <th className="pb-2 font-medium text-left" style={{ fontSize: 11, color: '#6C757D' }}>Product</th>
                      <th className="pb-2 font-medium text-right" style={{ fontSize: 11, color: '#6C757D' }}>Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topSaleProducts.map((p, i) => (
                      <tr key={p.productId} style={{ borderBottom: '1px solid #F1F3F4' }}>
                        <td className="py-1.5" style={{ color: '#6C757D', fontSize: 12 }}>{i + 1}</td>
                        <td className="py-1.5" style={{ color: '#212529', fontSize: 12 }}>{p.productName}</td>
                        <td className="py-1.5 text-right font-mono" style={{ color: '#217346', fontSize: 12 }}>{fmt(p.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
