'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Plus, Trash2, Loader2, User } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import Decimal from 'decimal.js'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Product = {
  id: string; code: string; name: string; category: string
  unit: string; defaultBuyPrice: string; defaultSellPrice: string
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

export default function NewSalePage() {
  const router = useRouter()

  // Buyer details
  const [buyerName, setBuyerName] = useState('')
  const [buyerIdNumber, setBuyerIdNumber] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')

  const [lines, setLines] = useState<LineItem[]>([{ key: 1, productId: '', product: null, quantity: '', unitPrice: '' }])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'eft' | 'cheque'>('cash')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [keyCounter, setKeyCounter] = useState(2)

  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products?active=true', fetcher)
  const products = productsData?.products ?? []

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

  function onProductSelect(key: number, productId: string) {
    const product = products.find((p) => p.id === productId) ?? null
    const unitPrice = product ? Number(product.defaultSellPrice).toFixed(2) : ''
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, productId, product, unitPrice } : l))
  }

  function updateLine(key: number, field: 'quantity' | 'unitPrice', value: string) {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l))
  }

  async function onSubmit() {
    if (!buyerName.trim()) { toast.error('Buyer name is required'); return }

    const validLines = lines.filter((l) => l.productId && l.quantity && l.unitPrice)
    if (validLines.length === 0) { toast.error('Add at least one product line'); return }

    for (const l of validLines) {
      if (parseFloat(l.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
      if (parseFloat(l.unitPrice) < 0) { toast.error('Unit price cannot be negative'); return }
    }

    setSubmitting(true)
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerName: buyerName.trim(),
        buyerIdNumber: buyerIdNumber.trim() || undefined,
        buyerPhone: buyerPhone.trim() || undefined,
        paymentMethod,
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
      toast.success(`Sale ${data.refNumber} created`)
      router.push(`/app/sales/${data.id}`)
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to create sale')
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Sale</h1>
          <p className="text-sm text-gray-500">Sell recyclable material to a buyer</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Buyer Details */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-green-600" /> Buyer Details
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <Label>Buyer Name <span className="text-red-500">*</span></Label>
              <Input
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Company or person name"
                className="mt-1"
              />
            </div>
            <div>
              <Label>ID Number <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                value={buyerIdNumber}
                onChange={(e) => setBuyerIdNumber(e.target.value)}
                placeholder="13 digits"
                className="mt-1 font-mono"
                maxLength={13}
              />
            </div>
            <div>
              <Label>Phone <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="e.g. 0821234567"
                className="mt-1"
              />
            </div>
          </div>
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
            <div className="grid grid-cols-[1fr_120px_130px_100px_32px] gap-3 px-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sell Price (R)</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Total</p>
              <span />
            </div>

            {lines.map((line) => {
              const qty = parseFloat(line.quantity) || 0
              const price = parseFloat(line.unitPrice) || 0
              const lineTotal = new Decimal(qty).times(price)

              return (
                <div key={line.key} className="grid grid-cols-[1fr_120px_130px_100px_32px] gap-3 items-center">
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

                  <Input
                    placeholder="0.000"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, 'quantity', e.target.value)}
                    className="font-mono text-sm"
                  />

                  <Input
                    placeholder="0.00"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, 'unitPrice', e.target.value)}
                    className="font-mono text-sm"
                  />

                  <p className="font-mono text-sm text-gray-700 text-right">
                    {qty > 0 && price > 0 ? `R ${lineTotal.toFixed(2)}` : '—'}
                  </p>

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

          <div className="border-t mt-4 pt-4 flex justify-end">
            <div className="text-right">
              <p className="text-sm text-gray-500">Total Amount</p>
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
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any remarks..." className="mt-1" />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-6">
          <Button variant="outline" onClick={() => router.back()} disabled={submitting}>Cancel</Button>
          <Button
            className="bg-green-600 hover:bg-green-700 min-w-[140px]"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              : `Confirm Sale · R ${total.toFixed(2)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
