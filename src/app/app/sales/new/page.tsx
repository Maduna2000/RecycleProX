'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Plus, Trash2, Loader2, User, AlertTriangle, FileText } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import Decimal from 'decimal.js'
import { PrintResultModal } from '@/components/PrintResultModal'
import { CustomerLookupWidget } from '@/components/CustomerLookupWidget'
import { useOfflineMutation } from '@/hooks/useOfflineFetch'
import { offlineDB } from '@/lib/offline/db'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Product = {
  id: string; code: string; name: string; category: string
  unit: string; defaultBuyPrice: string; defaultSellPrice: string
}

type StockRow = { product: { id: string }; onHand: string }

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

type BuyerMode = 'registered' | 'walkin'

const CATEGORY_LABELS: Record<string, string> = {
  ferrous: 'Ferrous', non_ferrous: 'Non-Ferrous', copper: 'Copper',
  aluminium: 'Aluminium', plastic: 'Plastic', paper: 'Paper', e_waste: 'E-Waste', other: 'Other',
}

const emptyLine = (key: number): LineItem => ({
  key, productId: '', product: null, quantity: '', unitPrice: '',
})

export default function NewSalePage() {
  const router = useRouter()
  const { mutate: offlineMutate } = useOfflineMutation()

  // Buyer section
  const [buyerMode,     setBuyerMode]     = useState<BuyerMode>('walkin')
  const [customer,      setCustomer]      = useState<SelectedCustomer | null>(null)
  const [buyerName,     setBuyerName]     = useState('')
  const [buyerIdNumber, setBuyerIdNumber] = useState('')
  const [buyerPhone,    setBuyerPhone]    = useState('')

  const [lines,         setLines]         = useState<LineItem[]>([emptyLine(1)])
  const [keyCounter,    setKeyCounter]    = useState(2)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'eft' | 'cheque' | 'amplopay'>('cash')
  const [notes,         setNotes]         = useState('')
  const [submitting,    setSubmitting]    = useState(false)

  const [paymentDialog, setPaymentDialog] = useState<{
    saleId: string; refNumber: string; amount: string; method: string; buyerName: string
  } | null>(null)
  const [printDialog,   setPrintDialog]   = useState<{ id: string; refNumber: string } | null>(null)

  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products?active=true', fetcher)
  const { data: stockData }    = useSWR<{ stock: StockRow[] }>('/api/stock/on-hand', fetcher)

  const products = productsData?.products ?? []
  const stockMap = new Map((stockData?.stock ?? []).map((r) => [r.product.id, new Decimal(r.onHand ?? '0')]))

  const productsByCategory = products.reduce<Record<string, Product[]>>((acc, p) => {
    acc[p.category] = acc[p.category] ?? []
    acc[p.category]!.push(p)
    return acc
  }, {})

  const total = lines.reduce((sum, l) => {
    const qty   = new Decimal(l.quantity  || '0')
    const price = new Decimal(l.unitPrice || '0')
    return sum.plus(qty.times(price))
  }, new Decimal(0))

  function addLine() {
    setLines((prev) => [...prev, emptyLine(keyCounter)])
    setKeyCounter((k) => k + 1)
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function updateLine(key: number, field: 'quantity' | 'unitPrice', value: string) {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l))
  }

  async function onProductSelect(key: number, productId: string) {
    const product = products.find((p) => p.id === productId) ?? null
    let unitPrice = product ? new Decimal(product.defaultSellPrice).toFixed(2) : ''

    // Apply price group sell override for registered buyer
    if (product && customer?.priceGroupId) {
      try {
        const res = await fetch(`/api/products/${productId}?priceGroupId=${customer.priceGroupId}`)
        if (res.ok) {
          const data = await res.json() as { defaultSellPrice: string }
          if (data.defaultSellPrice) unitPrice = new Decimal(data.defaultSellPrice).toFixed(2)
        }
      } catch { /* use default */ }
    }

    setLines((prev) => prev.map((l) => l.key === key ? { ...l, productId, product, unitPrice } : l))
  }

  const handleCustomerSelect = useCallback((c: SelectedCustomer) => {
    setCustomer(c)
    // Re-apply sell prices with new price group
    setLines((prev) => prev.map((l) => l.product ? { ...l, unitPrice: new Decimal(l.product.defaultSellPrice).toFixed(2) } : l))
  }, [])

  function switchMode(mode: BuyerMode) {
    setBuyerMode(mode)
    setCustomer(null)
    setBuyerName('')
    setBuyerIdNumber('')
    setBuyerPhone('')
  }

  const effectiveBuyerName = buyerMode === 'registered' && customer
    ? `${customer.firstName} ${customer.lastName}`
    : buyerName

  const isBlacklisted = buyerMode === 'registered' && customer?.blacklisted === true

  async function onSubmit() {
    if (buyerMode === 'registered' && !customer) { toast.error('Select a buyer'); return }
    if (buyerMode === 'walkin' && !buyerName.trim()) { toast.error('Buyer name is required'); return }

    const validLines = lines.filter((l) => l.productId && l.quantity && l.unitPrice)
    if (validLines.length === 0) { toast.error('Add at least one product line'); return }
    for (const l of validLines) {
      if (parseFloat(l.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
      if (parseFloat(l.unitPrice) < 0)  { toast.error('Sell price cannot be negative'); return }
    }

    const body = {
      ...(buyerMode === 'registered' && customer ? { customerId: customer.id } : {}),
      buyerName: effectiveBuyerName.trim(),
      buyerIdNumber: (buyerMode === 'walkin' ? buyerIdNumber.trim() : customer?.idNumber ?? '') || undefined,
      buyerPhone:    (buyerMode === 'walkin' ? buyerPhone.trim()    : customer?.phone   ?? '') || undefined,
      paymentMethod,
      notes: notes || undefined,
      lines: validLines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
    }
    const localId = `local_${crypto.randomUUID()}`

    setSubmitting(true)
    try {
      const { queued, data } = await offlineMutate({ method: 'POST', url: '/api/sales', body, localId })

      if (queued) {
        await offlineDB.sales.add({
          id: localId, refNumber: `OFF-${Date.now()}`, buyerName: effectiveBuyerName.trim(),
          status: 'completed', totalAmount: total.toFixed(2), paymentMethod,
          notes: notes || undefined, createdAt: new Date().toISOString(), _offlineCreated: true,
        })
        for (const l of validLines) {
          await offlineDB.saleLines.add({
            id: `local_${crypto.randomUUID()}`, saleId: localId,
            productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice,
            lineTotal: new Decimal(l.quantity || '0').times(l.unitPrice || '0').toFixed(2),
          })
        }
        toast.success('Sale saved offline — will sync when connected')
        router.push('/app/sales')
      } else {
        const sale = data as { id: string; refNumber: string }
        toast.success(`Sale ${sale.refNumber} created`)
        setPaymentDialog({
          saleId: sale.id, refNumber: sale.refNumber,
          amount: total.toFixed(2), method: paymentMethod,
          buyerName: effectiveBuyerName.trim(),
        })
      }
    } catch {
      toast.error('Failed to create sale')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/app/sales')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Sales
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Sale</h1>
          <p className="text-sm text-gray-500">Sell recyclable material to a buyer</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Buyer Section */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <User className="w-4 h-4 text-green-600" /> Buyer
            </h2>
            {/* Toggle */}
            <div className="flex rounded-lg border overflow-hidden text-sm">
              <button
                className={`px-3 py-1.5 font-medium transition-colors ${buyerMode === 'registered' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => switchMode('registered')}
              >
                Registered
              </button>
              <button
                className={`px-3 py-1.5 font-medium transition-colors border-l ${buyerMode === 'walkin' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => switchMode('walkin')}
              >
                Walk-in
              </button>
            </div>
          </div>

          {buyerMode === 'registered' ? (
            !customer ? (
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
            )
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <Label>Buyer Name <span className="text-red-500">*</span></Label>
                <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Company or person name" className="mt-1" />
              </div>
              <div>
                <Label>ID Number <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input value={buyerIdNumber} onChange={(e) => setBuyerIdNumber(e.target.value)} placeholder="13 digits" className="mt-1 font-mono" maxLength={13} />
              </div>
              <div>
                <Label>Phone <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="e.g. 0821234567" className="mt-1" />
              </div>
            </div>
          )}
        </div>

        {/* Blacklist warning */}
        {isBlacklisted && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">This customer is blacklisted and cannot complete a sale.</p>
          </div>
        )}

        {/* Product Lines */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Products</h2>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Line
            </Button>
          </div>

          <div className="grid grid-cols-[1fr_120px_130px_100px_32px] gap-3 px-1 mb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sell Price (R)</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Total</p>
            <span />
          </div>

          <div className="space-y-2">
            {lines.map((line) => {
              const qty        = new Decimal(line.quantity  || '0')
              const price      = new Decimal(line.unitPrice || '0')
              const lineTotal  = qty.times(price)
              const onHand     = line.productId ? (stockMap.get(line.productId) ?? new Decimal(0)) : null
              const overStock  = onHand !== null && qty.gt(new Decimal(0)) && qty.gt(onHand)

              return (
                <div key={line.key} className={`rounded-lg border ${overStock ? 'border-red-200 bg-red-50/30' : 'border-gray-100 bg-gray-50/40'}`}>
                  <div className="grid grid-cols-[1fr_120px_130px_100px_32px] gap-3 items-center p-2">
                    <div>
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
                      {onHand !== null && (
                        <p className={`text-xs mt-0.5 pl-1 ${overStock ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                          {overStock ? `⚠ Exceeds stock (${onHand.toFixed(3)} available)` : `Stock: ${onHand.toFixed(3)}`}
                        </p>
                      )}
                    </div>

                    <Input
                      placeholder="0.000"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, 'quantity', e.target.value)}
                      className={`font-mono text-sm ${overStock ? 'border-red-300' : ''}`}
                    />

                    <Input
                      placeholder="0.00"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.key, 'unitPrice', e.target.value)}
                      className="font-mono text-sm"
                    />

                    <p className="font-mono text-sm text-gray-700 text-right">
                      {qty.gt(0) && price.gt(0) ? `R ${lineTotal.toFixed(2)}` : '—'}
                    </p>

                    <Button
                      variant="ghost" size="sm"
                      className="text-gray-400 hover:text-red-500 p-1 h-8 w-8"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t mt-4 pt-4 flex justify-end">
            <div className="text-right">
              <p className="text-sm text-gray-500">Total</p>
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
                  <SelectItem value="amplopay">AmploPay</SelectItem>
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
          <Button variant="outline" onClick={() => router.push('/app/sales')} disabled={submitting}>Cancel</Button>
          <Button
            className="bg-green-600 hover:bg-green-700 min-w-[160px]"
            onClick={onSubmit}
            disabled={submitting || isBlacklisted || (buyerMode === 'registered' && !customer)}
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
              : `Confirm Sale · R ${total.toFixed(2)}`}
          </Button>
        </div>
      </div>

      {/* Payment received step */}
      {paymentDialog && (
        <PaymentReceivedStep
          saleId={paymentDialog.saleId}
          refNumber={paymentDialog.refNumber}
          amount={paymentDialog.amount}
          method={paymentDialog.method}
          buyerName={paymentDialog.buyerName}
          onDone={() => {
            const { saleId, refNumber } = paymentDialog
            setPaymentDialog(null)
            setPrintDialog({ id: saleId, refNumber })
          }}
        />
      )}

      {printDialog && (
        <PrintResultModal
          type="sale"
          id={printDialog.id}
          refNumber={printDialog.refNumber}
          onClose={() => router.push('/app/sales/new')}
          onViewPurchase={() => router.push(`/app/sales/${printDialog.id}`)}
        />
      )}
    </div>
  )
}

// ─── Payment Received Step ────────────────────────────────────────────────────
function PaymentReceivedStep({
  refNumber, amount, method, buyerName, onDone,
}: {
  saleId: string; refNumber: string; amount: string; method: string; buyerName: string; onDone: () => void
}) {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'eft' | 'cheque' | 'amplopay'>(method as 'cash' | 'eft' | 'cheque' | 'amplopay')

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" />
            Collect Payment — {refNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Collect from</p>
            <p className="font-semibold text-gray-900">{buyerName}</p>
            <p className="text-3xl font-bold text-green-700 font-mono mt-2">R {amount}</p>
          </div>

          <div>
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="amplopay">AmploPay</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full bg-green-600 hover:bg-green-700 h-11 text-base font-semibold"
            onClick={onDone}
          >
            Payment Received — Print Receipt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
