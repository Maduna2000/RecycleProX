'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Loader2, CreditCard } from 'lucide-react'
import Decimal from 'decimal.js'
import { Avatar } from '@/components/ui/DataTable'
import { PageShell } from '@/components/layout/PageShell'
import { ProcessPaymentModal, type PayTarget } from '@/components/sales/ProcessPaymentModal'
import { colors, fontSize, fontWeight, layout } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Sale = {
  id: string
  refNumber: string
  totalAmount: string
  amountPaid?: string
  buyerName: string
  buyerIdNumber?: string
  customerId?: string
  createdAt: string
  lines: { id: string }[]
}

type Group = {
  key: string
  name: string
  idNumber?: string
  customerId?: string
  sales: Sale[]
  total: Decimal
}

function outstanding(s: Sale): Decimal {
  return new Decimal(s.totalAmount).minus(new Decimal(s.amountPaid ?? '0'))
}

export default function UnpaidSalesPage() {
  const KEY = '/api/sales?status=pending&pageSize=200'
  const { data, isLoading } = useSWR<{ sales: Sale[] }>(KEY, fetcher)
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null)

  // Group by customerId (account buyers) then by buyerName (walk-in buyers)
  const groups: Group[] = []
  const seen = new Map<string, Group>()

  for (const s of data?.sales ?? []) {
    const key = s.customerId ?? `walkin:${s.buyerName.toLowerCase().trim()}`
    if (!seen.has(key)) {
      const g: Group = {
        key,
        name:       s.buyerName,
        idNumber:   s.buyerIdNumber,
        customerId: s.customerId,
        sales:      [],
        total:      new Decimal(0),
      }
      seen.set(key, g)
      groups.push(g)
    }
    const g = seen.get(key)!
    g.sales.push(s)
    g.total = g.total.plus(outstanding(s))
  }

  const grandTotal = groups.reduce((acc, g) => acc.plus(g.total), new Decimal(0))
  const txCount    = data?.sales?.length ?? 0
  const subtitle   = !isLoading
    ? `${groups.length} buyer${groups.length !== 1 ? 's' : ''} · ${txCount} sale${txCount !== 1 ? 's' : ''}`
    : 'Deferred payment sales'

  return (
    <PageShell title="Unpaid Sales" subtitle={subtitle}>
      <div className="flex flex-col flex-1 min-h-0 gap-4 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full space-y-4 pb-6">

          {/* Grand total banner */}
          {!isLoading && groups.length > 0 && (
            <div
              className="flex items-center gap-4 px-4 py-3 rounded-lg"
              style={{ background: colors.alertBg, border: `1px solid ${colors.alertBorder}` }}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.alertIcon }}>
                  Total Outstanding
                </p>
                <p className="font-mono font-bold" style={{ fontSize: fontSize['2xl'], color: colors.alertText }}>
                  R {grandTotal.toFixed(2)}
                </p>
              </div>
              <div className="ml-4 text-xs" style={{ color: colors.alertIcon }}>
                {groups.length} buyer{groups.length !== 1 ? 's' : ''} · {txCount} sale{txCount !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-10 gap-2" style={{ color: colors.textSecondary, fontSize: fontSize.base }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}

          {!isLoading && groups.length === 0 && (
            <div
              className="flex items-center justify-center py-10 rounded-lg text-sm"
              style={{ background: colors.toolbar, border: `1px solid ${colors.border}`, color: colors.textSecondary }}
            >
              No unpaid sales — all sales are settled.
            </div>
          )}

          {/* Buyer groups */}
          {groups.map((g) => (
            <div key={g.key} className="overflow-hidden" style={{ border: '1px solid #B0B0B0', borderRadius: 0 }}>
              {/* Buyer header */}
              <div
                className="flex items-center justify-between px-4 py-2"
                style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.border}` }}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={g.name} size={28} />
                  <div>
                    <span
                      className="font-semibold"
                      style={{ fontSize: fontSize.base, color: colors.textPrimary }}
                    >
                      {g.name}
                    </span>
                    {g.idNumber && (
                      <span className="ml-2 font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                        {g.idNumber}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold" style={{ fontSize: fontSize.base, color: colors.warning }}>
                    R {g.total.toFixed(2)}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '2px 8px', borderRadius: layout.btnRadius,
                      fontSize: fontSize.xs, fontWeight: fontWeight.medium,
                      background: colors.warningBg, color: colors.warning,
                    }}
                  >
                    {g.sales.length} unpaid
                  </span>
                </div>
              </div>

              {/* Sales table */}
              <table className="w-full bg-white border-collapse">
                <thead>
                  <tr style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #E8E8E8 100%)', borderBottom: '2px solid #B0B0B0' }}>
                    {['Ref #', 'Items', 'Total', 'Paid', 'Balance', 'Date', ''].map((h) => (
                      <th
                        key={h}
                        className="text-left px-3"
                        style={{ fontSize: 11, fontWeight: fontWeight.semibold, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', height: 32 }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.sales.map((s, i) => {
                    const paid = new Decimal(s.amountPaid ?? '0')
                    const bal  = outstanding(s)
                    return (
                      <tr
                        key={s.id}
                        style={{ background: i % 2 === 1 ? '#F5F5F5' : '#FFFFFF', borderBottom: '1px solid #E0E0E0' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#D6E8FF')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 1 ? '#F5F5F5' : '#FFFFFF')}
                      >
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: 'monospace' }}>{s.refNumber}</td>
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.sm, color: colors.textSecondary }}>
                          {s.lines.length} item{s.lines.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: 'monospace' }}>
                          R {new Decimal(s.totalAmount).toFixed(2)}
                        </td>
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.sm, color: paid.gt(0) ? colors.action : colors.textSecondary, fontFamily: 'monospace' }}>
                          {paid.gt(0) ? `R ${paid.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.sm, color: colors.warning, fontFamily: 'monospace', fontWeight: fontWeight.semibold }}>
                          R {bal.toFixed(2)}
                        </td>
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.xs, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                          {new Date(s.createdAt).toLocaleDateString('en-ZA')}
                        </td>
                        <td className="px-3" style={{ height: 32 }}>
                          <button
                            onClick={() => setPayTarget({
                              id:          s.id,
                              ref:         s.refNumber,
                              totalAmount: s.totalAmount,
                              amountPaid:  s.amountPaid ?? '0',
                            })}
                            className="flex items-center gap-1 text-xs font-medium"
                            style={{
                              height: 24, paddingLeft: 8, paddingRight: 8,
                              borderRadius: layout.btnRadius,
                              background: colors.action, color: '#fff',
                            }}
                          >
                            <CreditCard className="w-3 h-3" /> Pay
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {payTarget && (
          <ProcessPaymentModal
            sale={payTarget}
            onClose={() => setPayTarget(null)}
            onSuccess={() => { mutate(KEY); setPayTarget(null) }}
          />
        )}
      </div>
    </PageShell>
  )
}
