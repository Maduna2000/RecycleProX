import { Suspense } from 'react'
import Link from 'next/link'
import { Scale, ClipboardList, Layers, Package, TrendingUp, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { getScaleStats } from '@/lib/services/scaleService'
import { listScaleOrders } from '@/lib/services/scaleService'
import { StatusBadge } from './components/StatusBadge'

async function StatsCards() {
  const stats = await getScaleStats()
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <StatCard icon={<ClipboardList className="w-5 h-5 text-blue-600" />} label="Today's Orders" value={stats.todayTotal.toString()} color="bg-blue-50 border-blue-200" />
      <StatCard icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}  label="Total Weight Today" value={`${stats.todayWeightKg} kg`} color="bg-emerald-50 border-emerald-200" />
      <StatCard icon={<Clock className="w-5 h-5 text-amber-600" />}    label="Pending" value={stats.todayPending.toString()} color="bg-amber-50 border-amber-200" />
      <StatCard icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} label="Processed" value={stats.todayProcessed.toString()} color="bg-green-50 border-green-200" />
      <StatCard icon={<XCircle className="w-5 h-5 text-red-500" />}    label="Voided" value={stats.todayVoided.toString()} color="bg-red-50 border-red-200" />
    </div>
  )
}

async function RecentOrders() {
  const { orders } = await listScaleOrders({ page: 1, pageSize: 10 })
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800">Recent Orders</h3>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-4 py-3 text-left">Order #</th>
            <th className="px-4 py-3 text-left">Customer</th>
            <th className="px-4 py-3 text-left hidden md:table-cell">Product</th>
            <th className="px-4 py-3 text-right hidden sm:table-cell">Weight</th>
            <th className="px-4 py-3 text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map(o => (
            <tr key={o.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 font-mono text-xs text-slate-700">{o.orderNumber}</td>
              <td className="px-4 py-3 text-slate-800">
                {o.customer
                  ? `${o.customer.firstName} ${o.customer.lastName}`
                  : `${o.casualFirstName ?? ''} ${o.casualLastName ?? ''}`.trim() || 'Walk-in'}
              </td>
              <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{o.product.name}</td>
              <td className="px-4 py-3 text-right text-slate-600 hidden sm:table-cell font-mono">{Number(o.weight).toFixed(3)} {o.product.unit}</td>
              <td className="px-4 py-3 text-center">
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No orders today</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${color}`}>
      <div className="flex items-center gap-2">{icon}<span className="text-xs font-medium text-slate-600">{label}</span></div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  )
}

export default function ScaleAdminDashboard() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="w-6 h-6 text-emerald-600" />
          <h1 className="text-2xl font-bold text-slate-900">Scale Station</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/scale/admin/orders"     className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"><ClipboardList className="w-4 h-4" />Orders</Link>
          <Link href="/scale/admin/categories" className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"><Layers className="w-4 h-4" />Categories</Link>
          <Link href="/scale/admin/products"   className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"><Package className="w-4 h-4" />Products</Link>
        </div>
      </div>

      <Suspense fallback={<div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{Array(5).fill(0).map((_, i) => <div key={i} className="rounded-xl border bg-slate-50 h-20 animate-pulse" />)}</div>}>
        <StatsCards />
      </Suspense>

      <Suspense fallback={<div className="bg-white rounded-xl border border-slate-200 h-64 animate-pulse" />}>
        <RecentOrders />
      </Suspense>
    </div>
  )
}
