'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { Loader2, CreditCard, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar } from '@/components/ui/DataTable'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Purchase = {
  id: string; refNumber: string; totalAmount: string; createdAt: string; notes?: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string }
  lines: { id: string }[]
}

type GroupedCustomer = {
  customerId: string; customerName: string; idNumber: string
  purchases: Purchase[]; total: Decimal
}

export default function UnpaidPurchasesPage() {
  const router = useRouter()
  const KEY = '/api/purchases?status=pending&limit=200&include=customer,lines'
  const { data, isLoading } = useSWR<{ purchases: Purchase[] }>(KEY, fetcher)
  const [payTarget,   setPayTarget]   = useState<{ id: string; ref: string; amount: string } | null>(null)

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
    g.total = g.total.plus(p.totalAmount)
  }

  const grandTotal = groups.reduce((acc, g) => acc.plus(g.total), new Decimal(0))

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-4xl space-y-4 pb-6">

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
                  {['Ref #', 'Items', 'Amount', 'Date', ''].map((h) => (
                    <th key={h} className="px-4 py-2 text-left" style={{ fontSize: 10, fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.purchases.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < g.purchases.length - 1 ? '1px solid #F1F3F4' : 'none' }}>
                    <td className="px-4 py-2.5 font-mono" style={{ fontSize: 11, color: '#6C757D' }}>{p.refNumber}</td>
                    <td className="px-4 py-2.5" style={{ fontSize: 12, color: '#6C757D' }}>
                      {p.lines.length} item{p.lines.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold" style={{ fontSize: 12, color: '#212529' }}>
                      R {new Decimal(p.totalAmount).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ fontSize: 11, color: '#6C757D' }}>
                      {new Date(p.createdAt).toLocaleDateString('en-ZA')}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setPayTarget({ id: p.id, ref: p.refNumber, amount: p.totalAmount })}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border"
                        style={{ borderColor: '#217346', color: '#217346', background: '#F0FBF4' }}
                      >
                        <CreditCard className="w-3 h-3" /> Mark Paid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {payTarget && (
        <MarkPaidModal
          purchase={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={() => { mutate(KEY); setPayTarget(null) }}
        />
      )}
    </div>
  )
}

function MarkPaidModal({
  purchase,
  onClose,
  onSuccess,
}: {
  purchase: { id: string; ref: string; amount: string }
  onClose: () => void
  onSuccess: () => void
}) {
  const [method,  setMethod]  = useState<'cash' | 'eft' | 'cheque' | 'amplopay'>('cash')
  const [loading, setLoading] = useState(false)

  async function handlePay() {
    setLoading(true)
    const res = await fetch(`/api/purchases/${purchase.id}/mark-paid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethod: method }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success(`${purchase.ref} marked as paid`)
      onSuccess()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to mark as paid')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ color: '#212529' }}>Mark Purchase as Paid</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="px-3 py-2.5 rounded-lg" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0' }}>
            <p className="font-mono font-medium" style={{ fontSize: 12, color: '#212529' }}>{purchase.ref}</p>
            <p style={{ fontSize: 12, color: '#6C757D' }}>
              Amount: <span className="font-mono font-semibold" style={{ color: '#212529' }}>R {new Decimal(purchase.amount).toFixed(2)}</span>
            </p>
          </div>
          <div>
            <label className="block mb-1 text-xs font-medium" style={{ color: '#6C757D' }}>Payment Method</label>
            <Select onValueChange={(v) => setMethod(v as typeof method)} defaultValue="cash">
              <SelectTrigger className="h-8 text-xs border-[#E0E0E0]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="amplopay">AmploPay</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded text-xs font-medium border border-[#E0E0E0] bg-white disabled:opacity-50"
              style={{ color: '#212529' }}
            >
              Cancel
            </button>
            <button
              onClick={handlePay}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
              style={{ background: '#217346' }}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
              Confirm Payment
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
