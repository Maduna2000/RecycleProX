'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { Loader2, CreditCard } from 'lucide-react'
import Decimal from 'decimal.js'
import { Avatar } from '@/components/ui/DataTable'
import { PageShell } from '@/components/layout/PageShell'
import { ProcessPaymentModal, type PayTarget } from '@/components/purchases/ProcessPaymentModal'
import { colors, fontSize, fontWeight, layout } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Purchase = {
  id: string; refNumber: string; totalAmount: string; amountPaid: string
  loanDeductionAmount?: string; createdAt: string; notes?: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string | null }
  lines: { id: string }[]
}

type GroupedCustomer = {
  customerId: string; customerName: string; idNumber: string | null
  purchases: Purchase[]; total: Decimal
}

function outstanding(p: Purchase): Decimal {
  return new Decimal(p.totalAmount)
    .minus(p.loanDeductionAmount ? new Decimal(p.loanDeductionAmount) : new Decimal(0))
    .minus(new Decimal(p.amountPaid))
}

export default function UnpaidPurchasesPage() {
  const router = useRouter()
  const KEY = '/api/purchases?status=pending&pageSize=200'
  const { data, isLoading } = useSWR<{ purchases: Purchase[] }>(KEY, fetcher)
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null)

  const groups: GroupedCustomer[] = []
  const seen = new Map<string, GroupedCustomer>()
  for (const p of data?.purchases ?? []) {
    const cid = p.customer.id
    if (!seen.has(cid)) {
      const g: GroupedCustomer = {
        customerId:   cid,
        customerName: `${p.customer.firstName} ${p.customer.lastName}`,
        idNumber:     p.customer.idNumber,
        purchases:    [],
        total:        new Decimal(0),
      }
      seen.set(cid, g)
      groups.push(g)
    }
    const g = seen.get(cid)!
    g.purchases.push(p)
    g.total = g.total.plus(outstanding(p))
  }

  const grandTotal  = groups.reduce((acc, g) => acc.plus(g.total), new Decimal(0))
  const txCount     = data?.purchases?.length ?? 0
  const subtitle    = !isLoading ? `${groups.length} customer${groups.length !== 1 ? 's' : ''} · ${txCount} transaction${txCount !== 1 ? 's' : ''}` : 'Deferred payment purchases'

  return (
    <PageShell title="Unpaid Purchases" subtitle={subtitle}>
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
                {groups.length} customer{groups.length !== 1 ? 's' : ''} · {txCount} transaction{txCount !== 1 ? 's' : ''}
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
              No unpaid purchases — all purchases are settled.
            </div>
          )}

          {/* Customer groups */}
          {groups.map((g) => (
            <div key={g.customerId} className="overflow-hidden" style={{ border: '1px solid #B0B0B0', borderRadius: 0 }}>
              {/* Customer header */}
              <div
                className="flex items-center justify-between px-4 py-2"
                style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.border}` }}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={g.customerName} size={28} />
                  <div>
                    <span
                      className="font-semibold cursor-pointer hover:underline"
                      style={{ fontSize: fontSize.base, color: colors.textPrimary }}
                      onClick={() => router.push(`/app/customers/${g.customerId}`)}
                    >
                      {g.customerName}
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
                    {g.purchases.length} unpaid
                  </span>
                </div>
              </div>

              {/* Purchases table */}
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
                  {g.purchases.map((p, i) => {
                    const paid = new Decimal(p.amountPaid)
                    const bal  = outstanding(p)
                    return (
                      <tr
                        key={p.id}
                        style={{ background: i % 2 === 1 ? '#F5F5F5' : '#FFFFFF', borderBottom: '1px solid #E0E0E0' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#D6E8FF')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 1 ? '#F5F5F5' : '#FFFFFF')}
                      >
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: 'monospace' }}>{p.refNumber}</td>
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.sm, color: colors.textSecondary }}>
                          {p.lines.length} item{p.lines.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: 'monospace' }}>
                          R {new Decimal(p.totalAmount).toFixed(2)}
                        </td>
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.sm, color: paid.gt(0) ? colors.action : colors.textSecondary, fontFamily: 'monospace' }}>
                          {paid.gt(0) ? `R ${paid.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.sm, color: colors.warning, fontFamily: 'monospace', fontWeight: fontWeight.semibold }}>
                          R {bal.toFixed(2)}
                        </td>
                        <td className="px-3" style={{ height: 32, fontSize: fontSize.xs, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                          {new Date(p.createdAt).toLocaleDateString('en-ZA')}
                        </td>
                        <td className="px-3" style={{ height: 32 }}>
                          <button
                            onClick={() => setPayTarget({
                              id:                  p.id,
                              ref:                 p.refNumber,
                              totalAmount:         p.totalAmount,
                              loanDeductionAmount: p.loanDeductionAmount ?? '0',
                              amountPaid:          p.amountPaid,
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
            purchase={payTarget}
            onClose={() => setPayTarget(null)}
            onSuccess={() => { mutate(KEY); setPayTarget(null) }}
          />
        )}
      </div>
    </PageShell>
  )
}
