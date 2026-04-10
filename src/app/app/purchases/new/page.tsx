'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ArrowLeft, Plus, Trash2, Loader2, User, AlertTriangle,
  PenLine, FileText, Scale, RefreshCw,
} from 'lucide-react'
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
  quantity: string      // net (what gets submitted)
  grossQty: string
  tareQty: string
  unitPrice: string
  weighMode: boolean    // show gross/tare row
  selectedScale: '1' | '2' | '3'
  weighingGross: boolean
  weighingTare: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  ferrous: 'Ferrous', non_ferrous: 'Non-Ferrous', copper: 'Copper',
  aluminium: 'Aluminium', plastic: 'Plastic', paper: 'Paper', e_waste: 'E-Waste', other: 'Other',
}

const emptyLine = (key: number): LineItem => ({
  key, productId: '', product: null, quantity: '', grossQty: '', tareQty: '',
  unitPrice: '', weighMode: false, selectedScale: '1',
  weighingGross: false, weighingTare: false,
})

// ─── useScaleRead hook ────────────────────────────────────────────────────────

function useScaleRead() {
  return async (scaleNumber: '1' | '2' | '3'): Promise<string> => {
    const res = await fetch(`/api/scales/${scaleNumber}/read`)
    if (!res.ok) {
      const j = await res.json() as { error?: string }
      throw new Error(j.error ?? 'Scale error')
    }
    const j = await res.json() as { weight: string }
    return j.weight
  }
}

