'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Ban, Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { format } from '@/lib/utils/format'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type SaleLine = {
  id: string
  quantity: string
  unitPrice: string
  lineTotal: string
  product: { id: string; code: string; name: string; unit: string }
}

type Sale = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  totalAmount: string
  paymentMethod: string
  buyerName: string
  buyerIdNumber?: string
  buyerPhone?: string
  notes?: string
  voidedAt?: string
  voidReason?: string
  createdAt: string
  lines: SaleLine[]
}

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const [voidOpen, setVoidOpen] = useState(false)

  const { data: sale, isLoading } = useSWR<Sale>(`/api/sales/${id}`, fetcher)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
  if (!sale) return <div className="flex items-center justify-center h-64 text-gray-400">Sale not found</div>

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      {sale.status === 'voided' && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="font-semibold text-red-700">This sale has been voided</p>
          {sale.voidReason && <p className="text-sm text-red-600 mt-0.5">Reason: {sale.voidReason}</p>}
          {sale.voidedAt && <p className="text-xs text-red-400 mt-1">{format.datetime(sale.voidedAt)}</p>}
        </div>
      )}

      {/* Sale card */}
      <div className="bg-white rounded-xl border p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Sale</p>
            <h1 className="text-2xl font-bold text-gray-900 font-mono mt-0.5">{sale.refNumber}</h1>
            <p className="text-sm text-gray-500 mt-1">{format.datetime(sale.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            {sale.status === 'completed'
              ? <Badge className="bg-green-100 text-green-700">Completed</Badge>
              : <Badge variant="destructive">Voided</Badge>}
            <Badge variant="outline" className="capitalize">{sale.paymentMethod}</Badge>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Buyer</p>
            <p className="font-semibold text-gray-900">{sale.buyerName}</p>
            {sale.buyerIdNumber && <p className="text-gray-500 font-mono">{sale.buyerIdNumber}</p>}
            {sale.buyerPhone && <p className="text-gray-500">{sale.buyerPhone}</p>}
          </div>
          {sale.notes && (
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Notes</p>
              <p className="text-gray-700">{sale.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-xl border overflow-hidden mb-4">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Products Sold</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Product', 'Qty', 'Sell Price', 'Line Total'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {sale.lines.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{line.product.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{line.product.code}</p>
                </td>
                <td className="px-4 py-3 font-mono text-gray-700">
                  {Number(line.quantity).toFixed(3)} {line.product.unit}
                </td>
                <td className="px-4 py-3 font-mono text-gray-700">R {Number(line.unitPrice).toFixed(2)}</td>
                <td className="px-4 py-3 font-mono font-semibold text-gray-900">R {Number(line.lineTotal).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-gray-50">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right font-semibold text-gray-700">Total</td>
              <td className="px-4 py-3 font-mono font-bold text-lg text-gray-900">
                R {Number(sale.totalAmount).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Actions */}
      <div className="flex justify-between pb-6">
        <Button
          variant="outline"
          onClick={() => window.open(`/api/sales/${sale.id}/receipt?format=pdf`, '_blank')}
        >
          <Printer className="w-4 h-4 mr-2" /> Print Receipt
        </Button>
        {isManager && sale.status !== 'voided' && (
          <Button
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setVoidOpen(true)}
          >
            <Ban className="w-4 h-4 mr-2" /> Void Sale
          </Button>
        )}
      </div>

      {voidOpen && (
        <VoidModal
          sale={sale}
          onClose={() => setVoidOpen(false)}
          onSuccess={() => { mutate(`/api/sales/${id}`); setVoidOpen(false) }}
        />
      )}
    </div>
  )
}

function VoidModal({ sale, onClose, onSuccess }: { sale: Sale; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    if (reason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setLoading(true)
    const res = await fetch(`/api/sales/${sale.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Sale voided'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to void sale') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">Void Sale</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-gray-600">
            You are about to void <span className="font-semibold">{sale.refNumber}</span> (R {Number(sale.totalAmount).toFixed(2)}).
            This action cannot be undone.
          </p>
          <div>
            <Label>Reason for void</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason (min 5 characters)"
              className="mt-1"
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button variant="destructive" onClick={onConfirm} disabled={loading || reason.trim().length < 5}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Voiding...</> : 'Confirm Void'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
