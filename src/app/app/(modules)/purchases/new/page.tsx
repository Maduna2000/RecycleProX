'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Loader2, AlertTriangle, Scale, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { CasualSelectorPanel } from '@/components/customers/CasualSelectorPanel'
import { AccountSelectorPanel } from '@/components/customers/AccountSelectorPanel'
import { PrintResultModal } from '@/components/PrintResultModal'
import Decimal from 'decimal.js'
import { colors } from '@/lib/design-tokens'
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
  'Copper':                ['copper'],
  'Aluminium':             ['aluminium'],
  'Steel (Ferrous)':       ['ferrous'],
  'Non-Ferrous Metals':    ['non_ferrous'],
  'Stainless Steel':       ['ferrous', 'non_ferrous'],
  'Lead':                  ['non_ferrous'],
  'Brass':                 ['non_ferrous'],
  'Iron':                  ['ferrous'],
  'E-Waste (Electronics)': ['e_waste'],
  'Plastic':               ['plastic'],
  'Paper / Cardboard':     ['paper'],
  'Catalytic Converters':  ['other'],
  'Batteries':             ['other'],
  'Other':                 ['other'],
}

type LineItem = {
  key: number
  productId: string
  product: Product | null
  quantity: string
  grossQty: string
  tareQty: string
  tareReason: string
  deductionQty: string
  deductionReason: string
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
  tareReason: '', deductionQty: '', deductionReason: '', unitPrice: '',
  weighMode: false, selectedScale: '1', weighingGross: false, weighingTare: false,
})

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