export default function NewPurchasePage() {
  const router = useRouter()
  const readScale = useScaleRead()

  const [customer, setCustomer] = useState<SelectedCustomer | null>(null)
  const [lines, setLines] = useState<LineItem[]>([emptyLine(1)])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'eft' | 'cheque'>('cash')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [keyCounter, setKeyCounter] = useState(2)
  const [sigDialog,   setSigDialog]   = useState<{ purchaseId: string; refNumber: string } | null>(null)
  const [printDialog, setPrintDialog] = useState<{ id: string; refNumber: string } | null>(null)

  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products?active=true', fetcher)
  const products = productsData?.products ?? []

  const productsByCategory = products.reduce<Record<string, Product[]>>((acc, p) => {
    acc[p.category] = acc[p.category] ?? []
    acc[p.category]!.push(p)
    return acc
  }, {})

  const total = lines.reduce((sum, l) => {
    const qty   = new Decimal(l.quantity   || '0')
    const price = new Decimal(l.unitPrice  || '0')
    return sum.plus(qty.times(price))
  }, new Decimal(0))

  function addLine() {
    setLines((prev) => [...prev, emptyLine(keyCounter)])
    setKeyCounter((k) => k + 1)
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function patchLine(key: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, ...patch } : l))
  }

  /** Recompute net quantity from gross - tare and write to quantity field */
  function recomputeNet(key: number, grossStr: string, tareStr: string) {
    const gross = new Decimal(grossStr || '0')
    const tare  = new Decimal(tareStr  || '0')
    const net   = Decimal.max(gross.minus(tare), new Decimal('0'))
    patchLine(key, { quantity: net.toFixed(3), grossQty: grossStr, tareQty: tareStr })
  }

  async function onProductSelect(key: number, productId: string) {
    const product = products.find((p) => p.id === productId) ?? null
    let unitPrice = product ? new Decimal(product.defaultBuyPrice).toFixed(2) : ''
    if (product && customer?.priceGroupId) {
      try {
        const res = await fetch(`/api/products/${productId}?priceGroupId=${customer.priceGroupId}`)
        if (res.ok) {
          const data = await res.json() as { defaultBuyPrice: string }
          unitPrice = new Decimal(data.defaultBuyPrice).toFixed(2)
        }
      } catch { /* use default */ }
    }
    patchLine(key, { productId, product, unitPrice })
  }

  async function handleWeighGross(line: LineItem) {
    patchLine(line.key, { weighingGross: true })
    try {
      const weight = await readScale(line.selectedScale)
      recomputeNet(line.key, weight, line.tareQty)
      toast.success(`Gross: ${weight} kg`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scale not responding')
    } finally {
      patchLine(line.key, { weighingGross: false })
    }
  }

  async function handleWeighTare(line: LineItem) {
    patchLine(line.key, { weighingTare: true })
    try {
      const weight = await readScale(line.selectedScale)
      recomputeNet(line.key, line.grossQty, weight)
      toast.success(`Tare: ${weight} kg`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scale not responding')
    } finally {
      patchLine(line.key, { weighingTare: false })
    }
  }

  const handleCustomerSelect = useCallback((c: SelectedCustomer) => setCustomer(c), [])

  async function submitPurchase(status: 'completed' | 'pending') {
    if (!customer) { toast.error('Please select a customer'); return }

    const validLines = lines.filter((l) => l.productId && l.quantity && l.unitPrice)
    if (validLines.length === 0) { toast.error('Add at least one product line'); return }

    for (const l of validLines) {
      if (parseFloat(l.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
      if (parseFloat(l.unitPrice) < 0)  { toast.error('Unit price cannot be negative'); return }
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
          quantity:  l.quantity,
          unitPrice: l.unitPrice,
          ...(l.grossQty ? { grossQty: l.grossQty } : {}),
          ...(l.tareQty  ? { tareQty:  l.tareQty  } : {}),
        })),
      }),
    })
    setSubmitting(false)

    if (res.ok) {
      const data = await res.json() as { id: string; refNumber: string }
      if (status === 'pending') {
        toast.success(`Purchase ${data.refNumber} saved as unpaid`)
        router.push('/app/purchases/unpaid')
      } else {
        setSigDialog({ purchaseId: data.id, refNumber: data.refNumber })
      }
    } else {
      const j = await res.json() as { error?: string }
      toast.error(j.error ?? 'Failed to create purchase')
    }
  }

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
        {/* Customer */}
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
                {customer.priceGroupId && <Badge className="bg-blue-100 text-blue-700">Custom Pricing</Badge>}
                <Button variant="outline" size="sm" onClick={() => setCustomer(null)}>Change</Button>
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

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_140px_120px_100px_40px_32px] gap-2 px-1 mb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Net Qty (kg)</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Buy Price (R)</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Total</p>
            <span />
            <span />
          </div>

          <div className="space-y-2">
            {lines.map((line) => {
              const qty        = new Decimal(line.quantity  || '0')
              const price      = new Decimal(line.unitPrice || '0')
              const lineTotal  = qty.times(price)
              const busyGross  = line.weighingGross
              const busyTare   = line.weighingTare

              return (
                <div key={line.key} className="rounded-lg border border-gray-100 bg-gray-50/40">
                  {/* Main row */}
                  <div className="grid grid-cols-[1fr_140px_120px_100px_40px_32px] gap-2 items-center p-2">
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
                            <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>

                    {/* Net Qty */}
                    <Input
                      placeholder="0.000"
                      value={line.quantity}
                      onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                      className="font-mono text-sm"
                    />

                    {/* Unit Price */}
                    <Input
                      placeholder="0.00"
                      value={line.unitPrice}
                      onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })}
                      className="font-mono text-sm"
                    />

                    {/* Line total */}
                    <p className="font-mono text-sm text-gray-700 text-right">
                      {qty.gt(0) && price.gt(0) ? `R ${lineTotal.toFixed(2)}` : '—'}
                    </p>

                    {/* Weigh toggle */}
                    <Button
                      variant={line.weighMode ? 'default' : 'outline'}
                      size="sm"
                      className={`h-8 w-8 p-0 ${line.weighMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'text-gray-500'}`}
                      title="Toggle scale weighing mode"
                      onClick={() => patchLine(line.key, { weighMode: !line.weighMode })}
                    >
                      <Scale className="w-3.5 h-3.5" />
                    </Button>

                    {/* Remove */}
                    <Button
                      variant="ghost" size="sm"
                      className="text-gray-400 hover:text-red-500 p-1 h-8 w-8"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Weigh mode sub-row */}
                  {line.weighMode && (
                    <div className="px-3 pb-3 pt-0 border-t border-blue-100 bg-blue-50/40">
                      <div className="flex items-end gap-3 mt-2 flex-wrap">
                        {/* Scale selector */}
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-gray-500">Scale</Label>
                          <Select
                            value={line.selectedScale}
                            onValueChange={(v) => patchLine(line.key, { selectedScale: v as '1' | '2' | '3' })}
                          >
                            <SelectTrigger className="h-8 w-28 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Scale 1</SelectItem>
                              <SelectItem value="2">Scale 2</SelectItem>
                              <SelectItem value="3">Scale 3</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Gross */}
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-gray-500">Gross (kg)</Label>
                          <div className="flex gap-1.5">
                            <Input
                              placeholder="0.000"
                              value={line.grossQty}
                              onChange={(e) => recomputeNet(line.key, e.target.value, line.tareQty)}
                              className="h-8 w-24 font-mono text-sm"
                            />
                            <Button
                              size="sm"
                              className="h-8 px-2 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                              disabled={busyGross}
                              onClick={() => handleWeighGross(line)}
                              title="Read gross weight from scale"
                            >
                              {busyGross
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <RefreshCw className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>

                        {/* Tare */}
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-gray-500">Tare (kg)</Label>
                          <div className="flex gap-1.5">
                            <Input
                              placeholder="0.000"
                              value={line.tareQty}
                              onChange={(e) => recomputeNet(line.key, line.grossQty, e.target.value)}
                              className="h-8 w-24 font-mono text-sm"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 shrink-0"
                              disabled={busyTare}
                              onClick={() => handleWeighTare(line)}
                              title="Read tare weight from scale"
                            >
                              {busyTare
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <RefreshCw className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>

                        {/* Net display */}
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-gray-500">Net (kg)</Label>
                          <div className="h-8 flex items-center px-3 rounded-md border bg-white font-mono text-sm font-semibold text-green-700 min-w-[72px]">
                            {line.quantity || '0.000'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
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
          <h2 className="font-semibold text-gray-900 mb-4">Payment &amp; Notes</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
            onClose={() => router.push(`/app/purchases/${printDialog.id}`)}
          />
        )}

        {customer?.blacklisted && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">This customer is blacklisted and cannot complete a purchase.</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-6">
          <Button variant="outline" onClick={() => router.back()} disabled={submitting}>Cancel</Button>
          <Button
            variant="outline"
            className="border-orange-300 text-orange-700 hover:bg-orange-50 min-w-[130px]"
            onClick={() => submitPurchase('pending')}
            disabled={submitting || !customer || customer.blacklisted}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save as Unpaid'}
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700 min-w-[160px]"
            onClick={() => submitPurchase('completed')}
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
  purchaseId, refNumber, onDone,
}: { purchaseId: string; refNumber: string; onDone: () => void }) {
  const sigRef  = useRef<SignatureCanvasHandle>(null)
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    const blob = await sigRef.current?.getBlob()
    if (!blob) { onDone(); return }

    setSaving(true)
    try {
      const key    = `purchases/${purchaseId}/signature.png`
      const urlRes = await fetch(`/api/r2/upload-url?key=${encodeURIComponent(key)}&contentType=image/png`)
      if (!urlRes.ok) throw new Error('Failed to get upload URL')
      const { url } = await urlRes.json() as { url: string }

      const uploadRes = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/png' } })
      if (!uploadRes.ok) throw new Error('Failed to upload signature')

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
            <Button type="button" variant="ghost" size="sm" onClick={() => sigRef.current?.clear()} disabled={saving}>Clear</Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onDone} disabled={saving}>Skip</Button>
              <Button type="button" className="bg-green-600 hover:bg-green-700" onClick={handleConfirm} disabled={saving}>
                {saving
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                  : <><FileText className="w-4 h-4 mr-2" />Confirm &amp; View Purchase</>}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
