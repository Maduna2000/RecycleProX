'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft, Plus, Trash2, Loader2, AlertTriangle,
  PenLine, FileText, Scale, RefreshCw, Camera,
} from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { CasualSelectorPanel } from '@/components/customers/CasualSelectorPanel'
import { AccountSelectorPanel } from '@/components/customers/AccountSelectorPanel'
import { SignatureCanvas, SignatureCanvasHandle } from '@/components/SignatureCanvas'
import { PrintResultModal } from '@/components/PrintResultModal'
import { PhotoUploader } from '@/components/PhotoUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Decimal from 'decimal.js'
import { useOfflineMutation } from '@/hooks/useOfflineFetch'
import { offlineDB } from '@/lib/offline/db'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Product = {
  id: string; code: string; name: string; category: string
  unit: string; defaultBuyPrice: string; defaultSellPrice: string
}

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; blacklisted: boolean; priceGroupId?: string | null
  tradeCommodities?: string[] | null; zeroRated?: boolean
}

const COMMODITY_MAP: Record<string, string[]> = {
  'Copper':                 ['copper'],
  'Aluminium':              ['aluminium'],
  'Steel (Ferrous)':        ['ferrous'],
  'Non-Ferrous Metals':     ['non_ferrous'],
  'Stainless Steel':        ['ferrous', 'non_ferrous'],
  'Lead':                   ['non_ferrous'],
  'Brass':                  ['non_ferrous'],
  'Iron':                   ['ferrous'],
  'E-Waste (Electronics)':  ['e_waste'],
  'Plastic':                ['plastic'],
  'Paper / Cardboard':      ['paper'],
  'Catalytic Converters':   ['other'],
  'Batteries':              ['other'],
  'Other':                  ['other'],
}

type LineItem = {
  key: number
  productId: string
  product: Product | null
  quantity: string
  grossQty: string
  tareQty: string
  tareReason: string
  unitPrice: string
  weighMode: boolean
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
  tareReason: '', unitPrice: '', weighMode: false, selectedScale: '1',
  weighingGross: false, weighingTare: false,
})

// ─── useScaleRead ─────────────────────────────────────────────────────────────

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

// ─── Field label helper ───────────────────────────────────────────────────────

function PosLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#8BA4D4' }}>
      {children}
    </p>
  )
}

// ─── NewPurchasePage ──────────────────────────────────────────────────────────

