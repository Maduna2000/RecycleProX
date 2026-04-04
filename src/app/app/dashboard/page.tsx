'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import {
  TrendingUp, ShoppingCart, ArrowRightLeft,
  DollarSign, AlertCircle, CheckCircle2, Clock,
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type TodayStats = {
  date:         string
  sales:        { total: string; count: number }
  purchases:    { total: string; count: number }
  netFlow:      string
  cashUpStatus: 'open' | 'submitted' | 'approved' | null
  cashUpId:     string | null
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'gray',
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color?: 'green' | 'red' | 'blue' | 'gray'
}) {
  const colors = {
    green: 'text-green-600 bg-green-50',
    red:   'text-red-600 bg-red-50',
    blue:  'text-blue-600 bg-blue-50',
    gray:  'text-gray-600 bg-gray-50',
  }
  return (
    <div className="bg-white rounded-xl border p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data, isLoading } = useSWR<TodayStats>('/api/reports/today', fetcher, {
    refreshInterval: 30_000,
  })

  const name = session?.user?.name ?? session?.user?.username ?? 'there'

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Welcome back, {name} ·{' '}
          {new Date().toLocaleDateString('en-ZA', { dateStyle: 'full' })}
        </p>
      </div>

      {isLoading && (
        <div className="text-sm text-gray-400">Loading today&apos;s stats...</div>
      )}

      {data && (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              icon={TrendingUp}
              label="Today's Sales"
              value={`R ${new Decimal(data.sales.total).toFixed(2)}`}
              sub={`${data.sales.count} transaction${data.sales.count !== 1 ? 's' : ''}`}
              color="green"
            />
            <KpiCard
              icon={ShoppingCart}
              label="Today's Purchases"
              value={`R ${new Decimal(data.purchases.total).toFixed(2)}`}
              sub={`${data.purchases.count} transaction${data.purchases.count !== 1 ? 's' : ''}`}
              color="red"
            />
            <KpiCard
              icon={ArrowRightLeft}
              label="Net Flow"
              value={`R ${new Decimal(data.netFlow).toFixed(2)}`}
              sub="Sales minus purchases"
              color={new Decimal(data.netFlow).gte(0) ? 'green' : 'red'}
            />
            <KpiCard
              icon={DollarSign}
              label="Cash-Up"
              value={
                data.cashUpStatus === 'approved'  ? 'Approved' :
                data.cashUpStatus === 'submitted' ? 'Awaiting' :
                data.cashUpStatus === 'open'      ? 'Open' :
                'Not Started'
              }
              sub={
                data.cashUpStatus === 'approved'  ? 'Session closed' :
                data.cashUpStatus === 'submitted' ? 'Pending manager sign-off' :
                data.cashUpStatus === 'open'      ? 'Session in progress' :
                'Open a session to begin'
              }
              color={
                data.cashUpStatus === 'approved'  ? 'green' :
                data.cashUpStatus === 'submitted' ? 'blue' :
                'gray'
              }
            />
          </div>

          {/* Cash-up alert banner */}
          {isManager && data.cashUpStatus === 'submitted' && data.cashUpId && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
              <Clock className="w-4 h-4 shrink-0" />
              <span>A cash-up is waiting for your approval.</span>
              <Link href="/app/cashup" className="ml-auto font-semibold underline-offset-2 hover:underline">
                Review →
              </Link>
            </div>
          )}

          {!data.cashUpStatus && (
            <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3 text-sm text-yellow-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>No cash-up session open for today.</span>
              <Link href="/app/cashup" className="ml-auto font-semibold underline-offset-2 hover:underline">
                Open session →
              </Link>
            </div>
          )}

          {data.cashUpStatus === 'approved' && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Today&apos;s cash-up has been approved.</span>
            </div>
          )}
        </>
      )}

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'New Purchase', href: '/app/purchases/new', color: 'bg-green-600' },
            { label: 'New Sale',     href: '/app/sales/new',     color: 'bg-blue-600' },
            { label: 'Customers',    href: '/app/customers',     color: 'bg-gray-700' },
            { label: 'Stock',        href: '/app/stock',         color: 'bg-orange-600' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${item.color} text-white text-sm font-semibold rounded-xl px-4 py-3 text-center hover:opacity-90 transition-opacity`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Reports link (managers only) */}
      {isManager && (
        <div className="text-sm">
          <Link href="/app/reports" className="text-green-700 font-medium hover:underline">
            View detailed reports →
          </Link>
        </div>
      )}
    </div>
  )
}
