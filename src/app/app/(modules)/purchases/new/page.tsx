'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Loader2, AlertTriangle, Scale, RefreshCw, Camera, ClipboardList, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { CasualSelectorPanel, type CasualSelectorPanelRef } from '@/components/customers/CasualSelectorPanel'
import { AccountSelectorPanel } from '@/components/customers/AccountSelectorPanel'
import { PrintResultModal } from '@/components/PrintResultModal'
import { ProductCategoryPicker } from '@/components/products/ProductCategoryPicker'
import Decimal from 'decimal.js'
import { colors } from '@/lib/design-tokens'
import { HEADER_GRAD, BAR_GRAD, CARD_BORDER, Btn } from '@/components/rpx'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useOfflineMutation } from '@/hooks/useOfflineFetch'
import { offlineDB } from '@/lib/offline/db'
import { fetcher } from '@/lib/swrFetcher'
import { canAutoPrint, autoPrintReceipt } from '@/lib/print/autoPrintClient'


type Product = {
  id: string; code: string; name: string; category: string
  unit: string; defaultBuyPrice: string; defaultSellPrice: string
}

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string | null
  phone: string; blacklisted: boolean; priceGroupId?: string | null
  tradeCommodities?: string[] | null; zeroRated?: boolean
  companyName?: string | null; contactPerson?: string | null
}

type CategoryNode = { id: string; name: string; children: { id: string; name: string }[] }

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
  vatApplied: boolean
  weighMode: boolean
  selectedScale: '1' | '2' | '3'
  weighingGross: boolean
  weighingTare: boolean
}

type PendingPurchase = {
  id: string
  refNumber: string
  customer: { id: string; firstName: string; lastName: string }
  lines: { id: string }[]
  subTotal: string
  vatAmount: string
  totalAmount: string
  amountPaid: string
  loanDeductionAmount?: string
  paymentMethod: string
  createdAt: string
}

