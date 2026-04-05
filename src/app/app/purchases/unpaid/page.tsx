'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, ArrowLeft, CreditCard } from 'lucide-react'
import { useRouter } from 'next/navigation'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Purchase = {
  id: string; refNumber: string; totalAmount: string; createdAt: string; notes?: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string }
  lines: { id: string }[]
}

type GroupedCustomer = {
  customerId: string; customerName: string; idNumber: string
  purchases: Purchase[]; total: number
}

export default function UnpaidPurchasesPage() {
  const router = useRouter()
  const KEY = '/api/purchases?status=pending&limit=200&include=customer,lines'
  const { data, isLoading } = useSWR<{ purchases: Purchase[] }>(KEY, fetcher)
  const [payTarget, setPayTarget] = useState<{ id: string; ref: string; amount: string } | null>(null)

  // Group by customer
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
        total: 0,
      }
      seen.set(cid, g)
      groups.push(g)
    }
    const g = seen.get(cid)!
    g.purchases.push(p)
    g.total += parseFloat(p.totalAmount)
  }

  const grandTotal = groups.reduce((acc, g) => acc + g.total, 0)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Unpaid Purchases</h1>
          <p className="text-sm text-gray-500">Purchases saved as unpaid / deferred payment</p>
        </div>
      </div>

      {/* Grand total */}
      {!isLoading && groups.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
          <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">Total Outstanding</p>
          <p className="text-2xl font-bold text-orange-800">R {grandTotal.toFixed(2)}</p>
          <p className="text-xs text-orange-500 mt-1">
            {groups.length} customer{groups.length !== 1 ? 's' : ''} · {data?.purchases?.length ?? 0} transaction{(data?.purchases?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center p-10 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
          No unpaid purchases — all purchases are settled.
        </div>
      )}

      {/* Groups */}
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.customerId} className="bg-white rounded-xl border overflow-hidden">
            {/* Customer header */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b">
              <div>
                <span
                  className="font-semibold text-gray-900 cursor-pointer hover:text-green-700"
                  onClick={() => router.push(`/app/customers/${g.customerId}`)}
                >
                  {g.customerName}
                </span>
                <span className="ml-2 text-xs font-mono text-gray-400">{g.idNumber}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-orange-700">
                  Total: R {g.total.toFixed(2)}
                </span>
                <Badge className="bg-orange-100 text-orange-700">{g.purchases.length} unpaid</Badge>
              </div>
            </div>

            {/* Purchase rows */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {['Ref #', 'Items', 'Amount', 'Date', 'Action'].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {g.purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.refNumber}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {p.lines.length} line item{p.lines.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-gray-900">
                      R {parseFloat(p.totalAmount).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleDateString('en-ZA')}
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                        onClick={() => setPayTarget({ id: p.id, ref: p.refNumber, amount: p.totalAmount })}
                      >
                        <CreditCard className="w-3.5 h-3.5 mr-1" /> Mark Paid
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Mark as Paid modal */}
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
}: { purchase: { id: string; ref: string; amount: string }; onClose: () => void; onSuccess: () => void }) {
  const [method, setMethod] = useState<'cash' | 'eft' | 'cheque'>('cash')
  const [loading, setLoading] = useState(false)

  async function handlePay() {
    setLoading(true)
    const res = await fetch(`/api/purchases/${purchase.id}/mark-paid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethod: method }),
    })
    setLoading(false)
    if (res.ok) { toast.success(`${purchase.ref} marked as paid`); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to mark as paid') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Mark Purchase as Paid</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <p className="font-medium text-gray-700">{purchase.ref}</p>
            <p className="text-gray-500">Amount: <strong>R {parseFloat(purchase.amount).toFixed(2)}</strong></p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Payment Method</label>
            <Select onValueChange={(v) => setMethod(v as 'cash' | 'eft' | 'cheque')} defaultValue="cash">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handlePay} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Payment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
