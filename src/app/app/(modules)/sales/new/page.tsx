'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Trash2, Loader2, AlertTriangle, FileText } from 'lucide-react'
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
  id: string; firstName: string; lastName: string; idNumber: string | null
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

// ─── Field label for right panel ──────────────────────────────────────────────

function PosLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#8BA4D4' }}>
      {children}
    </p>
  )
}

// ─── NewSalePage ──────────────────────────────────────────────────────────────

export default function NewSalePage() {
  const router = useRouter()
  const { mutate: offlineMutate } = useOfflineMutation()

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
  const [printDialog, setPrintDialog] = useState<{ id: string; refNumber: string } | null>(null)

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
    return sum.plus(new Decimal(l.quantity || '0').times(new Decimal(l.unitPrice || '0')))
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
    setLines((prev) => prev.map((l) => l.product
      ? { ...l, unitPrice: new Decimal(l.product.defaultSellPrice).toFixed(2) }
      : l
    ))
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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">

      {/* Top strip */}
      <div className="flex items-center gap-3 shrink-0 pb-2">
        <button
          type="button"
          onClick={() => router.push('/app/sales')}
          className="flex items-center gap-1 text-xs transition-colors"
          style={{ color: '#6C757D' }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Sales
        </button>
        <span className="text-sm font-semibold" style={{ color: '#212529' }}>New Sale</span>
        {isBlacklisted && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700">
            <AlertTriangle className="w-3 h-3" /> Blacklisted — cannot process
          </span>
        )}
      </div>

      {/* ── POS Split Panel ── */}
      <div
        className="flex-1 min-h-0 flex overflow-hidden rounded-xl border"
        style={{ borderColor: '#E0E0E0', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
      >

        {/* ─── LEFT: Entry ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white" style={{ borderRight: '1px solid #E0E0E0' }}>

          {/* Buyer strip */}
          <div className="shrink-0" style={{ borderBottom: '1px solid #E0E0E0', background: '#F8F9FA' }}>
            {/* Mode toggle */}
            <div className="flex items-center gap-0 px-3 pt-2 pb-0">
              <button
                type="button"
                onClick={() => switchMode('walkin')}
                className="px-3 py-1 text-[11px] font-semibold rounded-t-md transition-colors"
                style={buyerMode === 'walkin'
                  ? { background: '#fff', color: '#212529', border: '1px solid #E0E0E0', borderBottom: '1px solid #fff', marginBottom: -1 }
                  : { background: 'transparent', color: '#6C757D' }
                }
              >
                Walk-in
              </button>
              <button
                type="button"
                onClick={() => switchMode('registered')}
                className="px-3 py-1 text-[11px] font-semibold rounded-t-md transition-colors"
                style={buyerMode === 'registered'
                  ? { background: '#fff', color: '#212529', border: '1px solid #E0E0E0', borderBottom: '1px solid #fff', marginBottom: -1 }
                  : { background: 'transparent', color: '#6C757D' }
                }
              >
                Registered
              </button>
            </div>

            {/* Buyer input area */}
            <div className="px-3 py-2" style={{ background: '#fff', borderTop: '1px solid #E0E0E0' }}>
              {buyerMode === 'registered' ? (
                !customer ? (
                  <CustomerLookupWidget onSelect={handleCustomerSelect} />
                ) : (
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                      style={{ background: '#217346' }}
                    >
                      {customer.firstName[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold leading-none truncate" style={{ color: '#212529' }}>
                        {customer.firstName} {customer.lastName}
                      </p>
                      <p className="text-[11px] font-mono mt-0.5 truncate" style={{ color: '#6C757D' }}>
                        {customer.idNumber} · {customer.phone}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {customer.priceGroupId && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                          Custom Pricing
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setCustomer(null)}
                        className="px-2 py-0.5 rounded border text-[11px] transition-colors hover:bg-gray-50"
                        style={{ borderColor: '#E0E0E0', color: '#6C757D' }}
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] font-medium mb-0.5" style={{ color: '#6C757D' }}>
                      Buyer Name <span className="text-red-500">*</span>
                    </p>
                    <input
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Name or company…"
                      className="h-8 w-full rounded border px-2 text-[12px] focus:outline-none transition-colors"
                      style={{ borderColor: '#E0E0E0', color: '#212529' }}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium mb-0.5" style={{ color: '#6C757D' }}>ID Number</p>
                    <input
                      value={buyerIdNumber}
                      onChange={(e) => setBuyerIdNumber(e.target.value)}
                      placeholder="13 digits"
                      maxLength={13}
                      className="h-8 w-full rounded border px-2 text-[12px] font-mono focus:outline-none transition-colors"
                      style={{ borderColor: '#E0E0E0', color: '#212529' }}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium mb-0.5" style={{ color: '#6C757D' }}>Phone</p>
                    <input
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="e.g. 0821234567"
                      className="h-8 w-full rounded border px-2 text-[12px] focus:outline-none transition-colors"
                      style={{ borderColor: '#E0E0E0', color: '#212529' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Column headers */}
          <div
            className="shrink-0 grid items-center px-3 py-1.5"
            style={{
              gridTemplateColumns: '1fr 104px 116px 92px 28px',
              gap: '8px',
              background: '#F8F9FA',
              borderBottom: '1px solid #E0E0E0',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6C757D' }}>Product</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6C757D' }}>Qty</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6C757D' }}>Sell Price (R)</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-right" style={{ color: '#6C757D' }}>Total</p>
            <span />
          </div>

          {/* Items list — only scrollable zone */}
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ borderBottom: '1px solid #E0E0E0' }}>
            {lines.map((line) => {
              const qty       = new Decimal(line.quantity  || '0')
              const price     = new Decimal(line.unitPrice || '0')
              const lineTotal = qty.times(price)
              const onHand    = line.productId ? (stockMap.get(line.productId) ?? new Decimal(0)) : null
              const overStock = onHand !== null && qty.gt(new Decimal(0)) && qty.gt(onHand)

              return (
                <div
                  key={line.key}
                  style={{ borderBottom: '1px solid #F0F0F0', background: overStock ? '#FFF5F5' : undefined }}
                >
                  <div
                    className="grid items-start px-3 py-1.5"
                    style={{ gridTemplateColumns: '1fr 104px 116px 92px 28px', gap: '8px', minHeight: 44 }}
                  >
                    <div>
                      <select
                        className="h-8 w-full rounded border px-2 text-[12px] bg-white focus:outline-none transition-colors"
                        style={{
                          borderColor: overStock ? '#FCA5A5' : '#E0E0E0',
                          color: '#212529',
                        }}
                        value={line.productId}
                        onChange={(e) => onProductSelect(line.key, e.target.value)}
                      >
                        <option value="">Select product…</option>
                        {Object.entries(productsByCategory).map(([cat, prods]) => (
                          <optgroup key={cat} label={CATEGORY_LABELS[cat] ?? cat}>
                            {prods.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {onHand !== null && line.productId && (
                        <p
                          className="text-[10px] mt-0.5 pl-1 font-medium"
                          style={{ color: overStock ? '#EF4444' : '#9CA3AF' }}
                        >
                          {overStock
                            ? `⚠ Exceeds stock (${onHand.toFixed(3)} avail)`
                            : `Stock: ${onHand.toFixed(3)}`}
                        </p>
                      )}
                    </div>

                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.000"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, 'quantity', e.target.value)}
                      className="h-8 w-full rounded border px-2 text-[12px] font-mono focus:outline-none transition-colors"
                      style={{
                        borderColor: overStock ? '#FCA5A5' : '#E0E0E0',
                        color: '#212529',
                      }}
                    />

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.key, 'unitPrice', e.target.value)}
                      className="h-8 w-full rounded border px-2 text-[12px] font-mono focus:outline-none transition-colors"
                      style={{ borderColor: '#E0E0E0', color: '#212529' }}
                    />

                    <p
                      className="text-[13px] font-mono font-semibold text-right tabular-nums pr-1 pt-1"
                      style={{ color: qty.gt(0) && price.gt(0) ? '#212529' : '#C0C0C0' }}
                    >
                      {qty.gt(0) && price.gt(0) ? `R ${lineTotal.toFixed(2)}` : '—'}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                      className="h-8 w-7 rounded flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed mt-0"
                      style={{ color: '#C0C0C0' }}
                      onMouseEnter={(e) => { if (lines.length > 1) (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#C0C0C0' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Add line */}
            <div className="px-3 py-2">
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-1.5 text-[12px] font-medium transition-colors"
                style={{ color: '#185ABD' }}
              >
                <Plus className="w-3.5 h-3.5" /> Add Line
              </button>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: Totals & Actions ──────────────────────────── */}
        <div
          className="w-[260px] shrink-0 flex flex-col"
          style={{ background: '#1B3A6B' }}
        >
          {/* Payment method */}
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <PosLabel>Payment Method</PosLabel>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
              className="w-full h-9 rounded px-2.5 text-[12px] text-white focus:outline-none appearance-none"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)' }}
            >
              <option value="cash"     className="bg-white text-[#212529]">Cash</option>
              <option value="eft"      className="bg-white text-[#212529]">EFT</option>
              <option value="cheque"   className="bg-white text-[#212529]">Cheque</option>
              <option value="amplopay" className="bg-white text-[#212529]">AmploPay</option>
            </select>
          </div>

          {/* Notes */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <PosLabel>Notes (optional)</PosLabel>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any remarks…"
              className="w-full h-8 rounded px-2.5 text-[12px] text-white focus:outline-none"
              style={{
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.20)',
              }}
            />
          </div>

          {/* Total */}
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#8BA4D4' }}>
                Sale Total
              </p>
              <p className="font-bold tabular-nums" style={{ color: '#F2AB1A', fontSize: 42, lineHeight: 1 }}>
                R {total.toFixed(2)}
              </p>
              {total.gt(0) && (
                <p className="text-[11px] mt-2 tabular-nums" style={{ color: '#8BA4D4' }}>
                  incl. VAT at 15%
                </p>
              )}
            </div>
          </div>

          {/* Action button */}
          <div className="px-4 pb-4 shrink-0">
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || isBlacklisted || (buyerMode === 'registered' && !customer)}
              className="w-full h-12 rounded text-[13px] font-bold text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: '#217346' }}
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : `Confirm Sale · R ${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'eft' | 'cheque' | 'amplopay'>(
    method as 'cash' | 'eft' | 'cheque' | 'amplopay'
  )

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
