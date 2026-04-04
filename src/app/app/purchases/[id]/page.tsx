'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Ban, Loader2, Printer, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { format } from '@/lib/utils/format'
import { PhotoUploader, PhotoViewer } from '@/components/PhotoUploader'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type PurchaseLine = {
  id: string
  quantity: string
  unitPrice: string
  lineTotal: string
  priceSource: string
  product: { id: string; code: string; name: string; unit: string; category: string }
}

type Purchase = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  totalAmount: string
  paymentMethod: string
  notes?: string
  voidedAt?: string
  voidReason?: string
  createdAt: string
  updatedAt: string
  createdByUserId?: string
  photoR2Keys?: string[]
  customer: {
    id: string; firstName: string; lastName: string; idNumber: string; phone: string
  }
  lines: PurchaseLine[]
}

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const [voidOpen, setVoidOpen] = useState(false)

  const { data: purchase, isLoading } = useSWR<Purchase>(`/api/purchases/${id}`, fetcher)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
  if (!purchase) return <div className="flex items-center justify-center h-64 text-gray-400">Purchase not found</div>

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      {/* Voided banner */}
      {purchase.status === 'voided' && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="font-semibold text-red-700">This purchase has been voided</p>
          {purchase.voidReason && <p className="text-sm text-red-600 mt-0.5">Reason: {purchase.voidReason}</p>}
          {purchase.voidedAt && <p className="text-xs text-red-400 mt-1">{format.datetime(purchase.voidedAt)}</p>}
        </div>
      )}

      {/* Purchase card */}
      <div className="bg-white rounded-xl border p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Purchase</p>
            <h1 className="text-2xl font-bold text-gray-900 font-mono mt-0.5">{purchase.refNumber}</h1>
            <p className="text-sm text-gray-500 mt-1">{format.datetime(purchase.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            {purchase.status === 'completed'
              ? <Badge className="bg-green-100 text-green-700">Completed</Badge>
              : <Badge variant="destructive">Voided</Badge>}
            <Badge variant="outline" className="capitalize">{purchase.paymentMethod}</Badge>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Customer</p>
            <p className="font-semibold text-gray-900">{purchase.customer.firstName} {purchase.customer.lastName}</p>
            <p className="text-gray-500 font-mono">{purchase.customer.idNumber}</p>
            <p className="text-gray-500">{purchase.customer.phone}</p>
          </div>
          {purchase.notes && (
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Notes</p>
              <p className="text-gray-700">{purchase.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-xl border overflow-hidden mb-4">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Products Purchased</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Product', 'Qty', 'Unit Price', 'Line Total'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {purchase.lines.map((line) => (
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
              <td colSpan={3} className="px-4 py-3 text-right font-semibold text-gray-700">Total Payout</td>
              <td className="px-4 py-3 font-mono font-bold text-lg text-gray-900">
                R {Number(purchase.totalAmount).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Photos */}
      {purchase.status !== 'voided' && (
        <div className="bg-white rounded-xl border p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="w-4 h-4 text-green-600" />
            <h2 className="font-semibold text-gray-900">Product Photos</h2>
          </div>
          <PurchasePhotos purchaseId={purchase.id} />
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pb-6">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" /> Print Receipt
        </Button>
        {isManager && purchase.status !== 'voided' && (
          <Button
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setVoidOpen(true)}
          >
            <Ban className="w-4 h-4 mr-2" /> Void Purchase
          </Button>
        )}
      </div>

      {voidOpen && (
        <VoidModal
          purchase={purchase}
          onClose={() => setVoidOpen(false)}
          onSuccess={() => {
            mutate(`/api/purchases/${id}`)
            setVoidOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Purchase Photos ─────────────────────────────────────────────────────────
function PurchasePhotos({ purchaseId }: { purchaseId: string }) {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  // Store keys locally — in a full M9 these would be persisted on the Purchase record
  // For now we use local state (resets on page reload); a future migration adds photoR2Keys[]
  const [keys, setKeys] = useState<string[]>([])

  function handleUploaded(key: string) {
    setKeys((prev) => [...prev, key])
  }

  async function handleDelete(key: string) {
    const res = await fetch('/api/r2/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k !== key))
      toast.success('Photo deleted')
    }
  }

  return (
    <div className="space-y-3">
      {keys.map((k) => (
        <PhotoViewer
          key={k}
          r2Key={k}
          alt="Purchase photo"
          canDelete={isManager}
          onDelete={() => handleDelete(k)}
        />
      ))}
      <PhotoUploader
        context="purchase_photo"
        referenceId={purchaseId}
        label="Add Product Photo"
        onUploaded={handleUploaded}
      />
    </div>
  )
}

// ─── Void Modal ───────────────────────────────────────────────────────────────
function VoidModal({ purchase, onClose, onSuccess }: { purchase: Purchase; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    if (reason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setLoading(true)
    const res = await fetch(`/api/purchases/${purchase.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Purchase voided'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to void purchase') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">Void Purchase</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-gray-600">
            You are about to void <span className="font-semibold">{purchase.refNumber}</span> (R {Number(purchase.totalAmount).toFixed(2)}).
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