const emptyLine = (key: number, vatApplied = false): LineItem => ({
  key, productId: '', product: null, quantity: '', grossQty: '', tareQty: '',
  tareReason: '', deductionQty: '', deductionReason: '', unitPrice: '', vatApplied,
  weighMode: false, selectedScale: '1', weighingGross: false, weighingTare: false,
})

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return 'Just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

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
  const { confirm } = useConfirm()

  // ── Core purchase state ──────────────────────────────────────────────────
  const [customer,        setCustomer]        = useState<SelectedCustomer | null>(null)
  const [customerType,    setCustomerType]    = useState<'casual' | 'account'>('casual')
  const [lines,           setLines]           = useState<LineItem[]>([emptyLine(1)])
  const [paymentType,     setPaymentType]     = useState<'unpaid' | 'cash' | 'eft'>('unpaid')
  const [notes,           setNotes]           = useState('')
  const [grvNumber,       setGrvNumber]       = useState('')
  const [invoiceNo,       setInvoiceNo]       = useState('')
  const [submitting,      setSubmitting]      = useState(false)
  const [keyCounter,      setKeyCounter]      = useState(2)
  const [printDialog,     setPrintDialog]     = useState<{ id: string; refNumber: string } | null>(null)
  const [deductLoan,      setDeductLoan]      = useState(false)
  const [deductionAmount, setDeductionAmount] = useState('')
  const [showAllProducts, setShowAllProducts] = useState(false)

  // ── Pending purchases action state ──────────────────────────────────────
  const [actionMenuId,  setActionMenuId]  = useState<string | null>(null)
  const [actionMenuRect, setActionMenuRect] = useState<DOMRect | null>(null)
  const [voidId,        setVoidId]        = useState<string | null>(null)
  const [voidReason,    setVoidReason]    = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // ── Photo state ──────────────────────────────────────────────────────────
  const [photoFile,    setPhotoFile]    = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // ── Scale order link (carries the scale-kiosk weigh-in photo through to
  //    police copper reporting) ────────────────────────────────────────────
  const [scaleOrderLink,   setScaleOrderLink]   = useState<{ id: string; orderNumber: string } | null>(null)
  const [scaleOrderSearch, setScaleOrderSearch] = useState('')
  const [loadingScaleOrder, setLoadingScaleOrder] = useState(false)

  // ── Scale display state ──────────────────────────────────────────────────
  const [scale1,        setScale1]        = useState<string | null>(null)
  const [scale2,        setScale2]        = useState<string | null>(null)
  const [readingScale1, setReadingScale1] = useState(false)
  const [readingScale2, setReadingScale2] = useState(false)

  // ── Casual panel ref (for auto-confirm on Save) ──────────────────────────
  const casualPanelRef = useRef<CasualSelectorPanelRef>(null)

  // ── Data fetching ────────────────────────────────────────────────────────
  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products?active=true', fetcher)
  const products = productsData?.products ?? []

  // A customer's trade commodities are product category names (Settings ->
  // Trade Commodities toggles real categories on/off). Selecting a parent
  // category covers its sub-categories too, mirroring productService.ts's
  // expandCategoryNames.
  const { data: categoriesData } = useSWR<{ categories: CategoryNode[] }>('/api/product-categories', fetcher)
  const categoryExpansion = (() => {
    const map: Record<string, string[]> = {}
    for (const parent of categoriesData?.categories ?? []) {
      map[parent.name] = [parent.name, ...parent.children.map((c) => c.name)]
      for (const child of parent.children) map[child.name] = [child.name]
    }
    return map
  })()

  const { data: pendingData, mutate: mutatePending } = useSWR<{ purchases: PendingPurchase[] }>(
    '/api/purchases?status=pending&pageSize=20',
    fetcher,
    { refreshInterval: 30_000 },
  )
  const pendingPurchases = pendingData?.purchases ?? []

  const { data: loanData } = useSWR<{ summary: { outstanding: string; hasOutstanding: boolean } }>(
    customer ? `/api/customers/${customer.id}/loans?pageSize=1` : null,
    fetcher,
  )
  const hasOutstandingLoan    = loanData?.summary?.hasOutstanding ?? false
  const outstandingLoanAmount = loanData?.summary?.outstanding    ?? '0'

  // ── Derived calculations ─────────────────────────────────────────────────
  const vatRate = customer?.zeroRated ? new Decimal(0) : new Decimal('0.15')

  const visibleProducts = (() => {
    const commodities = customer?.tradeCommodities
    if (showAllProducts || !commodities?.length) return products
    const allowed = new Set(commodities.flatMap((c) => categoryExpansion[c] ?? [c]))
    return products.filter((p) => allowed.has(p.category))
  })()

  const subTotal = lines.reduce((sum, l) => {
    return sum.plus(new Decimal(l.quantity || '0').times(new Decimal(l.unitPrice || '0')))
  }, new Decimal(0))
  // VAT only applies to lines with the per-line "Apply VAT" checkbox checked
  const vatAmount = lines.reduce((sum, l) => {
    if (!l.vatApplied) return sum
    const lineSub = new Decimal(l.quantity || '0').times(new Decimal(l.unitPrice || '0'))
    return sum.plus(lineSub.times(vatRate))
  }, new Decimal(0))
  const grandTotal = subTotal.plus(vatAmount)

  const loanDeduct = deductLoan && deductionAmount && parseFloat(deductionAmount) > 0
    ? new Decimal(deductionAmount || '0')
    : new Decimal(0)
  const cashToPay = Decimal.max(grandTotal.minus(loanDeduct), new Decimal(0))

  // ── Reset (shared by the pending-save success path and Cancel) ──────────
  function resetForm() {
    setCustomer(null)
    setCustomerType('casual')
    setLines([emptyLine(keyCounter)])
    setKeyCounter((k) => k + 1)
    setPaymentType('unpaid')
    setNotes('')
    setGrvNumber('')
    setInvoiceNo('')
    setDeductLoan(false)
    setDeductionAmount('')
    setPhotoFile(null)
    setPhotoPreview(null)
    setScaleOrderLink(null)
    setScaleOrderSearch('')
    setScale1(null)
    setScale2(null)
    setReadingScale1(false)
    setReadingScale2(false)
  }

  const hasEnteredData =
    !!customer ||
    lines.some((l) => l.productId || l.quantity || l.unitPrice) ||
    !!photoFile ||
    !!scaleOrderLink

  async function handleCancel() {
    if (hasEnteredData) {
      const confirmed = await confirm({
        title: 'Discard this purchase?',
        message: 'You have entered details for this purchase. Leaving now will discard everything entered so far.',
        variant: 'warning',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      })
      if (!confirmed) return
    }
    resetForm()
    router.push('/app/purchases')
  }

  // ── Line management ──────────────────────────────────────────────────────
  function addLine() {
    setLines((prev) => [...prev, emptyLine(keyCounter, !customer?.zeroRated)])
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
    patchLine(key, { quantity: paid.toFixed(2), grossQty: grossStr, tareQty: tareStr })
  }

  // ── Product selection ────────────────────────────────────────────────────
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

  // ── Scale (per-line weigh mode) ──────────────────────────────────────────
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

  // ── Scale panel (right column reads) ────────────────────────────────────
  async function handleScale1Read() {
    setReadingScale1(true)
    try {
      const w = await readScale('1')
      setScale1(w)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scale 1 not responding')
    } finally {
      setReadingScale1(false)
    }
  }

  async function handleScale2Read() {
    setReadingScale2(true)
    try {
      const w = await readScale('2')
      setScale2(w)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scale 2 not responding')
    } finally {
      setReadingScale2(false)
    }
  }

  // ── Customer selection ───────────────────────────────────────────────────
  const handleCustomerSelect = useCallback((c: SelectedCustomer) => {
    setCustomer(c)
    setDeductLoan(false)
    setDeductionAmount('')
    setShowAllProducts(false)
    // Apply VAT automatically based on the account's VAT setting
    setLines((prev) => prev.map((l) => ({ ...l, vatApplied: !c.zeroRated })))
  }, [])

  function switchCustomerType(type: 'casual' | 'account') {
    setCustomerType(type)
    setCustomer(null)
    setShowAllProducts(false)
  }

  // Fired by CasualSelectorPanel when an ID search under Casual matches a
  // customer who is actually registered as an Account — switch tabs and
  // load them there instead of silently keeping the user on Casual.
  const handleAccountMatch = useCallback((c: SelectedCustomer) => {
    setCustomerType('account')
    handleCustomerSelect(c)
  }, [handleCustomerSelect])

  // ── Load from Scale Order ────────────────────────────────────────────────
  type ScaleOrderHit = {
    id: string
    orderNumber: string
    status: string
    weight: string | null
    customerId: string | null
    product: { id: string; name: string; unit?: string; category: string }
    lines?: { weight: string | null; product: { id?: string; name: string; unit: string; category: string } }[]
  }

  async function handleLoadScaleOrder() {
    const term = scaleOrderSearch.trim()
    if (!term) return
    setLoadingScaleOrder(true)
    try {
      const res = await fetch(`/api/scale/orders?search=${encodeURIComponent(term)}&unlinkedOnly=true&pageSize=5`)
      if (!res.ok) { toast.error('Failed to look up scale order'); return }
      const data = await res.json() as { orders: ScaleOrderHit[] }
      const exact = data.orders.find((o) => o.orderNumber.toLowerCase() === term.toLowerCase())
      const match = exact ?? (data.orders.length === 1 ? data.orders[0] : null)
      if (!match) {
        toast.error(data.orders.length === 0 ? 'No matching unlinked scale order found' : 'Multiple matches — enter the full order number')
        return
      }
      if (match.status === 'voided') { toast.error('That scale order has been voided'); return }
      if (!match.customerId) { toast.error('That scale order has no linked customer yet'); return }

      const custRes = await fetch(`/api/customers/${match.customerId}`)
      if (!custRes.ok) { toast.error("Failed to load the scale order's customer"); return }
      const fullCustomer = await custRes.json() as SelectedCustomer & { customerType?: 'casual' | 'account'; priceGroupId?: string | null }

      setCustomerType(fullCustomer.customerType === 'account' ? 'account' : 'casual')
      handleCustomerSelect(fullCustomer)
      setScaleOrderLink({ id: match.id, orderNumber: match.orderNumber })
      setScaleOrderSearch('')

      // Prefill one product line per line on the scale order (orders can
      // carry multiple products); legacy orders without line rows fall
      // back to the single header product/weight.
      const orderLines = match.lines && match.lines.length > 0
        ? match.lines
        : [{ weight: match.weight, product: match.product }]

      const vatApplied = !fullCustomer.zeroRated
      const newLines: LineItem[] = []
      let nextKey = keyCounter
      for (const ol of orderLines) {
        const productId = ol.product?.id ?? match.product.id
        const weight = ol.weight ?? match.weight
        const product = products.find((p) => p.id === productId) ?? null
        let unitPrice = product ? new Decimal(product.defaultBuyPrice).toFixed(2) : ''
        if (product && fullCustomer.priceGroupId) {
          try {
            const priceRes = await fetch(`/api/products/${productId}?priceGroupId=${fullCustomer.priceGroupId}`)
            if (priceRes.ok) {
              const d = await priceRes.json() as { defaultBuyPrice: string }
              unitPrice = new Decimal(d.defaultBuyPrice).toFixed(2)
            }
          } catch { /* use default */ }
        }
        newLines.push({
          ...emptyLine(nextKey, vatApplied),
          productId, product, unitPrice,
          quantity: weight ? new Decimal(weight).toFixed(3) : '',
        })
        nextKey += 1
      }
      setLines(newLines)
      setKeyCounter(nextKey)

      toast.success(`Loaded scale order ${match.orderNumber}`)
    } catch {
      toast.error('Failed to load scale order')
    } finally {
      setLoadingScaleOrder(false)
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function submitPurchase(isPending: boolean) {
    // For casual mode, if no customer is confirmed yet, auto-confirm via ref
    let resolvedCustomer = customer
    if (customerType === 'casual' && !resolvedCustomer) {
      if (!casualPanelRef.current) {
        toast.error('Please fill in customer details first')
        return
      }
      resolvedCustomer = await casualPanelRef.current.confirm()
      if (!resolvedCustomer) return  // validation/creation failed — error already shown
    }

    if (!resolvedCustomer) { toast.error('Please select a customer'); return }
    if (resolvedCustomer.blacklisted) { toast.error('Customer is blacklisted'); return }

    const validLines = lines.filter((l) => l.productId && l.quantity && l.unitPrice)
    if (validLines.length === 0) { toast.error('Add at least one product line'); return }
    for (const l of validLines) {
      if (parseFloat(l.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
      if (parseFloat(l.unitPrice) < 0)  { toast.error('Unit price cannot be negative'); return }
    }

    const deduction = deductLoan && deductionAmount && parseFloat(deductionAmount) > 0 && !isPending
      ? deductionAmount : undefined
    // Deduction is capped server-side — no client-side block needed

    const noteParts: string[] = []
    if (grvNumber) noteParts.push(`GRV:${grvNumber}`)
    if (invoiceNo)  noteParts.push(`INV:${invoiceNo}`)
    if (notes)      noteParts.push(notes)
    const combinedNotes = noteParts.join(' | ') || undefined

    const paymentMethod = isPending ? 'cash' : paymentType as 'cash' | 'eft'
    const status        = isPending ? 'pending' : 'completed'

    const body = {
      customerId: resolvedCustomer.id, paymentMethod, status,
      notes: combinedNotes,
      ...(deduction ? { loanDeductionAmount: deduction } : {}),
      ...(scaleOrderLink ? { scaleOrderId: scaleOrderLink.id } : {}),
      lines: validLines.map((l) => ({
        productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice,
        vatApplied: l.vatApplied,
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
        const offlineRefNumber = `OFF-${Date.now()}`
        await offlineDB.purchases.add({
          id: localId, refNumber: offlineRefNumber, customerId: resolvedCustomer.id,
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

        if (status === 'pending') {
          resetForm()
          mutatePending()
          toast.success(`Purchase saved offline as unpaid — will sync when connected`)
        } else {
          toast.success('Purchase saved offline — will sync when connected')
          // Auto-print in Electron desktop app / local-server PWA, same as
          // the online path — built from data already in hand since there's
          // no server id yet.
          if (canAutoPrint()) {
            try {
              const receiptLines = validLines.map((l) => ({
                productName: products.find((p) => p.id === l.productId)?.name ?? l.productId,
                qty: parseFloat(l.quantity),
                unitPrice: l.unitPrice,
                lineTotal: new Decimal(l.quantity || '0').times(l.unitPrice || '0').toFixed(2),
              }))
              await autoPrintReceipt({
                type: 'purchase',
                data: {
                  refNumber: offlineRefNumber,
                  customerName: `${resolvedCustomer.firstName} ${resolvedCustomer.lastName}`,
                  customerIdNo: resolvedCustomer.idNumber ?? undefined,
                  lines: receiptLines,
                  totalAmount: grandTotal.toFixed(2),
                  paymentMethod,
                  cashierName: '',
                  createdAt: new Date().toISOString(),
                },
              })
            } catch {
              toast.error('Offline print failed — receipt will be available once synced')
            }
          }
        }
        router.push('/app/purchases')
      } else {
        const purchase = data as { id: string; refNumber: string }

        // Upload product photo if one was staged (non-blocking)
        if (photoFile) {
          try {
            const fd = new FormData()
            fd.append('context', 'purchase_photo')
            fd.append('referenceId', purchase.id)
            fd.append('file', photoFile)
            const upRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
            if (upRes.ok) {
              const { key } = await upRes.json() as { key: string }
              await fetch(`/api/purchases/${purchase.id}/photos`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ add: key }),
              })
            }
          } catch { /* photo upload failure is non-blocking */ }
        }

        if (status === 'pending') {
          // Reset form so operator can continue making orders
          resetForm()
          mutatePending()
          toast.success(`Purchase ${purchase.refNumber} saved as unpaid`)
        } else {
          // Auto-print in Electron desktop app / local-server PWA
          if (canAutoPrint()) {
            try {
              await autoPrintReceipt({ type: 'purchase', id: purchase.id })
              toast.success(`Receipt printed: ${purchase.refNumber}`)
              router.push('/app/dashboard')
            } catch {
              // Fall back to showing PrintResultModal on print failure
              toast.error('Print failed — showing manual options')
              setPrintDialog({ id: purchase.id, refNumber: purchase.refNumber })
            }
          } else {
            setPrintDialog({ id: purchase.id, refNumber: purchase.refNumber })
          }
        }
      }
    } catch {
      toast.error('Failed to create purchase')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Pending purchase actions ─────────────────────────────────────────────
  async function handleVoidPurchase(id: string) {
    if (voidReason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setActionLoading(true)
    try {
      const res = await fetch(`/api/purchases/${id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason }),
      })
      if (!res.ok) { const e = await res.json() as { error?: string }; toast.error(e.error ?? 'Failed'); return }
      toast.success('Purchase reversed')
      setVoidId(null); setVoidReason('')
      mutatePending()
    } catch { toast.error('Network error') }
    finally { setActionLoading(false) }
  }

  // ─── Shared styles ────────────────────────────────────────────────────────
  const cellInput      = 'w-full px-1.5 py-0.5 text-[11px] font-mono border rounded-[2px] bg-white focus:outline-none focus:border-[#185ABD]'
  const cellInputStyle = { borderColor: '#ABABAB', color: '#212529' }
  const headerBg       = { background: HEADER_GRAD, borderBottom: '2px solid #B0B0B0' }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Outer bordered container */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* Title bar — Customer Name label + Casual/Account toggle + GRV/Invoice */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderBottom: '2px solid #B0B0B0', background: BAR_GRAD, flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1B3A6B', marginRight: 2 }}>Customer Name</span>

            {/* Casual / Account toggle */}
            <button
              onClick={() => switchCustomerType('casual')}
              style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 2, cursor: 'pointer',
                border: '1px solid #888',
                background: customerType === 'casual' ? '#1B3A6B' : '#E8E8E8',
                color:      customerType === 'casual' ? '#FFF'    : '#333',
              }}
            >
              Casual
            </button>
            <button
              onClick={() => switchCustomerType('account')}
              style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 2, cursor: 'pointer',
                border: '1px solid #888',
                background: customerType === 'account' ? '#1B3A6B' : '#E8E8E8',
                color:      customerType === 'account' ? '#FFF'    : '#333',
              }}
            >
              Account
            </button>

            {/* Load from Scale Order */}
            {scaleOrderLink ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 2, background: '#DBEAFE', color: '#1D4ED8' }}>
                Scale Order: {scaleOrderLink.orderNumber}
                <button
                  type="button"
                  onClick={() => setScaleOrderLink(null)}
                  title="Unlink scale order"
                  style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#1D4ED8', padding: 0 }}
                >
                  <X style={{ width: 11, height: 11 }} />
                </button>
              </span>
            ) : (
              <>
                <input
                  value={scaleOrderSearch}
                  onChange={(e) => setScaleOrderSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLoadScaleOrder() }}
                  placeholder="Scale Order #"
                  style={{ width: 110, fontSize: 11, padding: '2px 6px', border: '1px solid #ABABAB', borderRadius: 2, outline: 'none' }}
                />
                <button
                  type="button"
                  onClick={handleLoadScaleOrder}
                  disabled={loadingScaleOrder || !scaleOrderSearch.trim()}
                  style={{ fontSize: 11, padding: '2px 8px', background: '#E0E0E0', border: '1px solid #999', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, opacity: loadingScaleOrder || !scaleOrderSearch.trim() ? 0.5 : 1 }}
                >
                  {loadingScaleOrder ? <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> : <Scale style={{ width: 10, height: 10 }} />}
                  Load
                </button>
              </>
            )}

            {/* GRV No + Invoice No pushed to right */}
            <div style={{ flex: 1 }} />
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>GRV No</label>
            <input
              value={grvNumber}
              onChange={(e) => setGrvNumber(e.target.value)}
              style={{ width: 72, fontSize: 11, padding: '2px 6px', border: '1px solid #ABABAB', borderRadius: 2, outline: 'none' }}
            />
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Invoice No</label>
            <input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              style={{ width: 72, fontSize: 11, padding: '2px 6px', border: '1px solid #ABABAB', borderRadius: 2, outline: 'none' }}
            />
          </div>

          {/* ── Two-column body ───────────────────────────────────────────── */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          {/* Customer sub-panel (left) */}
          <div style={{ width: 310, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #C0C0C0', overflowY: 'auto' }}>

          {/* Customer selector area */}
          <div style={{ flexShrink: 0, padding: '5px 10px', borderBottom: '1px solid #E0E0E0' }}>

            {/* Casual panel — always shown in casual mode until customer confirmed */}
            {customerType === 'casual' && !customer && (
              <CasualSelectorPanel
                ref={casualPanelRef}
                onSelect={handleCustomerSelect}
                onAccountMatch={handleAccountMatch}
                hideConfirmButton
              />
            )}

            {/* Account panel */}
            {customerType === 'account' && !customer && (
              <AccountSelectorPanel onSelect={handleCustomerSelect} />
            )}

            {/* Selected customer details */}
            {customer && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '3px 14px', alignItems: 'center', marginBottom: 4 }}>
                  {customer.companyName && (
                    <>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#1B3A6B' }}>Vendor</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#212529', gridColumn: 'span 3' }}>{customer.companyName}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#1B3A6B' }}>Parent</span>
                      <span style={{ fontSize: 11, color: '#212529', gridColumn: 'span 3' }}>{customer.contactPerson || '—'}</span>
                    </>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#1B3A6B' }}>Name</span>
                  <span style={{ fontSize: 11, color: '#212529' }}>
                    {customer.firstName} {customer.lastName}
                    {customer.blacklisted && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#EF4444' }}>⚠ Blacklisted</span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#1B3A6B' }}>ID Num</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#212529' }}>{customer.idNumber}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#1B3A6B' }}>Tel</span>
                  <span style={{ fontSize: 11, color: '#212529' }}>{customer.phone}</span>
                  <span />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {customer.priceGroupId && (
                      <span style={{ fontSize: 10, padding: '1px 5px', background: '#DBEAFE', color: '#1D4ED8', borderRadius: 2 }}>Custom Pricing</span>
                    )}
                    {customer.zeroRated && (
                      <span style={{ fontSize: 10, padding: '1px 5px', background: '#FEF9C3', color: '#854D0E', borderRadius: 2 }}>No VAT</span>
                    )}
                    {!showAllProducts && (customer.tradeCommodities?.length ?? 0) > 0 && (
                      <button onClick={() => setShowAllProducts(true)}
                        style={{ fontSize: 10, padding: '1px 6px', border: '1px solid #ABABAB', borderRadius: 2, color: '#6C757D', background: 'none', cursor: 'pointer' }}>
                        Show All Products
                      </button>
                    )}
                    <button onClick={() => setCustomer(null)}
                      style={{ fontSize: 10, padding: '1px 8px', border: '1px solid #ABABAB', borderRadius: 2, color: '#6C757D', background: 'none', cursor: 'pointer', marginLeft: 'auto' }}>
                      Change
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Outstanding loan warning */}
          {customer && hasOutstandingLoan && (
            <div style={{ flexShrink: 0, margin: '0 10px 4px', padding: '5px 8px', border: '1px solid #F59E0B', borderRadius: 2, background: '#FFFBEB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#92400E' }}>
                <AlertTriangle style={{ width: 12, height: 12 }} />
                Outstanding loan: R {new Decimal(outstandingLoanAmount).toFixed(2)}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#78350F', cursor: 'pointer', marginTop: 3 }}>
                <input
                  type="checkbox"
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
                    type="number" min="0" step="0.01" value={deductionAmount}
                    onChange={(e) => setDeductionAmount(e.target.value)}
                    style={{ width: 80, fontSize: 11, border: '1px solid #D97706', borderRadius: 2, padding: '1px 4px', outline: 'none' }}
                  />
                )}
              </label>
            </div>
          )}

          {/* Comments */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px', borderBottom: '1px solid #E0E0E0' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Comments:</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any remarks…"
              style={{ flex: 1, fontSize: 12, padding: '2px 8px', border: '1px solid #ABABAB', borderRadius: 2, color: '#212529', outline: 'none' }}
            />
          </div>

          {/* Payment Type */}
          <div style={{ flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px 10px', padding: '3px 10px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', width: '100%' }}>Payment Type:</label>
            {(['unpaid', 'cash', 'eft'] as const).map((type) => (
              <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#374151', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="paymentType"
                  checked={paymentType === type}
                  onChange={() => {
                    setPaymentType(type)
                    if (type === 'unpaid') { setDeductLoan(false); setDeductionAmount('') }
                  }}
                  style={{ width: 13, height: 13 }}
                />
                {type === 'unpaid' ? 'Unpaid' : type === 'eft' ? 'EFT' : type.charAt(0).toUpperCase() + type.slice(1)}
              </label>
            ))}
          </div>

          </div>
          {/* end Customer sub-panel */}

          {/* Product sub-panel (right) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── Product Grid ─────────────────────────────────────────────── */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderBottom: '1px solid #C0C0C0' }}>

            {/* Grid header */}
            <div
              style={{
                ...headerBg,
                display: 'grid',
                gridTemplateColumns: '1fr 72px 80px 80px 92px 80px 28px 26px',
                gap: 4,
                padding: '4px 8px',
                flexShrink: 0,
              }}
            >
              {['Product', 'Qty (kg)', 'Price (R)', 'Sub Total', 'VAT', 'Total', '', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#374151' }}>{h}</span>
              ))}
            </div>

            {/* Scrollable lines + Add Line at bottom of scroll */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {lines.map((line) => {
                const qty      = new Decimal(line.quantity  || '0')
                const price    = new Decimal(line.unitPrice || '0')
                const lineSub  = qty.times(price)
                const lineVat  = line.vatApplied ? lineSub.times(vatRate) : new Decimal(0)
                const lineTot  = lineSub.plus(lineVat)

                return (
                  <div key={line.key} style={{ borderTop: '1px solid #E0E0E0' }}>
                    {/* Main row */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 72px 80px 80px 92px 80px 28px 26px',
                        gap: 4,
                        padding: '4px 8px',
                        alignItems: 'center',
                        minHeight: 32,
                      }}
                    >
                      {/* Product */}
                      <ProductCategoryPicker
                        products={visibleProducts}
                        value={line.productId}
                        onChange={(productId) => onProductSelect(line.key, productId)}
                      />

                      {/* Qty */}
                      <input
                        type="number" step="0.001" min="0" placeholder="0.000"
                        value={line.quantity}
                        onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                        className={cellInput} style={cellInputStyle}
                      />

                      {/* Price */}
                      <input
                        type="number" step="0.01" min="0" placeholder="0.00"
                        value={line.unitPrice}
                        onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })}
                        className={cellInput} style={cellInputStyle}
                      />

                      {/* Sub Total */}
                      <span style={{ fontSize: 11, fontFamily: 'monospace', padding: '0 4px', color: qty.gt(0) ? '#212529' : '#9CA3AF' }}>
                        {qty.gt(0) ? `R ${lineSub.toFixed(2)}` : '—'}
                      </span>

                      {/* VAT — read-only indicator; applicability follows the account's VAT setting */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span
                          title={line.vatApplied ? 'VAT applies to this line' : 'VAT does not apply to this line'}
                          style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 2, flexShrink: 0,
                            background: line.vatApplied ? '#DBEAFE' : '#F3F4F6',
                            color:      line.vatApplied ? '#1D4ED8' : '#9CA3AF',
                          }}
                        >
                          {line.vatApplied ? 'VAT' : 'No VAT'}
                        </span>
                        {qty.gt(0) && line.vatApplied && (
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#212529' }}>
                            R {lineVat.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Total */}
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, padding: '0 4px', color: qty.gt(0) ? colors.action : '#9CA3AF' }}>
                        {qty.gt(0) ? `R ${lineTot.toFixed(2)}` : '—'}
                      </span>

                      {/* Scale toggle */}
                      <button
                        type="button"
                        title="Toggle weighing"
                        onClick={() => patchLine(line.key, { weighMode: !line.weighMode })}
                        style={{
                          height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, cursor: 'pointer',
                          ...(line.weighMode
                            ? { background: '#185ABD', color: '#fff', border: 'none' }
                            : { border: '1px solid #ABABAB', color: '#6C757D', background: 'transparent' }),
                        }}
                      >
                        <Scale style={{ width: 12, height: 12 }} />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                        style={{ height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, background: 'transparent', border: 'none', color: '#9CA3AF', cursor: lines.length === 1 ? 'not-allowed' : 'pointer', opacity: lines.length === 1 ? 0.25 : 1 }}
                        onMouseEnter={(e) => { if (lines.length > 1) (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
                      >
                        <Trash2 style={{ width: 12, height: 12 }} />
                      </button>
                    </div>

                    {/* Weigh sub-row */}
                    {line.weighMode && (
                      <div
                        style={{ padding: '6px 12px', display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', background: '#EFF6FF', borderTop: '1px solid #BFDBFE' }}
                      >
                        {/* Scale selector */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 500, color: colors.textSecondary }}>Scale</span>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 500, color: colors.textSecondary }}>Gross (kg)</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input
                              type="number" step="0.001" placeholder="0.000"
                              value={line.grossQty}
                              onChange={(e) => recomputeNet(line.key, e.target.value, line.tareQty, line.deductionQty)}
                              style={{ height: 24, width: 76, borderRadius: 2, border: '1px solid #ABABAB', padding: '0 6px', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
                            />
                            <button
                              type="button"
                              disabled={line.weighingGross}
                              onClick={() => handleWeighGross(line)}
                              style={{ height: 24, padding: '0 6px', borderRadius: 2, background: '#185ABD', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: line.weighingGross ? 0.6 : 1 }}
                            >
                              {line.weighingGross ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : <RefreshCw style={{ width: 12, height: 12 }} />}
                            </button>
                          </div>
                        </div>

                        {/* Tare */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 500, color: colors.textSecondary }}>Tare (kg)</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input
                              type="number" step="0.001" placeholder="0.000"
                              value={line.tareQty}
                              onChange={(e) => recomputeNet(line.key, line.grossQty, e.target.value, line.deductionQty)}
                              style={{ height: 24, width: 76, borderRadius: 2, border: '1px solid #ABABAB', padding: '0 6px', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
                            />
                            <button
                              type="button"
                              disabled={line.weighingTare}
                              onClick={() => handleWeighTare(line)}
                              style={{ height: 24, padding: '0 6px', borderRadius: 2, border: '1px solid #ABABAB', background: '#fff', color: '#6C757D', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: line.weighingTare ? 0.6 : 1 }}
                            >
                              {line.weighingTare ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : <RefreshCw style={{ width: 12, height: 12 }} />}
                            </button>
                          </div>
                        </div>

                        {/* Net display */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 500, color: colors.textSecondary }}>Net (kg)</span>
                          <div style={{ height: 24, display: 'flex', alignItems: 'center', padding: '0 6px', borderRadius: 2, border: `1px solid ${colors.netWeightBorder}`, background: colors.netWeightBg, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: colors.netWeightText, minWidth: 56 }}>
                            {Decimal.max(
                              new Decimal(line.grossQty || '0').minus(new Decimal(line.tareQty || '0')),
                              new Decimal('0'),
                            ).toFixed(2)}
                          </div>
                        </div>

                        {/* Deduction */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 500, color: colors.textSecondary }}>Deduction (kg)</span>
                          <input
                            type="number" step="0.001" min="0" placeholder="0.000"
                            value={line.deductionQty}
                            onChange={(e) => {
                              const net  = Decimal.max(
                                new Decimal(line.grossQty || '0').minus(new Decimal(line.tareQty || '0')),
                                new Decimal('0'),
                              )
                              const paid = Decimal.max(net.minus(new Decimal(e.target.value || '0')), new Decimal('0'))
                              patchLine(line.key, { deductionQty: e.target.value, quantity: paid.toFixed(2) })
                            }}
                            style={{ height: 24, width: 76, borderRadius: 2, border: '1px solid #ABABAB', padding: '0 6px', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
                          />
                        </div>

                        {parseFloat(line.deductionQty || '0') > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: colors.action }}>Paid Qty (kg)</span>
                            <div style={{ height: 24, display: 'flex', alignItems: 'center', padding: '0 6px', borderRadius: 2, border: `1px solid ${colors.action}`, background: colors.actionBg, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: colors.action, minWidth: 56 }}>
                              {line.quantity || '0.000'}
                            </div>
                          </div>
                        )}

                        {line.tareQty && parseFloat(line.tareQty) > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 10, fontWeight: 500, color: colors.textSecondary }}>Tare Reason</span>
                            <input
                              placeholder="e.g. Bag…"
                              value={line.tareReason}
                              onChange={(e) => patchLine(line.key, { tareReason: e.target.value })}
                              style={{ height: 24, width: 100, borderRadius: 2, border: '1px solid #ABABAB', padding: '0 6px', fontSize: 11, outline: 'none' }}
                            />
                          </div>
                        )}

                        {parseFloat(line.deductionQty || '0') > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 10, fontWeight: 500, color: colors.textSecondary }}>Deduction Reason</span>
                            <input
                              placeholder="e.g. Contamination…"
                              value={line.deductionReason}
                              onChange={(e) => patchLine(line.key, { deductionReason: e.target.value })}
                              style={{ height: 24, width: 120, borderRadius: 2, border: '1px solid #ABABAB', padding: '0 6px', fontSize: 11, outline: 'none' }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Add Line — at bottom of scroll */}
              <div style={{ padding: '5px 8px', borderTop: '1px solid #E0E0E0' }}>
                <button
                  type="button"
                  onClick={addLine}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: '#185ABD', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <Plus style={{ width: 12, height: 12 }} /> Add Line
                </button>
              </div>
            </div>
          </div>

          </div>
          {/* end Product sub-panel */}

          </div>
          {/* end Two-column body */}

          {/* ── Pending Purchases ──────────────────────────────────────────── */}
          <div style={{ flexShrink: 0, borderTop: '2px solid #B0B0B0', display: 'flex', flexDirection: 'column', height: 85 }}>

            {/* Header */}
            <div style={{ ...headerBg, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Pending Purchases</span>
              {pendingPurchases.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#F59E0B', color: '#fff', borderRadius: 10, padding: '0 5px', minWidth: 18, textAlign: 'center' }}>
                  {pendingPurchases.length}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => mutatePending()}
                style={{ fontSize: 10, padding: '1px 6px', background: '#E0E0E0', border: '1px solid #999', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
              >
                <RefreshCw style={{ width: 9, height: 9 }} /> Refresh
              </button>
              <button
                onClick={() => router.push('/app/payments/balances')}
                style={{ fontSize: 10, padding: '1px 6px', background: '#E0E0E0', border: '1px solid #999', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
              >
                <Users style={{ width: 9, height: 9 }} /> Account Balances
              </button>
              <button
                onClick={() => router.push('/app/purchases')}
                style={{ fontSize: 10, padding: '1px 6px', background: '#E0E0E0', border: '1px solid #999', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
              >
                <ClipboardList style={{ width: 9, height: 9 }} /> Edit Transaction
              </button>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 48px 80px 80px 80px 60px 28px', gap: 4, padding: '2px 8px', background: '#F8F9FA', borderBottom: '1px solid #D0D0D0', flexShrink: 0 }}>
              {['Ref #', 'Customer', 'Lines', 'Total', 'Paid', 'Balance', 'Time', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6C757D' }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {pendingPurchases.length === 0 ? (
                <div style={{ padding: '8px 8px', textAlign: 'center', fontSize: 11, color: '#9CA3AF' }}>
                  No pending purchases
                </div>
              ) : pendingPurchases.map((p) => (
                <div key={p.id} style={{ borderTop: '1px solid #E8E8E8' }}>

                  {/* Main row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 48px 80px 80px 80px 60px 28px', gap: 4, padding: '4px 8px', alignItems: 'center', background: voidId === p.id ? '#FFFBEB' : 'transparent' }}>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#1B3A6B', fontWeight: 600 }}>{p.refNumber}</span>
                    <span style={{ fontSize: 11, color: '#212529', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.customer.firstName} {p.customer.lastName}</span>
                    <span style={{ fontSize: 10, color: '#6C757D', textAlign: 'center' }}>{p.lines.length}</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: colors.action, fontWeight: 600 }}>R {new Decimal(p.totalAmount).toFixed(2)}</span>
                    {(() => { const paid = new Decimal(p.amountPaid ?? '0'); return <span style={{ fontSize: 10, fontFamily: 'monospace', color: paid.gt(0) ? colors.action : '#9CA3AF' }}>{paid.gt(0) ? `R ${paid.toFixed(2)}` : '—'}</span> })()}
                    {(() => { const bal = new Decimal(p.totalAmount).minus(new Decimal(p.loanDeductionAmount ?? '0')).minus(new Decimal(p.amountPaid ?? '0')); const partial = new Decimal(p.amountPaid ?? '0').gt(0); return <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color: partial ? '#C9A020' : colors.action }}>R {bal.toFixed(2)}</span> })()}
                    <span style={{ fontSize: 10, color: '#9CA3AF' }}>{timeAgo(p.createdAt)}</span>

                    {/* ⋮ action menu */}
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => {
                          const next = actionMenuId === p.id ? null : p.id
                          setActionMenuId(next)
                          setActionMenuRect(next ? (e.currentTarget as HTMLButtonElement).getBoundingClientRect() : null)
                        }}
                        style={{ height: 22, width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #C0C0C0', borderRadius: 2, background: actionMenuId === p.id ? '#E8E8E8' : 'transparent', cursor: 'pointer', fontSize: 14, color: '#374151', lineHeight: 1 }}
                      >
                        ⋮
                      </button>

                      {actionMenuId === p.id && actionMenuRect && (
                        <div style={{ position: 'fixed', right: window.innerWidth - actionMenuRect.right, bottom: window.innerHeight - actionMenuRect.top + 2, zIndex: 9999, background: '#fff', border: '1px solid #C0C0C0', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 190 }}>
                          {([
                            { label: 'View Customer History',  action: () => { router.push(`/app/customers/${p.customer.id}`); setActionMenuId(null) } },
                            { label: 'Log to Police Register', action: () => { router.push(`/app/police-register/new?purchaseId=${p.id}`); setActionMenuId(null) } },
                            { label: 'Void Purchase', destructive: true, action: () => { setVoidId(p.id); setActionMenuId(null) } },
                          ] as { label: string; action: () => void; destructive?: boolean }[]).map((item, idx) => (
                            <button
                              key={idx}
                              onClick={item.action}
                              style={{ display: 'block', width: '100%', padding: '6px 12px', textAlign: 'left', fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: item.destructive ? '#EF4444' : '#212529', borderTop: idx === 8 ? '1px solid #E0E0E0' : 'none' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = item.destructive ? '#FEF2F2' : '#F3F4F6' }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Void Purchase inline form */}
                  {voidId === p.id && (
                    <div style={{ padding: '6px 12px', background: '#FFF5F5', borderTop: '1px solid #FECACA', display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#991B1B', paddingTop: 4 }}>Void reason:</span>
                      <textarea
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                        placeholder="Reason (min 5 characters)…"
                        rows={2}
                        style={{ flex: 1, minWidth: 180, fontSize: 11, border: '1px solid #FECACA', borderRadius: 2, padding: '3px 6px', outline: 'none', resize: 'vertical' }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 6, paddingTop: 2 }}>
                        <button
                          disabled={actionLoading || voidReason.trim().length < 5}
                          onClick={() => handleVoidPurchase(p.id)}
                          style={{ height: 24, padding: '0 10px', fontSize: 11, fontWeight: 600, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 2, cursor: 'pointer', opacity: actionLoading || voidReason.trim().length < 5 ? 0.5 : 1 }}
                        >
                          {actionLoading ? '…' : 'Void'}
                        </button>
                        <button
                          onClick={() => { setVoidId(null); setVoidReason('') }}
                          style={{ height: 24, padding: '0 8px', fontSize: 11, background: 'none', border: '1px solid #ABABAB', borderRadius: 2, cursor: 'pointer', color: '#6C757D' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div style={{ flexShrink: 0, padding: '4px 10px', borderTop: '2px solid #B0B0B0', background: '#F8F9FA', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#6C757D' }}>Sub Total</span>
                <span style={{ fontFamily: 'monospace', color: '#212529' }}>R {subTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#6C757D' }}>VAT ({customer?.zeroRated ? '0%' : '15%'})</span>
                <span style={{ fontFamily: 'monospace', color: '#6C757D' }}>R {vatAmount.toFixed(2)}</span>
              </div>
              <div style={{ height: 1, background: '#C0C0C0', margin: '2px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: '#212529' }}>Total</span>
                <span style={{ fontFamily: 'monospace', color: colors.action }}>R {grandTotal.toFixed(2)}</span>
              </div>
              {deductLoan && loanDeduct.gt(0) && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#92400E' }}>Loan Deduction</span>
                    <span style={{ fontFamily: 'monospace', color: '#92400E' }}>− R {loanDeduct.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: '#1B3A6B' }}>Cash to Pay</span>
                    <span style={{ fontFamily: 'monospace', color: '#185ABD' }}>R {cashToPay.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
        {/* end LEFT COLUMN */}

        {/* ── RIGHT COLUMN — Scales + Photo ────────────────────────────── */}
        <div style={{ width: 250, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #C0C0C0', flexShrink: 0 }}>

          {/* Scale 1 */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #C0C0C0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Scale 1:</span>
              <button
                onClick={handleScale1Read}
                disabled={readingScale1}
                style={{ fontSize: 10, padding: '1px 8px', background: '#E0E0E0', border: '1px solid #999', borderRadius: 2, cursor: readingScale1 ? 'not-allowed' : 'pointer', opacity: readingScale1 ? 0.6 : 1 }}
              >
                {readingScale1 ? <Loader2 style={{ width: 10, height: 10, display: 'inline', animation: 'spin 1s linear infinite' }} /> : 'Read'}
              </button>
            </div>
            <div style={{ background: '#0A1628', color: '#00FF88', fontFamily: 'monospace', fontSize: 26, fontWeight: 700, textAlign: 'center', padding: '6px 4px', borderRadius: 3, letterSpacing: 3 }}>
              {scale1 !== null ? `${scale1} kg` : '─'}
            </div>
          </div>

          {/* Scale 2 */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #C0C0C0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Scale 2:</span>
              <button
                onClick={handleScale2Read}
                disabled={readingScale2}
                style={{ fontSize: 10, padding: '1px 8px', background: '#E0E0E0', border: '1px solid #999', borderRadius: 2, cursor: readingScale2 ? 'not-allowed' : 'pointer', opacity: readingScale2 ? 0.6 : 1 }}
              >
                {readingScale2 ? <Loader2 style={{ width: 10, height: 10, display: 'inline', animation: 'spin 1s linear infinite' }} /> : 'Read'}
              </button>
            </div>
            <div style={{ background: '#0A1628', color: '#00FF88', fontFamily: 'monospace', fontSize: 26, fontWeight: 700, textAlign: 'center', padding: '6px 4px', borderRadius: 3, letterSpacing: 3 }}>
              {scale2 !== null ? `${scale2} kg` : '─'}
            </div>
          </div>

          {/* Product Photo */}
          <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Product Photo</span>
              {photoPreview && (
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                  style={{ fontSize: 10, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Remove
                </button>
              )}
            </div>

            <label
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: photoPreview ? '1px solid #C0C0C0' : '2px dashed #ABABAB',
                borderRadius: 2,
                cursor: 'pointer',
                minHeight: 140,
                overflow: 'hidden',
                position: 'relative',
                background: '#FAFAFA',
              }}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Product"
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <Camera style={{ width: 28, height: 28, color: '#9CA3AF' }} />
                  <span style={{ fontSize: 11, color: '#6C757D', textAlign: 'center', lineHeight: 1.4 }}>
                    Click to add<br />product photo
                  </span>
                </div>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setPhotoFile(f)
                  setPhotoPreview(URL.createObjectURL(f))
                  e.target.value = ''
                }}
              />
            </label>
          </div>

        </div>
        {/* end RIGHT COLUMN */}

      </div>
      {/* end outer bordered container */}

      {/* ── Action bar ────────────────────────────────────────────────────── */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', borderTop: '2px solid #B0B0B0', background: HEADER_GRAD, flexShrink: 0 }}
      >
        <Btn onClick={handleCancel} disabled={submitting}>Cancel</Btn>
        <button
          type="button"
          onClick={() => submitPurchase(paymentType === 'unpaid')}
          disabled={submitting || (!!customer && !!customer.blacklisted)}
          style={{ height: 28, padding: '0 24px', borderRadius: 2, fontSize: 12, fontWeight: 700, background: BAR_GRAD, border: CARD_BORDER, color: colors.textPrimary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: submitting || (!!customer && !!customer.blacklisted) ? 0.4 : 1 }}
        >
          {submitting
            ? <><Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> Submitting…</>
            : paymentType === 'unpaid' ? 'Submit' : `Submit · R ${cashToPay.toFixed(2)}`}
        </button>
      </div>

      {/* Overlay to close action menu on outside click */}
      {actionMenuId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
          onClick={() => setActionMenuId(null)}
        />
      )}

      {/* Print result dialog */}
      {printDialog && (
        <PrintResultModal
          type="purchase"
          id={printDialog.id}
          refNumber={printDialog.refNumber}
          onClose={() => router.push(`/app/purchases/new?t=${Date.now()}`)}
          onDone={() => router.push('/app/dashboard')}
        />
      )}

    </div>
  )
}