// ─── NewPurchasePage ──────────────────────────────────────────────────────────
export default function NewPurchasePage() {
  const router    = useRouter()
  const readScale = useScaleRead()
  const { mutate: offlineMutate } = useOfflineMutation()

  const [customer,        setCustomer]        = useState<SelectedCustomer | null>(null)
  const [customerType,    setCustomerType]    = useState<'casual' | 'account' | ''>('')
  const [lines,           setLines]           = useState<LineItem[]>([emptyLine(1)])
  const [paymentType,     setPaymentType]     = useState<'unpaid' | 'cash' | 'eft' | 'cheque' | 'amplopay'>('cash')
  const [notes,           setNotes]           = useState('')
  const [grvNumber,       setGrvNumber]       = useState('')
  const [invoiceNo,       setInvoiceNo]       = useState('')
  const [submitting,      setSubmitting]      = useState(false)
  const [keyCounter,      setKeyCounter]      = useState(2)
  const [printDialog,     setPrintDialog]     = useState<{ id: string; refNumber: string } | null>(null)
  const [deductLoan,      setDeductLoan]      = useState(false)
  const [deductionAmount, setDeductionAmount] = useState('')
  const [showAllProducts, setShowAllProducts] = useState(false)

  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products?active=true', fetcher)
  const products = productsData?.products ?? []

  const { data: loanData } = useSWR<{ summary: { outstanding: string; hasOutstanding: boolean } }>(
    customer ? `/api/customers/${customer.id}/loans?pageSize=1` : null,
    fetcher,
  )
  const hasOutstandingLoan    = loanData?.summary?.hasOutstanding ?? false
  const outstandingLoanAmount = loanData?.summary?.outstanding    ?? '0'

  const vatRate = customer?.zeroRated ? new Decimal(0) : new Decimal('0.15')

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

  const subTotal = lines.reduce((sum, l) => {
    return sum.plus(new Decimal(l.quantity || '0').times(new Decimal(l.unitPrice || '0')))
  }, new Decimal(0))
  const vatAmount  = subTotal.times(vatRate)
  const grandTotal = subTotal.plus(vatAmount)

  const loanDeduct = deductLoan && deductionAmount && parseFloat(deductionAmount) > 0
    ? new Decimal(deductionAmount || '0')
    : new Decimal(0)
  const cashToPay = Decimal.max(grandTotal.minus(loanDeduct), new Decimal(0))

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

  function recomputeNet(key: number, grossStr: string, tareStr: string, deductionStr = '') {
    const gross     = new Decimal(grossStr     || '0')
    const tare      = new Decimal(tareStr      || '0')
    const deduction = new Decimal(deductionStr || '0')
    const net       = Decimal.max(gross.minus(tare), new Decimal('0'))
    const paid      = Decimal.max(net.minus(deduction), new Decimal('0'))
    patchLine(key, { quantity: paid.toFixed(3), grossQty: grossStr, tareQty: tareStr })
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
      recomputeNet(line.key, weight, line.tareQty, line.deductionQty)
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
      recomputeNet(line.key, line.grossQty, weight, line.deductionQty)
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

  async function submitPurchase(isPending: boolean) {
    if (!customer) { toast.error('Please select a customer'); return }
    if (customer.blacklisted) { toast.error('Customer is blacklisted'); return }
    const validLines = lines.filter((l) => l.productId && l.quantity && l.unitPrice)
    if (validLines.length === 0) { toast.error('Add at least one product line'); return }
    for (const l of validLines) {
      if (parseFloat(l.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
      if (parseFloat(l.unitPrice) < 0)  { toast.error('Unit price cannot be negative'); return }
    }

    const deduction = deductLoan && deductionAmount && parseFloat(deductionAmount) > 0 && !isPending
      ? deductionAmount : undefined
    if (deduction && new Decimal(deduction).greaterThan(grandTotal)) {
      toast.error('Loan deduction cannot exceed the total payout'); return
    }

    const noteParts: string[] = []
    if (grvNumber) noteParts.push(`GRV:${grvNumber}`)
    if (invoiceNo)  noteParts.push(`INV:${invoiceNo}`)
    if (notes)      noteParts.push(notes)
    const combinedNotes = noteParts.join(' | ') || undefined

    const paymentMethod = isPending ? 'cash' : paymentType as 'cash' | 'eft' | 'cheque' | 'amplopay'
    const status        = isPending ? 'pending' : 'completed'

    const body = {
      customerId: customer.id, paymentMethod, status,
      notes: combinedNotes,
      ...(deduction ? { loanDeductionAmount: deduction } : {}),
      lines: validLines.map((l) => ({
        productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice,
        ...(l.grossQty        ? { grossQty:        l.grossQty        } : {}),
        ...(l.tareQty         ? { tareQty:          l.tareQty         } : {}),
        ...(l.tareReason      ? { tareReason:       l.tareReason      } : {}),
        ...(parseFloat(l.deductionQty || '0') > 0 ? { deductionQty: l.deductionQty } : {}),
        ...(l.deductionReason ? { deductionReason:  l.deductionReason } : {}),
      })),
    }
    const localId = `local_${crypto.randomUUID()}`
    setSubmitting(true)
    try {
      const { queued, data } = await offlineMutate({ method: 'POST', url: '/api/purchases', body, localId })
      if (queued) {
        await offlineDB.purchases.add({
          id: localId, refNumber: `OFF-${Date.now()}`, customerId: customer.id,
          status, totalAmount: grandTotal.toFixed(2), paymentMethod,
          notes: combinedNotes, createdAt: new Date().toISOString(), _offlineCreated: true,
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
          setPrintDialog({ id: purchase.id, refNumber: purchase.refNumber })
        }
      }
    } catch {
      toast.error('Failed to create purchase')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Shared input style ───────────────────────────────────────────────────────
  const cellInput = 'w-full px-1.5 py-0.5 text-[11px] font-mono border rounded-[2px] bg-white focus:outline-none focus:border-[#0078D7]'
  const cellInputStyle = { borderColor: '#ABABAB', color: '#212529' }
  const headerBg = { background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '2px solid #B0B0B0' }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0 bg-white border" style={{ borderColor: '#B0B0B0', borderRadius: 2 }}>

        {/* ── Panel title bar ─────────────────────────────── */}
        <div
          className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b"
          style={{ borderColor: '#C0C0C0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)' }}
        >
          <span className="text-[12px] font-bold" style={{ color: '#1B3A6B' }}>New Purchase</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-semibold" style={{ color: '#374151' }}>GRV No</label>
              <input
                value={grvNumber}
                onChange={(e) => setGrvNumber(e.target.value)}
                className="w-24 px-2 py-0.5 text-[11px] border rounded-[2px] bg-white focus:outline-none focus:border-[#0078D7]"
                style={{ borderColor: '#ABABAB' }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-semibold" style={{ color: '#374151' }}>Invoice No</label>
              <input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                className="w-24 px-2 py-0.5 text-[11px] border rounded-[2px] bg-white focus:outline-none focus:border-[#0078D7]"
                style={{ borderColor: '#ABABAB' }}
              />
            </div>
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-3 space-y-3">

            {/* Customer Type selector + customer section + totals */}
            <div className="space-y-2">

              {/* Type dropdown row */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold" style={{ color: '#374151' }}>Customer Type:</label>
                <select
                  value={customerType}
                  onChange={(e) => {
                    const v = e.target.value as '' | 'casual' | 'account'
                    setCustomerType(v)
                    setCustomer(null)
                    setShowAllProducts(false)
                  }}
                  className="px-2 py-0.5 text-[12px] border rounded-[2px] bg-white focus:outline-none focus:border-[#0078D7]"
                  style={{ borderColor: '#ABABAB', color: '#212529' }}
                >
                  <option value="">— Select —</option>
                  <option value="casual">Casual</option>
                  <option value="account">Account Customer</option>
                </select>
              </div>

              {/* Customer panel + Totals row */}
              <div className="flex gap-3 items-start">

                {/* Left: customer selector / card */}
                <div
                  className="flex-[3] min-w-0 border rounded-[2px] p-2"
                  style={{ borderColor: '#C0C0C0', minHeight: 64 }}
                >
                  {!customerType && (
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>Select a customer type above to begin.</p>
                  )}

                  {customerType && !customer && customerType === 'casual' && (
                    <CasualSelectorPanel onSelect={handleCustomerSelect} />
                  )}
                  {customerType && !customer && customerType === 'account' && (
                    <AccountSelectorPanel onSelect={handleCustomerSelect} />
                  )}

                  {customer && (
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                        style={{ background: colors.primary }}
                      >
                        {customer.firstName[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold" style={{ color: colors.textPrimary }}>
                          {customer.firstName} {customer.lastName}
                          {customer.blacklisted && (
                            <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
                              <AlertTriangle className="w-3 h-3" /> Blacklisted
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-[11px]" style={{ color: colors.textSecondary }}>
                          {customer.idNumber} · {customer.phone}
                        </p>
                        <div className="flex gap-1.5 mt-0.5 flex-wrap">
                          {customer.priceGroupId && (
                            <span className="px-1.5 py-0 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">Custom Pricing</span>
                          )}
                          {customer.zeroRated && (
                            <span className="px-1.5 py-0 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-800">Zero Rated</span>
                          )}
                          {!showAllProducts && (customer.tradeCommodities?.length ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowAllProducts(true)}
                              className="px-1.5 py-0 rounded border text-[10px]"
                              style={{ borderColor: colors.border, color: colors.textSecondary }}
                            >
                              Show All Products
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCustomer(null) }}
                        className="px-2 py-0.5 rounded border text-[11px] shrink-0"
                        style={{ borderColor: '#ABABAB', color: colors.textSecondary }}
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>

                {/* Right: Totals */}
                <div className="flex-[2] border rounded-[2px] p-2" style={{ borderColor: '#C0C0C0' }}>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[11px]">
                      <span style={{ color: colors.textSecondary }}>Sub Total</span>
                      <span className="font-mono tabular-nums" style={{ color: colors.textPrimary }}>R {subTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span style={{ color: colors.textSecondary }}>
                        VAT ({customer?.zeroRated ? '0%' : '15%'})
                      </span>
                      <span className="font-mono tabular-nums" style={{ color: colors.textSecondary }}>R {vatAmount.toFixed(2)}</span>
                    </div>
                    <div className="h-px my-1" style={{ background: '#C0C0C0' }} />
                    <div className="flex justify-between text-[12px]">
                      <span className="font-bold" style={{ color: colors.textPrimary }}>Total</span>
                      <span className="font-mono font-bold tabular-nums" style={{ color: '#217346' }}>R {grandTotal.toFixed(2)}</span>
                    </div>
                    {deductLoan && loanDeduct.gt(0) && (
                      <>
                        <div className="flex justify-between text-[11px]">
                          <span style={{ color: '#92400E' }}>Loan Deduction</span>
                          <span className="font-mono tabular-nums" style={{ color: '#92400E' }}>− R {loanDeduct.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[12px]">
                          <span className="font-bold" style={{ color: '#1B3A6B' }}>Cash to Pay</span>
                          <span className="font-mono font-bold tabular-nums" style={{ color: '#185ABD' }}>R {cashToPay.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Outstanding loan */}
                  {customer && hasOutstandingLoan && (
                    <div className="mt-2 p-1.5 rounded-[2px] border text-[11px]" style={{ borderColor: '#F59E0B', background: '#FFFBEB' }}>
                      <div className="flex items-center gap-1 font-semibold" style={{ color: '#92400E' }}>
                        <AlertTriangle className="w-3 h-3" />
                        Outstanding loan: R {new Decimal(outstandingLoanAmount).toFixed(2)}
                      </div>
                      <label className="flex items-center gap-1.5 mt-1 cursor-pointer" style={{ color: '#78350F' }}>
                        <input
                          type="checkbox"
                          className="w-3 h-3 accent-amber-600"
                          checked={deductLoan}
                          disabled={paymentType === 'unpaid'}
                          onChange={(e) => {
                            setDeductLoan(e.target.checked)
                            if (e.target.checked) {
                              setDeductionAmount(Decimal.min(new Decimal(outstandingLoanAmount), grandTotal).toFixed(2))
                            } else {
                              setDeductionAmount('')
                            }
                          }}
                        />
                        Deduct from payout
                        {deductLoan && (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={deductionAmount}
                            onChange={(e) => setDeductionAmount(e.target.value)}
                            className="ml-1 w-20 px-1 py-0 rounded border font-mono text-[11px] focus:outline-none"
                            style={{ borderColor: '#D97706' }}
                          />
                        )}
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Comments */}
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold shrink-0" style={{ color: '#374151' }}>Comments:</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any remarks…"
                className="flex-1 px-2 py-0.5 text-[12px] border rounded-[2px] bg-white focus:outline-none focus:border-[#0078D7]"
                style={{ borderColor: '#ABABAB', color: '#212529' }}
              />
            </div>

            {/* Payment Type radios */}
            <div className="flex items-center gap-4">
              <label className="text-[11px] font-semibold shrink-0" style={{ color: '#374151' }}>Payment Type:</label>
              {(['unpaid', 'cash', 'cheque', 'eft', 'amplopay'] as const).map((type) => (
                <label key={type} className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: '#374151' }}>
                  <input
                    type="radio"
                    name="paymentType"
                    checked={paymentType === type}
                    onChange={() => {
                      setPaymentType(type)
                      if (type === 'unpaid') { setDeductLoan(false); setDeductionAmount('') }
                    }}
                    className="w-3.5 h-3.5"
                  />
                  {type === 'unpaid' ? 'Unpaid' : type === 'eft' ? 'EFT' : type === 'amplopay' ? 'AmploPay' : type.charAt(0).toUpperCase() + type.slice(1)}
                </label>
              ))}
            </div>

            {/* ── Product Entry ──────────────────────────────────────── */}
            <div className="border" style={{ borderColor: '#B0B0B0' }}>

              {/* Grid header */}
              <div
                className="grid items-center px-2 py-1"
                style={{
                  ...headerBg,
                  gridTemplateColumns: '1fr 72px 80px 80px 70px 80px 28px 26px',
                  gap: '4px',
                }}
              >
                {['Product', 'Qty (kg)', 'Price (R)', 'Sub Total', 'VAT', 'Total', '', ''].map((h, i) => (
                  <span key={i} className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#374151' }}>{h}</span>
                ))}
              </div>

              {/* Lines */}
              {lines.map((line) => {
                const qty      = new Decimal(line.quantity  || '0')
                const price    = new Decimal(line.unitPrice || '0')
                const lineSub  = qty.times(price)
                const lineVat  = lineSub.times(vatRate)
                const lineTot  = lineSub.plus(lineVat)

                return (
                  <div key={line.key} style={{ borderTop: '1px solid #E0E0E0' }}>
                    {/* Main row */}
                    <div
                      className="grid items-center px-2 py-1"
                      style={{ gridTemplateColumns: '1fr 72px 80px 80px 70px 80px 28px 26px', gap: '4px', minHeight: 32 }}
                    >
                      {/* Product */}
                      <select
                        className="h-6 w-full rounded-[2px] border px-1 text-[11px] bg-white focus:outline-none"
                        style={{ borderColor: '#ABABAB', color: '#212529' }}
                        value={line.productId}
                        onChange={(e) => onProductSelect(line.key, e.target.value)}
                      >
                        <option value="">Select…</option>
                        {Object.entries(productsByCategory).map(([cat, prods]) => (
                          <optgroup key={cat} label={CATEGORY_LABELS[cat] ?? cat}>
                            {prods.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>

                      {/* Qty */}
                      <input
                        type="number" step="0.001" min="0" placeholder="0.000"
                        value={line.quantity}
                        onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                        className={cellInput}
                        style={cellInputStyle}
                      />

                      {/* Price */}
                      <input
                        type="number" step="0.01" min="0" placeholder="0.00"
                        value={line.unitPrice}
                        onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })}
                        className={cellInput}
                        style={cellInputStyle}
                      />

                      {/* Sub Total */}
                      <span className="text-[11px] font-mono tabular-nums px-1" style={{ color: qty.gt(0) ? '#212529' : '#9CA3AF' }}>
                        {qty.gt(0) ? `R ${lineSub.toFixed(2)}` : '—'}
                      </span>

                      {/* VAT */}
                      <span className="text-[11px] font-mono tabular-nums px-1" style={{ color: qty.gt(0) ? '#212529' : '#9CA3AF' }}>
                        {qty.gt(0) ? `R ${lineVat.toFixed(2)}` : '—'}
                      </span>

                      {/* Total */}
                      <span className="text-[11px] font-mono tabular-nums px-1 font-semibold" style={{ color: qty.gt(0) ? '#217346' : '#9CA3AF' }}>
                        {qty.gt(0) ? `R ${lineTot.toFixed(2)}` : '—'}
                      </span>

                      {/* Scale toggle */}
                      <button
                        type="button"
                        title="Toggle weighing"
                        onClick={() => patchLine(line.key, { weighMode: !line.weighMode })}
                        className="h-6 w-6 flex items-center justify-center rounded-[2px]"
                        style={line.weighMode
                          ? { background: '#185ABD', color: '#fff' }
                          : { border: '1px solid #ABABAB', color: '#6C757D' }}
                      >
                        <Scale className="w-3 h-3" />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                        className="h-6 w-6 flex items-center justify-center rounded-[2px] disabled:opacity-25"
                        style={{ color: '#9CA3AF' }}
                        onMouseEnter={(e) => { if (lines.length > 1) (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Weigh sub-row */}
                    {line.weighMode && (
                      <div
                        className="px-3 pb-2 pt-1.5 flex items-end gap-3 flex-wrap"
                        style={{ background: '#EFF6FF', borderTop: '1px solid #BFDBFE' }}
                      >
                        {/* Scale selector */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium" style={{ color: colors.textSecondary }}>Scale</span>
                          <Select
                            value={line.selectedScale}
                            onValueChange={(v) => patchLine(line.key, { selectedScale: v as '1' | '2' | '3' })}
                          >
                            <SelectTrigger className="h-6 w-24 text-[11px]" style={{ borderColor: '#ABABAB' }}>
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
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium" style={{ color: colors.textSecondary }}>Gross (kg)</span>
                          <div className="flex gap-1">
                            <input
                              type="number" step="0.001" placeholder="0.000"
                              value={line.grossQty}
                              onChange={(e) => recomputeNet(line.key, e.target.value, line.tareQty, line.deductionQty)}
                              className="h-6 w-20 rounded-[2px] border px-1.5 text-[11px] font-mono focus:outline-none"
                              style={{ borderColor: '#ABABAB' }}
                            />
                            <button
                              type="button"
                              disabled={line.weighingGross}
                              onClick={() => handleWeighGross(line)}
                              className="h-6 px-1.5 rounded-[2px] text-white flex items-center disabled:opacity-60"
                              style={{ background: '#185ABD' }}
                            >
                              {line.weighingGross ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        {/* Tare */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium" style={{ color: colors.textSecondary }}>Tare (kg)</span>
                          <div className="flex gap-1">
                            <input
                              type="number" step="0.001" placeholder="0.000"
                              value={line.tareQty}
                              onChange={(e) => recomputeNet(line.key, line.grossQty, e.target.value, line.deductionQty)}
                              className="h-6 w-20 rounded-[2px] border px-1.5 text-[11px] font-mono focus:outline-none"
                              style={{ borderColor: '#ABABAB' }}
                            />
                            <button
                              type="button"
                              disabled={line.weighingTare}
                              onClick={() => handleWeighTare(line)}
                              className="h-6 px-1.5 rounded-[2px] flex items-center disabled:opacity-60"
                              style={{ border: '1px solid #ABABAB', color: '#6C757D' }}
                            >
                              {line.weighingTare ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        {/* Net display */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium" style={{ color: colors.textSecondary }}>Net (kg)</span>
                          <div
                            className="h-6 flex items-center px-1.5 rounded-[2px] border font-mono text-[11px] font-bold min-w-[56px]"
                            style={{ borderColor: colors.netWeightBorder, background: colors.netWeightBg, color: colors.netWeightText }}
                          >
                            {Decimal.max(
                              new Decimal(line.grossQty || '0').minus(new Decimal(line.tareQty || '0')),
                              new Decimal('0'),
                            ).toFixed(3)}
                          </div>
                        </div>

                        {/* Deduction */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium" style={{ color: colors.textSecondary }}>Deduction (kg)</span>
                          <input
                            type="number" step="0.001" min="0" placeholder="0.000"
                            value={line.deductionQty}
                            onChange={(e) => {
                              const net  = Decimal.max(
                                new Decimal(line.grossQty || '0').minus(new Decimal(line.tareQty || '0')),
                                new Decimal('0'),
                              )
                              const paid = Decimal.max(net.minus(new Decimal(e.target.value || '0')), new Decimal('0'))
                              patchLine(line.key, { deductionQty: e.target.value, quantity: paid.toFixed(3) })
                            }}
                            className="h-6 w-20 rounded-[2px] border px-1.5 text-[11px] font-mono focus:outline-none"
                            style={{ borderColor: '#ABABAB' }}
                          />
                        </div>

                        {parseFloat(line.deductionQty || '0') > 0 && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-semibold" style={{ color: '#217346' }}>Paid Qty (kg)</span>
                            <div
                              className="h-6 flex items-center px-1.5 rounded-[2px] border font-mono text-[11px] font-bold min-w-[56px]"
                              style={{ border: '1px solid #217346', background: '#F0FDF4', color: '#217346' }}
                            >
                              {line.quantity || '0.000'}
                            </div>
                          </div>
                        )}

                        {line.tareQty && parseFloat(line.tareQty) > 0 && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-medium" style={{ color: colors.textSecondary }}>Tare Reason</span>
                            <input
                              placeholder="e.g. Bag…"
                              value={line.tareReason}
                              onChange={(e) => patchLine(line.key, { tareReason: e.target.value })}
                              className="h-6 w-28 rounded-[2px] border px-1.5 text-[11px] focus:outline-none"
                              style={{ borderColor: '#ABABAB' }}
                            />
                          </div>
                        )}

                        {parseFloat(line.deductionQty || '0') > 0 && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-medium" style={{ color: colors.textSecondary }}>Deduction Reason</span>
                            <input
                              placeholder="e.g. Contamination…"
                              value={line.deductionReason}
                              onChange={(e) => patchLine(line.key, { deductionReason: e.target.value })}
                              className="h-6 w-32 rounded-[2px] border px-1.5 text-[11px] focus:outline-none"
                              style={{ borderColor: '#ABABAB' }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add line */}
              <div className="px-2 py-1.5" style={{ borderTop: '1px solid #E0E0E0', background: '#FAFAFA' }}>
                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: '#185ABD' }}
                >
                  <Plus className="w-3 h-3" /> Add Line
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── Action bar ────────────────────────────────────── */}
        <div
          className="shrink-0 flex items-center justify-between px-4 py-2 border-t"
          style={{ borderColor: '#B0B0B0', background: 'linear-gradient(180deg,#F5F5F5 0%,#E8E8E8 100%)' }}
        >
          <button
            type="button"
            onClick={() => submitPurchase(true)}
            disabled={submitting || !customer || !!customer.blacklisted}
            className="h-7 px-5 rounded-sm text-[12px] font-medium disabled:opacity-40"
            style={{ background: '#FFFFFF', border: '1px solid #C9A020', color: '#92400E' }}
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'Save as Unpaid'}
          </button>
          <button
            type="button"
            onClick={() => submitPurchase(false)}
            disabled={submitting || !customer || !!customer.blacklisted || paymentType === 'unpaid'}
            className="h-7 px-6 rounded-sm text-[12px] font-bold text-white disabled:opacity-40 flex items-center gap-2"
            style={{ background: '#217346', border: '1px solid #176338' }}
          >
            {submitting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              : `Save · R ${cashToPay.toFixed(2)}`}
          </button>
        </div>
      </div>

      {/* Print result dialog */}
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
