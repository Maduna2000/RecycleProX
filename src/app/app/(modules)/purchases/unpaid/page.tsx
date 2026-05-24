'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { Loader2, CreditCard, AlertCircle } from 'lucide-react'
import Decimal from 'decimal.js'
import { Avatar } from '@/components/ui/DataTable'
import { ProcessPaymentModal, type PayTarget } from '@/components/purchases/ProcessPaymentModal'

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
        customerId: cid,
        customerName: `${p.customer.firstName} ${p.customer.lastName}`,
        idNumber: p.customer.idNumber,
        purchases: [],
        total: new Decimal(0),
      }
      seen.set(cid, g)
      groups.push(g)
    }
    const g = seen.get(cid)!
    g.purchases.push(p)
    g.total = g.total.plus(outstanding(p))
  }

  const grandTotal = groups.reduce((acc, g) => acc.plus(g.total), new Decimal(0))

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full space-y-4 pb-6">

        {/* Page header */}
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5" style={{ color: '#C9A020' }} />
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Unpaid Purchases</h1>
            <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>Purchases saved as unpaid / deferred payment</p>
          </div>
        </div>

        {/* Grand total banner */}
        {!isLoading && groups.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-3 rounded-lg" style={{ background: '#FFFBEB', border: '1px solid #C9A02040' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#C9A020' }}>Total Outstanding</p>
              <p className="font-mono font-bold" style={{ fontSize: 20, color: '#92700F' }}>
                R {grandTotal.toFixed(2)}
              </p>
            </div>
            <div className="ml-4" style={{ color: '#C9A020', fontSize: 12 }}>
              {groups.length} customer{groups.length !== 1 ? 's' : ''} · {data?.purchases?.length ?? 0} transaction{(data?.purchases?.length ?? 0) !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-10 gap-2" style={{ color: '#6C757D', fontSize: 13 }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="flex items-center justify-center py-10 rounded-lg" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0', color: '#6C757D', fontSize: 13 }}>
            No unpaid purchases — all purchases are settled.
          </div>
        )}

        {/* Customer groups */}
        {groups.map((g) => (
          <div key={g.customerId} className="rounded-lg overflow-hidden" style={{ border: '1px solid #E0E0E0' }}>
            {/* Customer header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ background: '#F8F9FA', borderBottom: '1px solid #E0E0E0' }}>
              <div className="flex items-center gap-2">
                <Avatar name={g.customerName} size={28} />
                <div>
                  <span
                    className="font-semibold cursor-pointer hover:underline"
                    style={{ fontSize: 13, color: '#212529' }}
                    onClick={() => router.push(`/app/customers/${g.customerId}`)}
                  >
                    {g.customerName}
                  </span>
                  <span className="ml-2 font-mono" style={{ fontSize: 11, color: '#6C757D' }}>{g.idNumber}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold" style={{ fontSize: 13, color: '#C9A020' }}>
                  R {g.total.toFixed(2)}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#FFFBEB', color: '#C9A020', border: '1px solid #C9A02040' }}>
                  {g.purchases.length} unpaid
                </span>
              </div>
            </div>

            {/* Purchases table */}
            <table className="w-full" style={{ background: '#FFFFFF' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E0E0E0' }}>
                  {['Ref #', 'Items', 'Total', 'Paid', 'Balance', 'Date', ''].map((h) => (
                    <th key={h} className="px-4 py-2 text-left" style={{ fontSize: 10, fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                    <tr key={p.id} style={{ borderBottom: i < g.purchases.length - 1 ? '1px solid #F1F3F4' : 'none' }}>
                      <td className="px-4 py-2.5 font-mono" style={{ fontSize: 11, color: '#6C757D' }}>{p.refNumber}</td>
                      <td className="px-4 py-2.5" style={{ fontSize: 12, color: '#6C757D' }}>
                        {p.lines.length} item{p.lines.length !== 1 ? 's' : ''}
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ fontSize: 12, color: '#6C757D' }}>
                        R {new Decimal(p.totalAmount).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ fontSize: 12, color: paid.gt(0) ? '#217346' : '#6C757D' }}>
                        {paid.gt(0) ? `R ${paid.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold" style={{ fontSize: 12, color: '#C9A020' }}>
                        R {bal.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ fontSize: 11, color: '#6C757D' }}>
                        {new Date(p.createdAt).toLocaleDateString('en-ZA')}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setPayTarget({
                            id: p.id,
                            ref: p.refNumber,
                            totalAmount: p.totalAmount,
                            loanDeductionAmount: p.loanDeductionAmount ?? '0',
                            amountPaid: p.amountPaid,
                          })}
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border"
                          style={{ borderColor: '#217346', color: '#217346', background: '#F0FBF4' }}
                        >
                          <CreditCard className="w-3 h-3" /> Process Payment
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
  )
}
