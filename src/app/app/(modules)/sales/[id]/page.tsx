'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, ModalTitleBar, ModalBtn } from '@/components/ui/dialog'
import { ArrowLeft, Ban, Loader2, Plus, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { format } from '@/lib/utils/format'
import Decimal from 'decimal.js'
import { PhotoViewer } from '@/components/PhotoUploader'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type SaleLine = {
  id: string
  quantity: string
  unitPrice: string
  lineTotal: string
  grossQty?: string
  tareQty?: string
  product: { id: string; code: string; name: string; unit: string }
}

type Sale = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  totalAmount: string
  amountPaid?: string
  paymentMethod: string
  buyerName: string
  buyerIdNumber?: string
  buyerPhone?: string
  notes?: string
  voidedAt?: string
  voidReason?: string
  photoR2Keys?: string[]
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

  const outstanding = sale.status === 'pending'
    ? new Decimal(sale.totalAmount).minus(new Decimal(sale.amountPaid ?? '0'))
    : new Decimal(0)

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/app/sales')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Sales
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 font-mono">{sale.refNumber}</h1>
            <p className="text-xs text-gray-400">{format.datetime(sale.createdAt)}</p>
          </div>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => router.push('/app/sales/new')}>
          <Plus className="w-4 h-4 mr-1.5" /> New Sale
        </Button>
      </div>

      {/* Voided banner */}
      {sale.status === 'voided' && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="font-semibold text-red-700">This sale has been voided</p>
          {sale.voidReason && <p className="text-sm text-red-600 mt-0.5">Reason: {sale.voidReason}</p>}
          {sale.voidedAt && <p className="text-xs text-red-400 mt-1">{format.datetime(sale.voidedAt)}</p>}
        </div>
      )}

      {/* Pending banner */}
      {sale.status === 'pending' && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="font-semibold text-amber-700">Payment outstanding</p>
          <p className="text-sm text-amber-600 mt-0.5">
            Balance due: <span className="font-mono font-bold">R {outstanding.toFixed(2)}</span>
            {sale.amountPaid && new Decimal(sale.amountPaid).gt(0) && (
              <span className="ml-3 text-amber-500">({`R ${new Decimal(sale.amountPaid).toFixed(2)} paid`})</span>
            )}
          </p>
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
            {sale.status === 'completed' && <Badge className="bg-green-100 text-green-700">Completed</Badge>}
            {sale.status === 'pending'   && <Badge className="bg-amber-100 text-amber-700">Pending</Badge>}
            {sale.status === 'voided'    && <Badge variant="destructive">Voided</Badge>}
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
                  <div>{Number(line.quantity).toFixed(2)} {line.product.unit}</div>
                  {line.grossQty && line.tareQty && Number(line.tareQty) > 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Gross: {Number(line.grossQty).toFixed(2)}  Tare: {Number(line.tareQty).toFixed(2)}
                    </div>
                  )}
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

      {/* Photos */}
      {sale.photoR2Keys && sale.photoR2Keys.length > 0 && (
        <div className="bg-white rounded-xl border p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">Photos</h2>
          <div className="space-y-3">
            {sale.photoR2Keys.map((key) => (
              <PhotoViewer
                key={key}
                r2Key={key}
                alt="Sale photo"
                canDelete={isManager}
                onDelete={async () => {
                  const res = await fetch(`/api/sales/${sale.id}/photos`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ remove: key }),
                  })
                  if (res.ok) mutate(`/api/sales/${id}`)
                  else toast.error('Failed to remove photo')
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pb-6">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => window.open(`/api/sales/${sale.id}/receipt?format=pdf`, '_blank')}
          >
            <Printer className="w-4 h-4 mr-2" /> Print Receipt
          </Button>
        </div>
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
      <DialogContent className="sm:max-w-md p-4" showCloseButton={false}>
        <ModalTitleBar title="Void Sale" onClose={onClose} />
        <div className="space-y-4 mt-3">
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
            <ModalBtn variant="outline" onClick={onClose} disabled={loading}>Cancel</ModalBtn>
            <ModalBtn variant="danger" onClick={onConfirm} disabled={loading || reason.trim().length < 5}>
              {loading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Voiding...</> : 'Confirm Void'}
            </ModalBtn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