export default function NewPurchasePage() {
  const router    = useRouter()
  const readScale = useScaleRead()
  const { mutate: offlineMutate } = useOfflineMutation()

  const [customer,        setCustomer]        = useState<SelectedCustomer | null>(null)
  const [customerType,    setCustomerType]    = useState<'casual' | 'account' | null>(null)
  const [lines,           setLines]           = useState<LineItem[]>([emptyLine(1)])
  const [paymentMethod,   setPaymentMethod]   = useState<'cash' | 'eft' | 'cheque' | 'amplopay'>('cash')
  const [notes,           setNotes]           = useState('')
  const [submitting,      setSubmitting]      = useState(false)
  const [keyCounter,      setKeyCounter]      = useState(2)
  const [sigDialog,       setSigDialog]       = useState<{ purchaseId: string; refNumber: string } | null>(null)
  const [photoDialog,     setPhotoDialog]     = useState<{ purchaseId: string; refNumber: string } | null>(null)
  const [payoutDialog,    setPayoutDialog]    = useState<{
    purchaseId: string; refNumber: string; amount: string; method: string
    customerId: string; customerName: string
  } | null>(null)
  const [printDialog,     setPrintDialog]     = useState<{ id: string; refNumber: string } | null>(null)
  const [deductLoan,      setDeductLoan]      = useState(false)
  const [deductionAmount, setDeductionAmount] = useState('')
  const [showAllProducts, setShowAllProducts] = useState(false)

  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products?active=true', fetcher)
  const products = productsData?.products ?? []

  const { data: loanData } = useSWR<{ summary: { outstanding: string; hasOutstanding: boolean } }>(
    customer ? `/api/customers/${customer.id}/loans?pageSize=1` : null,
    fetcher
  )
  const hasOutstandingLoan   = loanData?.summary?.hasOutstanding ?? false
  const outstandingLoanAmount = loanData?.summary?.outstanding ?? '0'

  const visibleProducts = (() => {
    const commodities = customer?.tradeCommodities
    if (showAllProducts || !commodities?.length) return products
    const allowed = new Set(commodities.flatMap((c) => COMMODITY_MAP[c] ?? []))
    return products.filter((p) => allowed.has(p.category))
  })()

  const productsByCategory = visibleProducts.reduce<Record<string, Product[]>>((acc, p) => {
    acc[p.category] = acc[p.category] ?? []
    acc[p.category]!.push(p)
    return acc
  }, {})

  const total = lines.reduce((sum, l) => {
    return sum.plus(new Decimal(l.quantity || '0').times(new Decimal(l.unitPrice || '0')))
  }, new Decimal(0))

  const cashToPay = deductLoan && deductionAmount && parseFloat(deductionAmount) > 0
    ? Decimal.max(total.minus(new Decimal(deductionAmount || '0')), new Decimal(0))
    : total

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

  const handleCustomerSelect = useCallback((c: SelectedCustomer) => {
    setCustomer(c)
    setDeductLoan(false)
    setDeductionAmount('')
    setShowAllProducts(false)
  }, [])

  async function submitPurchase(status: 'completed' | 'pending') {
    if (!customer) { toast.error('Please select a customer'); return }
    const validLines = lines.filter((l) => l.productId && l.quantity && l.unitPrice)
    if (validLines.length === 0) { toast.error('Add at least one product line'); return }
    for (const l of validLines) {
      if (parseFloat(l.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
      if (parseFloat(l.unitPrice) < 0)  { toast.error('Unit price cannot be negative'); return }
    }
    const deduction = deductLoan && deductionAmount && parseFloat(deductionAmount) > 0
      ? deductionAmount : undefined
    if (deduction && new Decimal(deduction).greaterThan(total)) {
      toast.error('Loan deduction cannot exceed the gross payout total'); return
    }
    const body = {
      customerId: customer.id, paymentMethod, status,
      notes: notes || undefined,
      ...(deduction ? { loanDeductionAmount: deduction } : {}),
      lines: validLines.map((l) => ({
        productId:  l.productId, quantity: l.quantity, unitPrice: l.unitPrice,
        ...(l.grossQty   ? { grossQty:   l.grossQty   } : {}),
        ...(l.tareQty    ? { tareQty:    l.tareQty    } : {}),
        ...(l.tareReason ? { tareReason: l.tareReason } : {}),
      })),
    }
    const localId = `local_${crypto.randomUUID()}`
    setSubmitting(true)
    try {
      const { queued, data } = await offlineMutate({ method: 'POST', url: '/api/purchases', body, localId })
      if (queued) {
        await offlineDB.purchases.add({
          id: localId, refNumber: `OFF-${Date.now()}`, customerId: customer.id,
          status, totalAmount: total.toFixed(2), paymentMethod,
          notes: notes || undefined, createdAt: new Date().toISOString(), _offlineCreated: true,
        })
        for (const l of validLines) {
          await offlineDB.purchaseLines.add({
            id: `local_${crypto.randomUUID()}`, purchaseId: localId,
            productId: l.productId, quantity: l.quantity,
            grossQty: l.grossQty || undefined, tareQty: l.tareQty || undefined,
            tareReason: l.tareReason || undefined, unitPrice: l.unitPrice,
            lineTotal: new Decimal(l.quantity || '0').times(l.unitPrice || '0').toFixed(2),
            priceSource: 'default',
          })
        }
        toast.success('Purchase saved offline — will sync when connected')
        router.push('/app/purchases')
      } else {
        const purchase = data as { id: string; refNumber: string }
        if (status === 'pending') {
          toast.success(`Purchase ${purchase.refNumber} saved as unpaid`)
          router.push('/app/purchases/unpaid')
        } else {
          setSigDialog({ purchaseId: purchase.id, refNumber: purchase.refNumber })
        }
      }
    } catch {
      toast.error('Failed to create purchase')
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
          onClick={() => router.back()}
          className="flex items-center gap-1 text-xs transition-colors"
          style={{ color: '#6C757D' }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Purchases
        </button>
        <span className="text-sm font-semibold" style={{ color: '#212529' }}>New Purchase</span>
        {customer?.blacklisted && (
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

          {/* Customer strip */}
          <div className="shrink-0" style={{ borderBottom: '1px solid #E0E0E0', background: '#F8F9FA' }}>
            {!customer ? (
              <div className="px-3 py-2">

                {/* Mode selector */}
                {customerType === null && (
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: '#8BA4D4' }}>
                      Seller type
                    </p>
                    <button
                      type="button"
                      onClick={() => setCustomerType('casual')}
                      className="px-3 py-1 rounded border text-[11px] font-medium transition-colors hover:bg-white"
                      style={{ borderColor: '#E0E0E0', color: '#212529', background: '#fff' }}
                    >
                      Casual
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerType('account')}
                      className="px-3 py-1 rounded border text-[11px] font-medium transition-colors hover:bg-white"
                      style={{ borderColor: '#E0E0E0', color: '#212529', background: '#fff' }}
                    >
                      Account Customer
                    </button>
                  </div>
                )}

                {/* Casual panel */}
                {customerType === 'casual' && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setCustomerType(null)}
                        className="text-[11px] transition-colors"
                        style={{ color: '#6C757D' }}
                      >
                        ← Back
                      </button>
                      <span className="text-[11px] font-semibold" style={{ color: '#212529' }}>Casual</span>
                    </div>
                    <CasualSelectorPanel onSelect={handleCustomerSelect} />
                  </div>
                )}

                {/* Account panel */}
                {customerType === 'account' && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setCustomerType(null)}
                        className="text-[11px] transition-colors"
                        style={{ color: '#6C757D' }}
                      >
                        ← Back
                      </button>
                      <span className="text-[11px] font-semibold" style={{ color: '#212529' }}>Account Customer</span>
                    </div>
                    <AccountSelectorPanel onSelect={handleCustomerSelect} />
                  </div>
                )}

              </div>
            ) : (
              <div className="flex items-center gap-2.5 px-3 py-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                  style={{ background: '#1B3A6B' }}
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
                  {customer.zeroRated && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-800">
                      Zero Rated
                    </span>
                  )}
                  {!showAllProducts && (customer.tradeCommodities?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllProducts(true)}
                      className="px-1.5 py-0.5 rounded border text-[10px] transition-colors hover:bg-white"
                      style={{ borderColor: '#E0E0E0', color: '#6C757D' }}
                    >
                      All Products
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setCustomer(null); setCustomerType(null) }}
                    className="px-2 py-0.5 rounded border text-[11px] transition-colors hover:bg-white"
                    style={{ borderColor: '#E0E0E0', color: '#6C757D' }}
                  >
                    Change
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Loan banner */}
          {customer && hasOutstandingLoan && (
            <div
              className="shrink-0 flex items-center gap-3 px-3 py-2 flex-wrap"
              style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A' }}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: '#D97706' }} />
              <span className="text-[12px]" style={{ color: '#92400E' }}>
                Outstanding loan: <strong className="font-mono">R {new Decimal(outstandingLoanAmount).toFixed(2)}</strong>
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[12px]" style={{ color: '#92400E' }}>
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-amber-600"
                  checked={deductLoan}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setDeductLoan(checked)
                    if (checked) {
                      const maxDeduct = Decimal.min(new Decimal(outstandingLoanAmount), total)
                      setDeductionAmount(maxDeduct.toFixed(2))
                    } else {
                      setDeductionAmount('')
                    }
                  }}
                />
                Deduct from payout
              </label>
              {deductLoan && (
                <div className="flex items-center gap-1">
                  <span className="text-[12px]" style={{ color: '#92400E' }}>R</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-24 px-2 py-0.5 rounded border font-mono text-[12px] focus:outline-none"
                    style={{ borderColor: '#FCD34D', color: '#92400E', background: '#FEF3C7' }}
                    value={deductionAmount}
                    onChange={(e) => setDeductionAmount(e.target.value)}
                  />
                  <span className="text-[11px]" style={{ color: '#D97706' }}>
                    max R {Decimal.min(new Decimal(outstandingLoanAmount), total).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Column headers */}
          <div
            className="shrink-0 grid items-center px-3 py-1.5"
            style={{
              gridTemplateColumns: '1fr 104px 104px 92px 36px 28px',
              gap: '8px',
              background: '#F8F9FA',
              borderBottom: '1px solid #E0E0E0',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6C757D' }}>Product</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6C757D' }}>Net Qty (kg)</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6C757D' }}>Buy Price (R)</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-right" style={{ color: '#6C757D' }}>Total</p>
            <span />
            <span />
          </div>

          {/* Items list — only scrollable zone */}
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ borderBottom: '1px solid #E0E0E0' }}>
            {lines.map((line) => {
              const qty       = new Decimal(line.quantity  || '0')
              const price     = new Decimal(line.unitPrice || '0')
              const lineTotal = qty.times(price)
              const busyGross = line.weighingGross
              const busyTare  = line.weighingTare

              const inputCls = 'h-8 w-full rounded border px-2 text-[12px] font-mono focus:outline-none transition-colors'
              const inputStyle = { borderColor: '#E0E0E0', color: '#212529', background: '#fff' }

              return (
                <div key={line.key} style={{ borderBottom: '1px solid #F0F0F0' }}>
                  {/* Main row */}
                  <div
                    className="grid items-center px-3 py-1.5"
                    style={{ gridTemplateColumns: '1fr 104px 104px 92px 36px 28px', gap: '8px', minHeight: 44 }}
                  >
                    <select
                      className="h-8 w-full rounded border px-2 text-[12px] focus:outline-none transition-colors bg-white"
                      style={{ borderColor: '#E0E0E0', color: '#212529' }}
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

                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.000"
                      value={line.quantity}
                      onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    />

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={line.unitPrice}
                      onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    />

                    <p
                      className="text-[13px] font-mono font-semibold text-right tabular-nums pr-1"
                      style={{ color: qty.gt(0) && price.gt(0) ? '#212529' : '#C0C0C0' }}
                    >
                      {qty.gt(0) && price.gt(0) ? `R ${lineTotal.toFixed(2)}` : '—'}
                    </p>

                    <button
                      type="button"
                      title="Toggle weighing mode"
                      onClick={() => patchLine(line.key, { weighMode: !line.weighMode })}
                      className="h-8 w-8 rounded flex items-center justify-center transition-colors"
                      style={line.weighMode
                        ? { background: '#185ABD', color: '#fff' }
                        : { border: '1px solid #E0E0E0', color: '#6C757D' }
                      }
                    >
                      <Scale className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                      className="h-8 w-7 rounded flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                      style={{ color: '#C0C0C0' }}
                      onMouseEnter={(e) => { if (lines.length > 1) (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#C0C0C0' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Weigh mode sub-row */}
                  {line.weighMode && (
                    <div
                      className="px-3 pb-2.5 pt-1.5 flex items-end gap-3 flex-wrap"
                      style={{ background: '#EFF6FF', borderTop: '1px solid #BFDBFE' }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-medium" style={{ color: '#6C757D' }}>Scale</span>
                        <Select
                          value={line.selectedScale}
                          onValueChange={(v) => patchLine(line.key, { selectedScale: v as '1' | '2' | '3' })}
                        >
                          <SelectTrigger className="h-7 w-24 text-[11px]" style={{ borderColor: '#E0E0E0' }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Scale 1</SelectItem>
                            <SelectItem value="2">Scale 2</SelectItem>
                            <SelectItem value="3">Scale 3</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-medium" style={{ color: '#6C757D' }}>Gross (kg)</span>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.001"
                            placeholder="0.000"
                            value={line.grossQty}
                            onChange={(e) => recomputeNet(line.key, e.target.value, line.tareQty)}
                            className="h-7 w-20 rounded border px-2 text-[11px] font-mono focus:outline-none"
                            style={{ borderColor: '#E0E0E0' }}
                          />
                          <button
                            type="button"
                            disabled={busyGross}
                            onClick={() => handleWeighGross(line)}
                            className="h-7 px-2 rounded text-white flex items-center justify-center disabled:opacity-60"
                            style={{ background: '#185ABD' }}
                          >
                            {busyGross
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RefreshCw className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-medium" style={{ color: '#6C757D' }}>Tare (kg)</span>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.001"
                            placeholder="0.000"
                            value={line.tareQty}
                            onChange={(e) => recomputeNet(line.key, line.grossQty, e.target.value)}
                            className="h-7 w-20 rounded border px-2 text-[11px] font-mono focus:outline-none"
                            style={{ borderColor: '#E0E0E0' }}
                          />
                          <button
                            type="button"
                            disabled={busyTare}
                            onClick={() => handleWeighTare(line)}
                            className="h-7 px-2 rounded flex items-center justify-center disabled:opacity-60 transition-colors"
                            style={{ border: '1px solid #E0E0E0', color: '#6C757D', background: '#fff' }}
                          >
                            {busyTare
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RefreshCw className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-medium" style={{ color: '#6C757D' }}>Net (kg)</span>
                        <div
                          className="h-7 flex items-center px-2 rounded border font-mono text-[12px] font-bold min-w-[64px]"
                          style={{ borderColor: '#A7F3D0', background: '#ECFDF5', color: '#059669' }}
                        >
                          {line.quantity || '0.000'}
                        </div>
                      </div>

                      {line.tareQty && parseFloat(line.tareQty) > 0 && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium" style={{ color: '#6C757D' }}>Tare Reason</span>
                          <input
                            placeholder="e.g. Bag, Pallet…"
                            value={line.tareReason}
                            onChange={(e) => patchLine(line.key, { tareReason: e.target.value })}
                            className="h-7 w-32 rounded border px-2 text-[11px] focus:outline-none"
                            style={{ borderColor: '#E0E0E0' }}
                          />
                        </div>
                      )}
                    </div>
                  )}
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
                color: '#fff',
              }}
            />
          </div>

          {/* Total */}
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            {deductLoan && deductionAmount && parseFloat(deductionAmount) > 0 ? (
              <div className="w-full space-y-2">
                <div className="flex justify-between">
                  <span className="text-[11px]" style={{ color: '#8BA4D4' }}>Gross Payout</span>
                  <span className="text-[13px] font-mono tabular-nums text-white">{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-amber-300">Loan Deduction</span>
                  <span className="text-[13px] font-mono tabular-nums text-amber-300">
                    − R {new Decimal(deductionAmount || '0').toFixed(2)}
                  </span>
                </div>
                <div className="h-px" style={{ background: 'rgba(255,255,255,0.15)' }} />
                <div className="text-center pt-1">
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: '#8BA4D4' }}>Cash to Pay</p>
                  <p className="font-bold tabular-nums mt-1" style={{ color: '#F2AB1A', fontSize: 34, lineHeight: 1.1 }}>
                    R {cashToPay.toFixed(2)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#8BA4D4' }}>
                  Total Payout
                </p>
                <p className="font-bold tabular-nums" style={{ color: '#F2AB1A', fontSize: 42, lineHeight: 1 }}>
                  R {total.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="px-4 pb-4 space-y-2 shrink-0">
            <button
              type="button"
              onClick={() => submitPurchase('pending')}
              disabled={submitting || !customer || customer.blacklisted}
              className="w-full h-10 rounded text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: '1px solid #C9A020', color: '#C9A020' }}
            >
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                : 'Save as Unpaid'}
            </button>
            <button
              type="button"
              onClick={() => submitPurchase('completed')}
              disabled={submitting || !customer || customer.blacklisted}
              className="w-full h-12 rounded text-[13px] font-bold text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: '#217346' }}
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : `Confirm · R ${cashToPay.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
      {sigDialog && (
        <SignatureDialog
          purchaseId={sigDialog.purchaseId}
          refNumber={sigDialog.refNumber}
          onDone={() => {
            const { purchaseId, refNumber } = sigDialog
            setSigDialog(null)
            setPhotoDialog({ purchaseId, refNumber })
          }}
        />
      )}

      {photoDialog && (
        <PhotoUploadStep
          purchaseId={photoDialog.purchaseId}
          refNumber={photoDialog.refNumber}
          onDone={() => {
            const { purchaseId, refNumber } = photoDialog
            const cashAmount = deductLoan && deductionAmount && parseFloat(deductionAmount) > 0
              ? Decimal.max(total.minus(new Decimal(deductionAmount)), new Decimal(0)).toFixed(2)
              : total.toFixed(2)
            setPhotoDialog(null)
            setPayoutDialog({
              purchaseId, refNumber, amount: cashAmount, method: paymentMethod,
              customerId: customer!.id,
              customerName: `${customer!.firstName} ${customer!.lastName}`,
            })
          }}
        />
      )}

      {payoutDialog && (
        <RecordPayoutStep
          purchaseId={payoutDialog.purchaseId}
          refNumber={payoutDialog.refNumber}
          amount={payoutDialog.amount}
          method={payoutDialog.method}
          customerId={payoutDialog.customerId}
          customerName={payoutDialog.customerName}
          onDone={() => {
            const { purchaseId, refNumber } = payoutDialog
            setPayoutDialog(null)
            setPrintDialog({ id: purchaseId, refNumber })
          }}
        />
      )}

      {printDialog && (
        <PrintResultModal
          type="purchase"
          id={printDialog.id}
          refNumber={printDialog.refNumber}
          onClose={() => router.push(`/app/purchases/new?t=${Date.now()}`)}
          onViewPurchase={() => router.push(`/app/purchases/${printDialog.id}`)}
          onDone={() => router.push('/app/dashboard')}
        />
      )}
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
      const fd = new FormData()
      fd.append('context', 'purchase_signature')
      fd.append('referenceId', purchaseId)
      fd.append('file', blob, 'signature.png')
      const uploadRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
      if (!uploadRes.ok) throw new Error('Failed to upload signature')
      const { key } = await uploadRes.json() as { key: string }
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
            <Button type="button" variant="ghost" size="sm" onClick={() => sigRef.current?.clear()} disabled={saving}>
              Clear
            </Button>
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

// ─── Photo Upload Step ────────────────────────────────────────────────────────
function PhotoUploadStep({
  purchaseId, refNumber, onDone,
}: { purchaseId: string; refNumber: string; onDone: () => void }) {
  const [keys, setKeys] = useState<string[]>([])

  async function handleUploaded(key: string) {
    await fetch(`/api/purchases/${purchaseId}/photos`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add: key }),
    })
    setKeys((prev) => [...prev, key])
  }

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-green-600" />
            Add Product Photos
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500 mb-3">
          {refNumber} — Capture photos of the stock before printing the receipt.
        </p>
        <div className="space-y-2">
          {keys.map((k, i) => (
            <p key={k} className="text-xs text-green-700 font-mono truncate">
              Photo {i + 1} uploaded ✓
            </p>
          ))}
          <PhotoUploader
            context="purchase_photo"
            referenceId={purchaseId}
            label="Add Photo"
            onUploaded={handleUploaded}
          />
        </div>
        <div className="flex justify-end mt-4">
          <Button className="bg-green-600 hover:bg-green-700" onClick={onDone}>
            {keys.length === 0 ? 'Skip →' : `Next (${keys.length} photo${keys.length > 1 ? 's' : ''}) →`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Record Payout Step ───────────────────────────────────────────────────────
function RecordPayoutStep({
  refNumber, amount, method, customerId, customerName, onDone,
}: {
  purchaseId: string; refNumber: string; amount: string; method: string
  customerId: string; customerName: string; onDone: () => void
}) {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'eft' | 'cheque' | 'amplopay'>(method as 'cash' | 'eft' | 'cheque' | 'amplopay')
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRecord() {
    setLoading(true)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, amount, paymentMethod, notes: notes || undefined }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        toast.error(j.error ?? 'Failed to record payout')
        return
      }
      const data = await res.json() as { refNumber: string }
      toast.success(`Payout ${data.refNumber} recorded`)
      onDone()
    } catch {
      toast.error('Failed to record payout')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" />
            Record Payout — {refNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Pay to</p>
            <p className="font-semibold text-gray-900">{customerName}</p>
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
          <div>
            <Label>Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="Any remarks..." disabled={loading} />
          </div>
          <Button
            className="w-full bg-green-600 hover:bg-green-700 h-11 text-base font-semibold"
            onClick={handleRecord}
            disabled={loading}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Recording…</>
              : 'Confirm Payout & Print Receipt'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
