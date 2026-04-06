'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Plus, Trash2, Loader2, User, AlertTriangle, PenLine, FileText } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { CustomerLookupWidget } from '@/components/CustomerLookupWidget'
import { SignatureCanvas, SignatureCanvasHandle } from '@/components/SignatureCanvas'
import { PrintResultModal } from '@/components/PrintResultModal'
import Decimal from 'decimal.js'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Product = {
  id: string; code: string; name: string; category: string
  unit: string; defaultBuyPrice: string; defaultSellPrice: string
}

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; blacklisted: boolean; priceGroupId?: string | null
}

type LineItem = {
  key: number
  productId: string
  product: Product | null
  quantity: string
  unitPrice: string
}

const CATEGORY_LABELS: Record<string, string> = {
  ferrous: 'Ferrous', non_ferrous: 'Non-Ferrous', copper: 'Copper',
  aluminium: 'Aluminium', plastic: 'Plastic', paper: 'Paper', e_waste: 'E-Waste', other: 'Other',
}

export default function NewPurchasePage() {
  const router = useRouter()
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null)
  const [lines, setLines] = useState<LineItem[]>([{ key: 1, productId: '', product: null, quantity: '', unitPrice: '' }])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'eft' | 'cheque'>('cash')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [keyCounter, setKeyCounter] = useState(2)
  const [sigDialog,    setSigDialog]    = useState<{ purchaseId: string; refNumber: string } | null>(null)
  const [printDialog,  setPrintDialog]  = useState<{ id: string; refNumber: string } | null>(null)

  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products?active=true', fetcher)
  const products = productsData?.products ?? []

  // Group products by category for the dropdown
  const productsByCategory = products.reduce<Record<string, Product[]>>((acc, p) => {
    acc[p.category] = acc[p.category] ?? []
    acc[p.category]!.push(p)
    return acc
  }, {})

  const total = lines.reduce((sum, l) => {
    const qty = parseFloat(l.quantity) || 0
    const price = parseFloat(l.unitPrice) || 0
    return sum.plus(new Decimal(qty).times(price))
  }, new Decimal(0))

  function addLine() {
    setLines((prev) => [...prev, { key: keyCounter, productId: '', product: null, quantity: '', unitPrice: '' }])
    setKeyCounter((k) => k + 1)
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function onProductSelect(key: number, productId: string) {
    const product = products.find((p) => p.id === productId) ?? null

    // Resolve price for this customer's price group
    let unitPrice = product ? Number(product.defaultBuyPrice).toFixed(2) : ''
    if (product && customer?.priceGroupId) {
      try {
        const res = await fetch(`/api/products/${productId}?priceGroupId=${customer.priceGroupId}`)
        if (res.ok) {
          const data = await res.json()
          unitPrice = Number(data.defaultBuyPrice).toFixed(2)
        }
      } catch { /* use default */ }
    }

    setLines((prev) =>
      prev.map((l) => l.key === key ? { ...l, productId, product, unitPrice } : l)
    )
  }

  function updateLine(key: number, field: 'quantity' | 'unitPrice', value: string) {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l))
  }

  const handleCustomerSelect = useCallback((c: SelectedCustomer) => {
    setCustomer(c)
  }, [])

  async function submitPurchase(status: 'completed' | 'pending') {
    if (!customer) { toast.error('Please select a customer'); return }

    const validLines = lines.filter((l) => l.productId && l.quantity && l.unitPrice)
    if (validLines.length === 0) { toast.error('Add at least one product line'); return }

    for (const l of validLines) {
      if (parseFloat(l.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
      if (parseFloat(l.unitPrice) < 0) { toast.error('Unit price cannot be negative'); return }
    }

    setSubmitting(true)
    const res = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customer.id,
        paymentMethod,
        status,
        notes: notes || undefined,
        lines: validLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      }),
    })
    setSubmitting(false)

    if (res.ok) {
      const data = await res.json()
      if (status === 'pending') {
        toast.success(`Purchase ${data.refNumber} saved as unpaid`)
        router.push('/app/purchases/unpaid')
      } else {
        // Show signature capture before redirect
        setSigDialog({ purchaseId: data.id, refNumber: data.refNumber })
      }
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to create purchase')
    }
  }

  function onSubmit() { return submitPurchase('completed') }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Purchase</h1>
          <p className="text-sm text-gray-500">Buy recyclable materials from a customer</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Customer Selection */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-green-600" /> Customer
          </h2>

          {!customer ? (
            <CustomerLookupWidget onSelect={handleCustomerSelect} />
          ) : (
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div>
                <p className="font-semibold text-gray-900">{customer.firstName} {customer.lastName}</p>
                <p className="text-sm text-gray-500 font-mono">{customer.idNumber} · {customer.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                {customer.priceGroupId && (
                  <Badge className="bg-blue-100 text-blue-700">Custom Pricing</Badge>
                )}
                <Button variant="outline" size="sm" onClick={() => setCustomer(null)}>
                  Change
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Product Lines */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Products</h2>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Line
            </Button>
          </div>

          <div className="space-y-3">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_120px_130px_100px_32px] gap-3 px-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Buy Price (R)</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Total</p>
              <span />
            </div>

            {lines.map((line) => {
              const qty = parseFloat(line.quantity) || 0
              const price = parseFloat(line.unitPrice) || 0
              const lineTotal = new Decimal(qty).times(price)

              return (
                <div key={line.key} className="grid grid-cols-[1fr_120px_130px_100px_32px] gap-3 items-center">
                  {/* Product selector */}
                  <select
                    className="border rounded-md px-3 py-2 text-sm bg-white w-full"
                    value={line.productId}
                    onChange={(e) => onProductSelect(line.key, e.target.value)}
                  >
                    <option value="">Select product...</option>
                    {Object.entries(productsByCategory).map(([cat, prods]) => (
                      <optgroup key={cat} label={CATEGORY_LABELS[cat] ?? cat}>
                        {prods.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unit})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  {/* Quantity */}
                  <Input
                    placeholder="0.000"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, 'quantity', e.target.value)}
                    className="font-mono text-sm"
                  />

                  {/* Unit Price */}
                  <Input
                    placeholder="0.00"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, 'unitPrice', e.target.value)}
                    className="font-mono text-sm"
                  />

                  {/* Line total */}
                  <p className="font-mono text-sm text-gray-700 text-right">
                    {qty > 0 && price > 0 ? `R ${lineTotal.toFixed(2)}` : '—'}
                  </p>

                  {/* Remove */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-red-500 p-1 h-8 w-8"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )
            })}
          </div>

          {/* Total */}
          <div className="border-t mt-4 pt-4 flex justify-end">
            <div className="text-right">
              <p className="text-sm text-gray-500">Total Payout</p>
              <p className="text-2xl font-bold text-gray-900">R {total.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Payment & Notes */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Payment & Notes</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="eft">EFT</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any remarks..."
                className="mt-1"
              />
            </div>
          </div>
        </div>

      {sigDialog && (
        <SignatureDialog
          purchaseId={sigDialog.purchaseId}
          refNumber={sigDialog.refNumber}
          onDone={() => {
            const { purchaseId, refNumber } = sigDialog
            setSigDialog(null)
            setPrintDialog({ id: purchaseId, refNumber })
          }}
        />
      )}

      {printDialog && (
        <PrintResultModal
          type="purchase"
          id={printDialog.id}
          refNumber={printDialog.refNumber}
          onClose={() => {
            router.push(`/app/purchases/${printDialog.id}`)
          }}
        />
      )}

        {/* Warning if blacklisted (should not happen due to lookup, but defensive) */}
        {customer?.blacklisted && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">This customer is blacklisted and cannot complete a purchase.</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-6">
          <Button variant="outline" onClick={() => router.back()} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className="border-orange-300 text-orange-700 hover:bg-orange-50 min-w-[130px]"
            onClick={() => submitPurchase('pending')}
            disabled={submitting || !customer || customer.blacklisted}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Save as Unpaid`}
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700 min-w-[160px]"
            onClick={onSubmit}
            disabled={submitting || !customer || customer.blacklisted}
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
              : `Confirm Purchase · R ${total.toFixed(2)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Signature Dialog ─────────────────────────────────────────────────────────
function SignatureDialog({
  purchaseId,
  refNumber,
  onDone,
}: {
  purchaseId: string
  refNumber:  string
  onDone:     () => void
}) {
  const sigRef  = useRef<SignatureCanvasHandle>(null)
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    const blob = await sigRef.current?.getBlob()
    if (!blob) {
      // Skip — no signature drawn, just navigate
      onDone()
      return
    }

    setSaving(true)
    try {
      // 1. Get presigned R2 upload URL
      const key = `purchases/${purchaseId}/signature.png`
      const urlRes = await fetch(`/api/r2/upload-url?key=${encodeURIComponent(key)}&contentType=image/png`)
      if (!urlRes.ok) throw new Error('Failed to get upload URL')
      const { url } = await urlRes.json() as { url: string }

      // 2. Upload signature to R2
      const uploadRes = await fetch(url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'image/png' },
      })
      if (!uploadRes.ok) throw new Error('Failed to upload signature')

      // 3. Save R2 key back to the purchase
      const patchRes = await fetch(`/api/purchases/${purchaseId}/signature`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureR2Key: key }),
      })
      if (!patchRes.ok) throw new Error('Failed to save signature reference')

      toast.success('Signature captured')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signature upload failed')
    } finally {
      setSaving(false)
      onDone()
    }
  }

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-green-600" />
            Seller Signature — {refNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <p className="text-sm text-gray-600">
            Please ask the seller to sign below to confirm the sale of goods.
            This signature will appear on the VAT264 declaration.
          </p>

          <SignatureCanvas ref={sigRef} width={450} height={130} />

          <div className="flex justify-between items-center pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => sigRef.current?.clear()}
              disabled={saving}
            >
              Clear
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onDone}
                disabled={saving}
              >
                Skip
              </Button>
              <Button
                type="button"
                className="bg-green-600 hover:bg-green-700"
                onClick={handleConfirm}
                disabled={saving}
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                  : <><FileText className="w-4 h-4 mr-2" />Confirm & View Purchase</>}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
