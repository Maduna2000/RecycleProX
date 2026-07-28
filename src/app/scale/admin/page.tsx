import { Suspense } from 'react'
import Link from 'next/link'
import { ClipboardList, TrendingUp, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { getScaleStats, listScaleOrders } from '@/lib/services/scaleService'
import { StatusBadge } from '@/components/ui/DataTable'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { PANEL, PANEL_HEAD, HEADER_GRAD, TH, TD, btnPrimary } from '@/components/rpx'

async function StatsCards() {
  const stats = await getScaleStats()
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <StatCard icon={ClipboardList} label="Today's Orders"     value={stats.todayTotal.toString()}       color={colors.process} />
      <StatCard icon={TrendingUp}    label="Total Weight Today" value={`${stats.todayWeightKg} kg`}        color={colors.action} />
      <StatCard icon={Clock}         label="Pending"            value={stats.todayPending.toString()}      color={colors.warning} />
      <StatCard icon={CheckCircle2}  label="Processed"          value={stats.todayProcessed.toString()}    color={colors.action} />
      <StatCard icon={XCircle}       label="Voided"             value={stats.todayVoided.toString()}       color={colors.danger} />
    </div>
  )
}

async function RecentOrders() {
  const { orders } = await listScaleOrders({ page: 1, pageSize: 10 })
  return (
    <div style={PANEL}>
      <div style={PANEL_HEAD}>
        <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary }}>Recent Orders</span>
      </div>
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: HEADER_GRAD, borderBottom: '2px solid #B0B0B0' }}>
            <th style={TH}>Order #</th>
            <th style={TH}>Customer</th>
            <th style={TH}>Product</th>
            <th style={{ ...TH, textAlign: 'right' }}>Weight</th>
            <th style={{ ...TH, textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, i) => (
            <tr key={o.id} style={{ background: i % 2 === 1 ? '#F5F5F5' : '#FFFFFF', borderBottom: '1px solid #E0E0E0' }}>
              <td style={{ ...TD, fontFamily: 'monospace', color: colors.textSecondary }}>{o.orderNumber}</td>
              <td style={TD}>
                {o.customer
                  ? `${o.customer.firstName} ${o.customer.lastName}`
                  : `${o.casualFirstName ?? ''} ${o.casualLastName ?? ''}`.trim() || 'Walk-in'}
              </td>
              <td style={{ ...TD, color: colors.textSecondary }}>{o.product.name}</td>
              <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', color: colors.textSecondary }}>
                {o.weight ? `${Number(o.weight).toFixed(2)} ${o.product.unit}` : '—'}
              </td>
              <td style={{ ...TD, textAlign: 'center' }}>
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '24px 10px', textAlign: 'center', color: colors.textMuted, fontSize: fontSize.sm }}>No orders today</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div style={{ ...PANEL, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon style={{ width: 15, height: 15, color, flexShrink: 0 }} />
        <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <p style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, margin: 0 }}>{value}</p>
    </div>
  )
}

export default function ScaleAdminDashboard() {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Link href="/scale/admin/orders" style={{ ...btnPrimary, textDecoration: 'none' }}>
          <ClipboardList style={{ width: 13, height: 13 }} />
          View All Orders
        </Link>
      </div>

      <Suspense fallback={<div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array(5).fill(0).map((_, i) => <div key={i} style={{ ...PANEL, height: 76 }} />)}</div>}>
        <StatsCards />
      </Suspense>

      <Suspense fallback={<div style={{ ...PANEL, height: 256 }} />}>
        <RecentOrders />
      </Suspense>
    </div>
  )
}
