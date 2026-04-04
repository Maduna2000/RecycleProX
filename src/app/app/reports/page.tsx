'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BarChart2, Loader2, TrendingUp, ShoppingCart, Users, ArrowRightLeft } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ReportData = {
  range:    { from: string; to: string }
  sales:    { total: string; count: number; average: string }
  purchases:{ total: string; count: number; average: string }
  payments: { total: string }
  netFlow:  string
  newCustomers: number
  topProducts: { productId: string; productName: string; unit: string; totalValue: string }[]
  cashUp:   { totalVariance: string; totalDeclared: string }
}

function fmt(v: string) {
  return `R ${new Decimal(v).toFixed(2)}`
}

function SummaryRow({ label, value, sub, positive, negative }: {
  label: string; value: string; sub?: string; positive?: boolean; negative?: boolean
}) {
  return (
    <div className="flex justify-between items-baseline py-2 border-b last:border-0">
      <div>
        <span className="text-sm text-gray-700">{label}</span>
        {sub && <span className="text-xs text-gray-400 ml-2">{sub}</span>}
      </div>
      <span className={`font-mono font-semibold text-sm ${positive ? 'text-green-700' : negative ? 'text-red-700' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}

export default function ReportsPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const today = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  // Default to current month
  const monthStart = today.substring(0, 8) + '01'

  const [from, setFrom] = useState(monthStart)
  const [to, setTo]     = useState(today)
  const [query, setQuery] = useState(`from=${monthStart}&to=${today}`)

  const { data, isLoading, error } = useSWR<ReportData>(
    isManager ? `/api/reports?${query}` : null,
    fetcher
  )

  if (!isManager) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Access restricted to managers and administrators.
      </div>
    )
  }

  function handleRun() {
    setQuery(`from=${from}&to=${to}`)
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 className="w-6 h-6 text-green-700" />
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
      </div>

      {/* Date range controls */}
      <div className="bg-white rounded-xl border p-5 flex flex-wrap items-end gap-4">
        <div>
          <Label>From</Label>
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-40" />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="mt-1 w-40" />
        </div>
        <Button onClick={handleRun} disabled={isLoading}>
          {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : 'Run Report'}
        </Button>
        {/* Quick presets */}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Today',      from: today,      to: today },
            { label: 'This week',  from: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0]! })(), to: today },
            { label: 'This month', from: monthStart, to: today },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => { setFrom(p.from); setTo(p.to); setQuery(`from=${p.from}&to=${p.to}`) }}
              className="text-xs px-3 py-1.5 rounded-lg border text-gray-600 hover:bg-gray-50"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
          Failed to load report data.
        </div>
      )}

      {data && (
        <>
          <p className="text-xs text-gray-400">
            Showing {data.range.from} to {data.range.to}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sales */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <h2 className="font-semibold text-gray-900">Sales</h2>
              </div>
              <SummaryRow label="Total Revenue"     value={fmt(data.sales.total)}    positive />
              <SummaryRow label="Transactions"      value={String(data.sales.count)} />
              <SummaryRow label="Average Sale"      value={fmt(data.sales.average)}  />
            </div>

            {/* Purchases */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center gap-2 mb-3">
                <ShoppingCart className="w-4 h-4 text-red-600" />
                <h2 className="font-semibold text-gray-900">Purchases</h2>
              </div>
              <SummaryRow label="Total Paid Out"    value={fmt(data.purchases.total)}    negative />
              <SummaryRow label="Transactions"      value={String(data.purchases.count)} />
              <SummaryRow label="Average Purchase"  value={fmt(data.purchases.average)}  />
            </div>

            {/* Cash flow */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                <h2 className="font-semibold text-gray-900">Cash Flow</h2>
              </div>
              <SummaryRow label="Sales Revenue"     value={fmt(data.sales.total)}    positive />
              <SummaryRow label="Purchases Paid"    value={fmt(data.purchases.total)} negative />
              <SummaryRow label="Account Payments"  value={fmt(data.payments.total)} negative />
              <SummaryRow
                label="Net Flow"
                value={fmt(data.netFlow)}
                positive={new Decimal(data.netFlow).gte(0)}
                negative={new Decimal(data.netFlow).lt(0)}
              />
            </div>

            {/* Customers */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-gray-600" />
                <h2 className="font-semibold text-gray-900">Customers</h2>
              </div>
              <SummaryRow label="New Customers"     value={String(data.newCustomers)} />
              <SummaryRow label="Cash-Up Variance"  value={fmt(data.cashUp.totalVariance)}
                positive={new Decimal(data.cashUp.totalVariance).gte(0)}
                negative={new Decimal(data.cashUp.totalVariance).lt(0)}
              />
            </div>
          </div>

          {/* Top products */}
          {data.topProducts.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Top Products by Purchase Value</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 font-medium text-right">Total Paid Out</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((p, i) => (
                    <tr key={p.productId} className="border-b last:border-0">
                      <td className="py-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 text-gray-900">{p.productName}</td>
                      <td className="py-2 text-right font-mono text-red-700">{fmt(p.totalValue)}</td>
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
