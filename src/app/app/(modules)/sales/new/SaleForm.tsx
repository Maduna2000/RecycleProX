'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Loader2, Scale, RefreshCw, Camera, ClipboardList, Wallet, Lock, Split } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { AccountSelectorPanel } from '@/components/customers/AccountSelectorPanel'
import { ProductCategoryPicker } from '@/components/products/ProductCategoryPicker'
import { PrintResultModal } from '@/components/PrintResultModal'
import { RecordPaymentModal, type PayTarget } from '@/components/sales/RecordPaymentModal'
import { AdminPinUnlockModal, type BusinessLoanFullSummary } from '@/components/business-loans/AdminPinUnlockModal'
import Decimal from 'decimal.js'
import { colors } from '@/lib/design-tokens'
import { BAR_GRAD } from '@/components/rpx/styles'
import { Dialog } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Btn, HEADER_GRAD, winBevel, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { useOfflineMutation } from '@/hooks/useOfflineFetch'
import { useOfflineLookup } from '@/hooks/useOfflineLookup'
import { offlineDB } from '@/lib/offline/db'
import { fetcher } from '@/lib/swrFetcher'
import { offlineFetcher } from '@/lib/offline/responseCache'
import { salesListFetcher } from '@/lib/offline/fetchers/sales'
import { useSystemCurrency } from '@/hooks/useSystemCurrency'
import { canAutoPrint, autoPrintReceipt } from '@/lib/print/autoPrintClient'


type Product = {
  id: string; code: string; name: string; category: string
  unit: string; defaultBuyPrice: string; defaultSellPrice: string
}

type StockRow = { product: { id: string }; onHand: string }

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string | null
  phone: string; blacklisted: boolean; priceGroupId?: string | null
  zeroRated?: boolean
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

type PendingSale = {
  id: string
  refNumber: string
  buyerName: string
  buyerIdNumber?: string
  customerId?: string
  lines: { id: string }[]
  totalAmount: string
  amountPaid?: string
  paymentMethod: string
  createdAt: string
}

// Shape handed in by /app/sales/[id]/edit — a pending sale with nothing
// paid against it, being re-opened for correction. See updateSale in
// saleService.ts for the backend side of this.
export type EditingSale = {
  id: string
  refNumber: string
  paymentMethod: string
  notes?: string | null
  applyVat?: boolean
  buyerName?: string | null
  buyerIdNumber?: string | null
  buyerPhone?: string | null
  customer?: SelectedCustomer | null
  lines: {
    productId: string
    quantity: string
    unitPrice: string
    grossQty?: string | null
    tareQty?: string | null
    tareReason?: string | null
    deductionQty?: string | null
    deductionReason?: string | null
    product: Product
  }[]
}

const emptyLine = (key: number): LineItem => ({
  key, productId: '', product: null, quantity: '', grossQty: '', tareQty: '',
  tareReason: '', deductionQty: '', deductionReason: '', unitPrice: '',
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

// ─── SaleForm ─────────────────────────────────────────────────────────────────
// editingSale, when passed (by /app/sales/[id]/edit), switches the form into
// edit mode: the fields below seed from it on mount and Submit calls PATCH
// instead of POST. Everything else — scale reads, offline queueing on
// create, the business-loan PIN flow — is untouched and keeps behaving
// exactly as it does for a brand-new sale.
export function SaleForm({ editingSale }: { editingSale?: EditingSale } = {}) {
  const router    = useRouter()
  const readScale = useScaleRead()
  const { mutate: offlineMutate } = useOfflineMutation()
  const { getActiveProducts, resolveProductPrice } = useOfflineLookup()
  const { confirm } = useConfirm()
  const { symbol: currSym } = useSystemCurrency()

  // ── Buyer state ───────────────────────────────────────────────────────────
  const [buyerMode,     setBuyerMode]     = useState<'walkin' | 'account'>('walkin')
  const [customer,      setCustomer]      = useState<SelectedCustomer | null>(null)
  const [buyerName,     setBuyerName]     = useState('')
  const [buyerIdNumber, setBuyerIdNumber] = useState('')
  const [buyerPhone,    setBuyerPhone]    = useState('')

  // ── Transaction state ─────────────────────────────────────────────────────
  const [lines,        setLines]        = useState<LineItem[]>([emptyLine(1)])
  const [paymentType,  setPaymentType]  = useState<'unpaid' | 'cash' | 'eft'>('cash')
  const [notes,        setNotes]        = useState('')
  const [invoiceNo,    setInvoiceNo]    = useState('')
  // VAT is opt-in: unticked by default, auto-filled from the account
  // customer's VAT setting on select, always overridable by the cashier.
  const [applyVat,     setApplyVat]     = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [keyCounter,   setKeyCounter]   = useState(2)
  const [printDialog,  setPrintDialog]  = useState<{ id: string; refNumber: string } | null>(null)

  // ── Business loan deduction — mandatory once the PIN reveals a balance;
  // there is no manual toggle. `businessLoanSummary` set = deduction applies. ─
  const [businessLoanAmount,   setBusinessLoanAmount]   = useState('')
  const [businessLoanPinOpen,  setBusinessLoanPinOpen]  = useState(false)
  const [businessLoanSummary,  setBusinessLoanSummary]  = useState<BusinessLoanFullSummary | null>(null)
  const [settlementConfirmOpen, setSettlementConfirmOpen] = useState(false)

  // ── Pending sales state ───────────────────────────────────────────────────
  const [actionMenuId,   setActionMenuId]   = useState<string | null>(null)
  const [actionMenuRect, setActionMenuRect] = useState<DOMRect | null>(null)
  const [payTarget,      setPayTarget]      = useState<PayTarget | null>(null)
  const [voidId,         setVoidId]         = useState<string | null>(null)
  const [voidReason,     setVoidReason]     = useState('')
  const [actionLoading,  setActionLoading]  = useState(false)

  // ── Photo state ───────────────────────────────────────────────────────────
  const [photoFile,    setPhotoFile]    = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // ── Scale display state ───────────────────────────────────────────────────
  const [scale1,        setScale1]        = useState<string | null>(null)
  const [scale2,        setScale2]        = useState<string | null>(null)
  const [readingScale1, setReadingScale1] = useState(false)
  const [readingScale2, setReadingScale2] = useState(false)

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: productsData } = useSWR<Product[]>('/api/products?active=true', () => getActiveProducts())
  const { data: stockData }    = useSWR<{ stock: StockRow[] }>('/api/stock/on-hand', offlineFetcher)

  const buyerKey = buyerMode === 'account' && customer
    ? `/api/sales?status=pending&pageSize=20&search=${encodeURIComponent(`${customer.firstName} ${customer.lastName}`)}`
    : null
  const { data: pendingData, mutate: mutatePending } = useSWR<{ sales: PendingSale[] }>(
    buyerKey ?? '/api/sales?status=pending&pageSize=20',
    salesListFetcher,
    { refreshInterval: 30_000 },
  )
  const pendingSales = pendingData?.sales ?? []

  // Existence-only — never a figure. Any role can see this warning; the
  // actual balance requires an admin PIN (businessLoanPinOpen below), same
  // gate as Split Payment on a pending sale.
  const { data: businessLoanData } = useSWR<{ hasOutstanding: boolean }>(
    buyerMode === 'account' && customer ? `/api/customers/${customer.id}/business-loans` : null,
    fetcher,
  )
  const hasOutstandingBusinessLoan = businessLoanData?.hasOutstanding === true

  // Reset the deduction state whenever the buyer changes so a stale unlocked
  // balance from a previous customer never carries over.
  useEffect(() => {
    setBusinessLoanAmount('')
    setBusinessLoanSummary(null)
  }, [customer?.id])

  // ── Seed from editingSale (edit mode only) ────────────────────────────────
  useEffect(() => {
    if (!editingSale) return
    if (editingSale.customer) {
      setBuyerMode('account')
      setCustomer(editingSale.customer)
    } else {
      setBuyerMode('walkin')
      setBuyerName(editingSale.buyerName ?? '')
      setBuyerIdNumber(editingSale.buyerIdNumber ?? '')
      setBuyerPhone(editingSale.buyerPhone ?? '')
    }
    setLines(editingSale.lines.map((l, i) => ({
      key: i + 1,
      productId: l.productId,
      product: l.product,
      quantity: l.quantity,
      grossQty: l.grossQty ?? '',
      tareQty: l.tareQty ?? '',
      tareReason: l.tareReason ?? '',
      deductionQty: l.deductionQty ?? '',
      deductionReason: l.deductionReason ?? '',
      unitPrice: l.unitPrice,
      weighMode: false,
      selectedScale: '1',
      weighingGross: false,
      weighingTare: false,
    })))
    setKeyCounter(editingSale.lines.length + 1)
    setPaymentType(editingSale.paymentMethod === 'eft' ? 'eft' : 'cash')
    setNotes(editingSale.notes ?? '')
    setApplyVat(!!editingSale.applyVat)
    // Seeds once per sale being edited — deliberately not reacting to every
    // field on editingSale, or the user's own in-progress edits would keep
    // getting overwritten as they type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSale?.id])

  const products = productsData ?? []
  const stockMap = new Map((stockData?.stock ?? []).map((r) => [r.product.id, new Decimal(r.onHand ?? '0')]))

  // ── Derived calculations ──────────────────────────────────────────────────
  // VAT is opt-in via the "Apply VAT" checkbox — never applied unless ticked,
  // matching the server. A zero-rated account customer can never carry VAT
  // even if the checkbox is left checked.
  const vatRate = applyVat && !(buyerMode === 'account' && customer?.zeroRated) ? new Decimal('0.15') : new Decimal(0)

  const subTotal = lines.reduce((sum, l) => {
    return sum.plus(new Decimal(l.quantity || '0').times(new Decimal(l.unitPrice || '0')))
  }, new Decimal(0))
  const vatAmount = subTotal.times(vatRate)
  const total     = subTotal.plus(vatAmount)

  const hasStockError = lines.some((l) => {
    if (!l.productId || !l.quantity) return false
    const onHand = stockMap.get(l.productId) ?? new Decimal(0)
    return new Decimal(l.quantity).gt(onHand)
  })

  const isBlacklisted = buyerMode === 'account' && customer?.blacklisted === true

  // ── Reset (built from scratch — the pending-success path here just
  // navigates away today; Cancel is the first place this is needed) ───────
  function resetForm() {
    setBuyerMode('walkin')
    setCustomer(null)
    setBuyerName('')
    setBuyerIdNumber('')
    setBuyerPhone('')
    setLines([emptyLine(keyCounter)])
    setKeyCounter((k) => k + 1)
    setPaymentType('cash')
    setNotes('')
    setInvoiceNo('')
    setApplyVat(false)
    setBusinessLoanAmount('')
    setBusinessLoanPinOpen(false)
    setBusinessLoanSummary(null)
    setSettlementConfirmOpen(false)
    setPhotoFile(null)
    setPhotoPreview(null)
    setScale1(null)
    setScale2(null)
    setReadingScale1(false)
    setReadingScale2(false)
  }

  const hasEnteredData =
    !!customer ||
    !!buyerName || !!buyerIdNumber || !!buyerPhone ||
    lines.some((l) => l.productId || l.quantity || l.unitPrice) ||
    !!photoFile

  async function handleCancel() {
    if (hasEnteredData) {
      const confirmed = await confirm({
        title: 'Discard this sale?',
        message: 'You have entered details for this sale. Leaving now will discard everything entered so far.',
        variant: 'warning',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      })
      if (!confirmed) return
    }
    resetForm()
    router.push(editingSale ? `/app/sales/${editingSale.id}` : '/app/sales')
  }

  // ── Line management ───────────────────────────────────────────────────────
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
    patchLine(key, { quantity: paid.toFixed(2), grossQty: grossStr, tareQty: tareStr })
  }

  // ── Product selection ─────────────────────────────────────────────────────
  async function onProductSelect(key: number, productId: string) {
    const product = products.find((p) => p.id === productId) ?? null
    let unitPrice = product ? new Decimal(product.defaultSellPrice).toFixed(2) : ''
    if (product && customer?.priceGroupId) {
      const resolved = await resolveProductPrice(productId, customer.priceGroupId, 'sell')
      if (resolved) unitPrice = new Decimal(resolved).toFixed(2)
    }
    patchLine(key, { productId, product, unitPrice })
  }

  // ── Scale (per-line weigh mode) ───────────────────────────────────────────
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

  // ── Scale panel reads ─────────────────────────────────────────────────────
  async function handleScale1Read() {
    setReadingScale1(true)
    try { const w = await readScale('1'); setScale1(w) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Scale 1 not responding') }
    finally { setReadingScale1(false) }
  }

  async function handleScale2Read() {
    setReadingScale2(true)
    try { const w = await readScale('2'); setScale2(w) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Scale 2 not responding') }
    finally { setReadingScale2(false) }
  }

  // ── Customer selection ────────────────────────────────────────────────────
  const handleCustomerSelect = useCallback((c: SelectedCustomer) => {
    setCustomer(c)
    // Auto-fill "Apply VAT" from the account's VAT setting — still
    // overridable by the cashier via the checkbox.
    setApplyVat(!c.zeroRated)
  }, [])

  function switchBuyerMode(mode: 'walkin' | 'account') {
    setBuyerMode(mode)
    setCustomer(null)
    setBuyerName('')
    setBuyerIdNumber('')
    setBuyerPhone('')
    setApplyVat(false)
  }

  // ── Pending sale actions ──────────────────────────────────────────────────
  async function handleVoidSale(id: string) {
    if (voidReason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setActionLoading(true)
    try {
      const res = await fetch(`/api/sales/${id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason }),
      })
      if (!res.ok) { const e = await res.json() as { error?: string }; toast.error(e.error ?? 'Failed'); return }
      toast.success('Sale reversed')
      setVoidId(null); setVoidReason('')
      mutatePending()
    } catch { toast.error('Network error') }
    finally { setActionLoading(false) }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  // `loanOverride` lets a caller (the PIN-unlock success handler) pass the
  // just-verified amount straight through instead of relying on state that
  // hasn't re-rendered yet — setState + an immediate call in the same tick
  // would otherwise submit against the stale (pre-unlock) closure.
  async function submitSale(isPending: boolean, loanOverride?: { summary: BusinessLoanFullSummary; amount: string }) {
    if (buyerMode === 'account' && !customer) { toast.error('Select a buyer'); return }
    if (buyerMode === 'walkin' && !buyerName.trim()) { toast.error('Buyer name is required'); return }
    if (isBlacklisted) { toast.error('Buyer is blacklisted'); return }
    if (hasStockError && !isPending) { toast.error('Some lines exceed available stock'); return }

    const effectiveLoanSummary = loanOverride?.summary ?? businessLoanSummary
    const effectiveLoanAmount  = loanOverride?.amount   ?? businessLoanAmount

    // Mandatory — a sale to this customer can't complete via plain cash/eft
    // while an outstanding business loan hasn't been unlocked and applied.
    if (!isPending && hasOutstandingBusinessLoan && !effectiveLoanSummary) {
      toast.error('Enter the admin PIN to apply the business loan before completing this sale')
      return
    }

    const validLines = lines.filter((l) => l.productId && l.quantity && l.unitPrice)
    if (validLines.length === 0) { toast.error('Add at least one product line'); return }
    for (const l of validLines) {
      if (parseFloat(l.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
      if (parseFloat(l.unitPrice) < 0)  { toast.error('Sell price cannot be negative'); return }
    }

    const effectiveName = buyerMode === 'account' && customer
      ? `${customer.firstName} ${customer.lastName}`
      : buyerName.trim()

    const effectiveId   = buyerMode === 'walkin' ? buyerIdNumber.trim() : (customer?.idNumber ?? '')
    const effectivePhone = buyerMode === 'walkin' ? buyerPhone.trim()   : (customer?.phone   ?? '')

    const businessLoanDeduction = effectiveLoanSummary && effectiveLoanAmount && parseFloat(effectiveLoanAmount) > 0 && !isPending
      ? effectiveLoanAmount : undefined
    // Deduction is capped server-side — no client-side block needed

    const body = {
      ...(buyerMode === 'account' && customer ? { customerId: customer.id } : {}),
      buyerName:     effectiveName,
      buyerIdNumber: effectiveId   || undefined,
      buyerPhone:    effectivePhone || undefined,
      paymentMethod: isPending ? 'cash' : (paymentType as 'cash' | 'eft'),
      status:        isPending ? 'pending' : 'completed',
      notes:         notes || (invoiceNo ? `INV:${invoiceNo}` : undefined),
      applyVat,
      ...(businessLoanDeduction ? { businessLoanDeductionAmount: businessLoanDeduction } : {}),
      lines: validLines.map((l) => ({
        productId:       l.productId,
        quantity:        l.quantity,
        unitPrice:       l.unitPrice,
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
      const { queued, data } = await offlineMutate({ method: 'POST', url: '/api/sales', body, localId })
      if (queued) {
        const offlineRefNumber = `OFF-${Date.now()}`
        await offlineDB.sales.add({
          id: localId, refNumber: offlineRefNumber, buyerName: effectiveName,
          status: isPending ? 'pending' : 'completed', totalAmount: total.toFixed(2),
          paymentMethod: isPending ? 'cash' : paymentType,
          notes: body.notes, createdAt: new Date().toISOString(), _offlineCreated: true,
        })
        for (const l of validLines) {
          await offlineDB.saleLines.add({
            id: `local_${crypto.randomUUID()}`, saleId: localId,
            productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice,
            lineTotal: new Decimal(l.quantity || '0').times(l.unitPrice || '0').toFixed(2),
          })
        }

        if (isPending) {
          toast.success('Sale saved offline as unpaid — will sync when connected')
        } else {
          toast.success('Sale saved offline — will sync when connected')
          // Fire-and-forget: the record is already saved, so navigation must
          // not wait on hardware I/O (see the online branch below for the
          // identical reasoning).
          if (canAutoPrint()) {
            const receiptLines = validLines.map((l) => ({
              productName: products.find((p) => p.id === l.productId)?.name ?? l.productId,
              qty: parseFloat(l.quantity),
              unitPrice: l.unitPrice,
              lineTotal: new Decimal(l.quantity || '0').times(l.unitPrice || '0').toFixed(2),
            }))
            autoPrintReceipt({
              type: 'sale',
              data: {
                refNumber: offlineRefNumber,
                status: 'completed',
                buyerName: effectiveName,
                buyerIdNumber: effectiveId || undefined,
                lines: receiptLines,
                totalAmount: total.toFixed(2),
                paymentMethod: isPending ? 'cash' : paymentType,
                cashierName: '',
                createdAt: new Date().toISOString(),
              },
            }).catch(() => {
              toast.error('Offline print failed — receipt will be available once synced')
            })
          }
        }
        router.push('/app/sales')
      } else {
        const sale = data as { id: string; refNumber: string }

        // Upload product photo (non-blocking)
        if (photoFile) {
          try {
            const fd = new FormData()
            fd.append('context', 'sale_photo')
            fd.append('referenceId', sale.id)
            fd.append('file', photoFile)
            const upRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
            if (upRes.ok) {
              const { key } = await upRes.json() as { key: string }
              await fetch(`/api/sales/${sale.id}/photos`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ add: key }),
              })
            }
          } catch { /* non-blocking */ }
        }

        if (isPending) {
          toast.success(`Sale ${sale.refNumber} saved as unpaid`)
          router.push('/app/sales/unpaid')
        } else if (canAutoPrint()) {
          // The sale is already safely recorded at this point — printing is
          // a secondary, hardware-dependent step and must never gate "is the
          // till free for the next customer" on it. Report success and move
          // on immediately; a failed auto-print is reported on its own and
          // can always be retried afterward from Sales → "Reprint to Printer".
          toast.success(`Sale ${sale.refNumber} recorded`)
          autoPrintReceipt({ type: 'sale', id: sale.id })
            .then(() => toast.success(`Receipt printed: ${sale.refNumber}`))
            .catch(() => toast.error(`Receipt didn't print for ${sale.refNumber} — reprint from Sales → Reprint to Printer`))
          router.push('/app/dashboard')
        } else {
          setPrintDialog({ id: sale.id, refNumber: sale.refNumber })
        }
      }
    } catch {
      toast.error('Failed to create sale')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Submit (edit mode) ────────────────────────────────────────────────────
  // Always a plain online PATCH — no offline queueing (edit is an occasional
  // manager correction, not a routine till operation), no business-loan
  // deduction (updateSale never applies one — a pending sale never has), and
  // no client-side stock pre-check (the live on-hand figure doesn't yet
  // account for this sale's own quantities being freed up, which only
  // happens inside updateSale's own transaction — the server's
  // InsufficientStockError is the authoritative check here).
  async function submitEdit() {
    if (!editingSale) return

    if (buyerMode === 'account' && !customer) { toast.error('Select a buyer'); return }
    if (buyerMode === 'walkin' && !buyerName.trim()) { toast.error('Buyer name is required'); return }
    if (isBlacklisted) { toast.error('Buyer is blacklisted'); return }

    const validLines = lines.filter((l) => l.productId && l.quantity && l.unitPrice)
    if (validLines.length === 0) { toast.error('Add at least one product line'); return }
    for (const l of validLines) {
      if (parseFloat(l.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
      if (parseFloat(l.unitPrice) < 0)  { toast.error('Sell price cannot be negative'); return }
    }

    const effectiveName = buyerMode === 'account' && customer
      ? `${customer.firstName} ${customer.lastName}`
      : buyerName.trim()
    const effectiveId    = buyerMode === 'walkin' ? buyerIdNumber.trim() : (customer?.idNumber ?? '')
    const effectivePhone = buyerMode === 'walkin' ? buyerPhone.trim()   : (customer?.phone   ?? '')

    const body = {
      ...(buyerMode === 'account' && customer ? { customerId: customer.id } : {}),
      buyerName:     effectiveName,
      buyerIdNumber: effectiveId    || undefined,
      buyerPhone:    effectivePhone || undefined,
      paymentMethod: paymentType === 'unpaid' ? 'cash' : (paymentType as 'cash' | 'eft'),
      notes:         notes || (invoiceNo ? `INV:${invoiceNo}` : undefined),
      applyVat,
      lines: validLines.map((l) => ({
        productId:       l.productId,
        quantity:        l.quantity,
        unitPrice:       l.unitPrice,
        ...(l.grossQty        ? { grossQty:        l.grossQty        } : {}),
        ...(l.tareQty         ? { tareQty:          l.tareQty         } : {}),
        ...(l.tareReason      ? { tareReason:       l.tareReason      } : {}),
        ...(parseFloat(l.deductionQty || '0') > 0 ? { deductionQty: l.deductionQty } : {}),
        ...(l.deductionReason ? { deductionReason:  l.deductionReason } : {}),
      })),
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/sales/${editingSale.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const e = await res.json() as { error?: string }
        toast.error(typeof e.error === 'string' ? e.error : 'Failed to save changes')
        return
      }
      const sale = await res.json() as { id: string; refNumber: string }
      toast.success(`Sale ${sale.refNumber} updated`)
      router.push(`/app/sales/${sale.id}`)
    } catch {
      toast.error('Failed to save changes')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const cellInput      = 'w-full px-1.5 py-0.5 text-[11px] font-mono border rounded-[2px] bg-white focus:outline-none focus:border-[#185ABD]'
  const cellInputStyle = { color: '#212529', ...winBevel(true) }
  const headerBg       = { background: HEADER_GRAD, borderBottom: '2px solid #B0B0B0' }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {editingSale && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: colors.warningBg, borderBottom: `1px solid ${colors.warning}`, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: colors.warning, textTransform: 'uppercase' }}>Editing</span>
          <span style={{ fontSize: 12, color: colors.textPrimary }}>
            {editingSale.refNumber} — saving replaces its products and totals; the reference number stays the same.
          </span>
        </div>
      )}

      {/* Outer bordered container */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* Title bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderBottom: '2px solid #B0B0B0', background: BAR_GRAD, flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1B3A6B', marginRight: 2 }}>Buyer Name</span>

            {/* Walk-in / Account toggle */}
            <button
              onClick={() => switchBuyerMode('walkin')}
              style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 2, cursor: 'pointer',
                border: '1px solid #888',
                background: buyerMode === 'walkin'  ? '#1B3A6B' : '#E8E8E8',
                color:      buyerMode === 'walkin'  ? '#FFF'    : '#333',
              }}
            >
              Walk-in
            </button>
            <button
              onClick={() => switchBuyerMode('account')}
              style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 2, cursor: 'pointer',
                border: '1px solid #888',
                background: buyerMode === 'account' ? '#1B3A6B' : '#E8E8E8',
                color:      buyerMode === 'account' ? '#FFF'    : '#333',
              }}
            >
              Account
            </button>

            <div style={{ flex: 1 }} />
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Invoice No</label>
            <input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              style={{ width: 72, fontSize: 11, padding: '2px 6px', borderRadius: 2, outline: 'none', ...winBevel(true) }}
            />
          </div>

          {/* ── Two-column body ───────────────────────────────────────────── */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          {/* Buyer sub-panel (left 310px) */}
          <div style={{ width: 310, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #C0C0C0', overflowY: 'auto' }}>

          {/* Buyer selector area */}
          <div style={{ flexShrink: 0, padding: '5px 10px', borderBottom: '1px solid #E0E0E0' }}>

            {/* Walk-in fields */}
            {buyerMode === 'walkin' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: '#6C757D', marginBottom: 2 }}>
                    Buyer Name <span style={{ color: '#EF4444' }}>*</span>
                  </p>
                  <input
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Name or company…"
                    style={{ height: 26, width: '100%', fontSize: 12, padding: '0 8px', borderRadius: 2, outline: 'none', color: '#212529', ...winBevel(true) }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: '#6C757D', marginBottom: 2 }}>ID Number</p>
                    <input
                      value={buyerIdNumber}
                      onChange={(e) => setBuyerIdNumber(e.target.value)}
                      placeholder="13 digits"
                      maxLength={13}
                      style={{ height: 26, width: '100%', fontSize: 11, fontFamily: 'monospace', padding: '0 8px', borderRadius: 2, outline: 'none', color: '#212529', ...winBevel(true) }}
                    />
                  </div>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: '#6C757D', marginBottom: 2 }}>Phone</p>
                    <input
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="e.g. 0821234567"
                      style={{ height: 26, width: '100%', fontSize: 11, padding: '0 8px', borderRadius: 2, outline: 'none', color: '#212529', ...winBevel(true) }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Account selector */}
            {buyerMode === 'account' && !customer && (
              <AccountSelectorPanel onSelect={handleCustomerSelect} />
            )}

            {/* Selected customer */}
            {buyerMode === 'account' && customer && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '3px 14px', alignItems: 'center', marginBottom: 4 }}>
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
                    <button onClick={() => { setCustomer(null); setApplyVat(false) }}
                      style={{ fontSize: 10, padding: '1px 8px', borderRadius: 2, color: '#6C757D', background: 'none', cursor: 'pointer', marginLeft: 'auto', ...winBevel() }}>
                      Change
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Comments */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px', borderBottom: '1px solid #E0E0E0' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Comments:</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any remarks…"
              style={{ flex: 1, fontSize: 12, padding: '2px 8px', borderRadius: 2, color: '#212529', outline: 'none', ...winBevel(true) }}
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
                  onChange={() => setPaymentType(type)}
                  style={{ width: 13, height: 13 }}
                />
                {type === 'unpaid' ? 'Unpaid' : type === 'eft' ? 'EFT' : type.charAt(0).toUpperCase() + type.slice(1)}
              </label>
            ))}
          </div>

          {/* Business loan notice — informational only, not a click target.
              The actual PIN prompt happens when Save Sale is clicked, not
              here, so there's nothing on this line the operator needs to
              interact with. */}
          {hasOutstandingBusinessLoan && (
            <div style={{ flexShrink: 0, margin: '0 10px 4px', padding: '4px 8px', borderRadius: 2, background: '#FFF8F0', border: '1px solid #FFCC80', fontSize: 10.5, color: '#92400E' }}>
              {!businessLoanSummary ? (
                <>This customer has a pending business loan — Save Sale will ask for an admin PIN to apply it.</>
              ) : (
                <>
                  Applying {currSym} {businessLoanAmount} to the business loan — remaining{' '}
                  <span style={{ fontFamily: 'monospace' }}>
                    {currSym} {Decimal.max(total.minus(new Decimal(businessLoanAmount || '0')), new Decimal(0)).toFixed(2)}
                  </span>
                  {' '}due via cash/EFT.
                </>
              )}
            </div>
          )}

          </div>
          {/* end Buyer sub-panel */}

          {/* Product sub-panel (right) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── Product Grid ──────────────────────────────────────────────── */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderBottom: '1px solid #C0C0C0' }}>

            {/* Grid header */}
            <div
              style={{
                ...headerBg,
                display: 'grid',
                gridTemplateColumns: '1fr 70px 78px 86px 78px 92px 64px 28px 26px',
                gap: 4,
                padding: '4px 8px',
                flexShrink: 0,
              }}
            >
              {['Product', 'Qty (kg)', 'Sell Price', 'Sub Total', 'VAT', 'Total', 'Stock', '', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#374151' }}>{h}</span>
              ))}
            </div>

            {/* Scrollable lines */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {lines.map((line) => {
                const qty      = new Decimal(line.quantity  || '0')
                const price    = new Decimal(line.unitPrice || '0')
                const lineSub  = qty.times(price)
                const lineVat  = lineSub.times(vatRate)
                const lineTot  = lineSub.plus(lineVat)
                const onHand   = line.productId ? (stockMap.get(line.productId) ?? new Decimal(0)) : null
                const overStock = onHand !== null && qty.gt(new Decimal(0)) && qty.gt(onHand)

                return (
                  <div key={line.key} style={{ borderTop: '1px solid #E0E0E0', background: overStock ? '#FFF5F5' : undefined }}>
                    {/* Main row */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 70px 78px 86px 78px 92px 64px 28px 26px',
                        gap: 4,
                        padding: '4px 8px',
                        alignItems: 'center',
                        minHeight: 32,
                      }}
                    >
                      {/* Product */}
                      <ProductCategoryPicker
                        products={products}
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

                      {/* Sell Price */}
                      <input
                        type="number" step="0.01" min="0" placeholder="0.00"
                        value={line.unitPrice}
                        onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })}
                        className={cellInput} style={cellInputStyle}
                      />

                      {/* Sub Total */}
                      <span
                        title={qty.gt(0) ? `${currSym} ${lineSub.toFixed(2)}` : undefined}
                        style={{ fontSize: 11, fontFamily: 'monospace', padding: '0 4px', color: qty.gt(0) ? '#212529' : '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                      >
                        {qty.gt(0) ? `${currSym} ${lineSub.toFixed(2)}` : '—'}
                      </span>

                      {/* VAT */}
                      <span
                        title={qty.gt(0) ? `${currSym} ${lineVat.toFixed(2)}` : undefined}
                        style={{ fontSize: 11, fontFamily: 'monospace', padding: '0 4px', color: qty.gt(0) ? '#212529' : '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                      >
                        {qty.gt(0) ? `${currSym} ${lineVat.toFixed(2)}` : '—'}
                      </span>

                      {/* Total */}
                      <span
                        title={qty.gt(0) ? `${currSym} ${lineTot.toFixed(2)}` : undefined}
                        style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, padding: '0 4px', color: qty.gt(0) ? colors.action : '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                      >
                        {qty.gt(0) ? `${currSym} ${lineTot.toFixed(2)}` : '—'}
                      </span>

                      {/* Stock */}
                      <span
                        title={onHand !== null ? onHand.toFixed(2) : undefined}
                        style={{ fontSize: 10, fontFamily: 'monospace', padding: '0 4px', color: overStock ? '#EF4444' : '#6C757D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                      >
                        {onHand !== null ? `${onHand.toFixed(2)}` : '—'}
                      </span>

                      {/* Scale toggle */}
                      <button
                        type="button"
                        title="Toggle weighing"
                        onClick={() => patchLine(line.key, { weighMode: !line.weighMode })}
                        style={{
                          height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, cursor: 'pointer',
                          ...(line.weighMode
                            ? { background: '#185ABD', color: '#fff', ...winBevel(true) }
                            : { color: '#6C757D', background: 'transparent', ...winBevel() }),
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
                      <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', background: '#EFF6FF', borderTop: '1px solid #BFDBFE' }}>
                        {/* Scale selector */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 500, color: colors.textSecondary }}>Scale</span>
                          <Select
                            value={line.selectedScale}
                            onValueChange={(v) => patchLine(line.key, { selectedScale: v as '1' | '2' | '3' })}
                          >
                            <SelectTrigger className="h-6 w-24 text-[11px]" style={winBevel(true)}>
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
                              style={{ height: 24, width: 76, borderRadius: 2, padding: '0 6px', fontSize: 11, fontFamily: 'monospace', outline: 'none', ...winBevel(true) }}
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
                              style={{ height: 24, width: 76, borderRadius: 2, padding: '0 6px', fontSize: 11, fontFamily: 'monospace', outline: 'none', ...winBevel(true) }}
                            />
                            <button
                              type="button"
                              disabled={line.weighingTare}
                              onClick={() => handleWeighTare(line)}
                              style={{ height: 24, padding: '0 6px', borderRadius: 2, background: '#fff', color: '#6C757D', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: line.weighingTare ? 0.6 : 1, ...winBevel() }}
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
                            style={{ height: 24, width: 76, borderRadius: 2, padding: '0 6px', fontSize: 11, fontFamily: 'monospace', outline: 'none', ...winBevel(true) }}
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
                              style={{ height: 24, width: 100, borderRadius: 2, padding: '0 6px', fontSize: 11, outline: 'none', ...winBevel(true) }}
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
                              style={{ height: 24, width: 120, borderRadius: 2, padding: '0 6px', fontSize: 11, outline: 'none', ...winBevel(true) }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Add Line */}
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

          {/* ── Pending Sales ──────────────────────────────────────────────── */}
          <div style={{ flexShrink: 0, borderTop: '2px solid #B0B0B0', display: 'flex', flexDirection: 'column', height: 85 }}>

            {/* Header */}
            <div style={{ ...headerBg, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Pending Sales</span>
              {pendingSales.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#F59E0B', color: '#fff', borderRadius: 10, padding: '0 5px', minWidth: 18, textAlign: 'center' }}>
                  {pendingSales.length}
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
                onClick={() => router.push('/app/sales/unpaid')}
                style={{ fontSize: 10, padding: '1px 6px', background: '#E0E0E0', border: '1px solid #999', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
              >
                <Wallet style={{ width: 9, height: 9 }} /> Unpaid Sales
              </button>
              <button
                onClick={() => router.push('/app/sales')}
                style={{ fontSize: 10, padding: '1px 6px', background: '#E0E0E0', border: '1px solid #999', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
              >
                <ClipboardList style={{ width: 9, height: 9 }} /> Edit Transaction
              </button>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 48px 92px 92px 60px 28px', gap: 4, padding: '2px 8px', background: '#F8F9FA', borderBottom: '1px solid #D0D0D0', flexShrink: 0 }}>
              {['Ref #', 'Buyer', 'Lines', 'Total', 'Balance', 'Time', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6C757D' }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {pendingSales.length === 0 ? (
                <div style={{ padding: '8px 8px', textAlign: 'center', fontSize: 11, color: '#9CA3AF' }}>
                  No pending sales
                </div>
              ) : pendingSales.map((s) => {
                const bal = new Decimal(s.totalAmount).minus(new Decimal(s.amountPaid ?? '0'))
                return (
                  <div key={s.id} style={{ borderTop: '1px solid #E8E8E8' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 48px 80px 80px 60px 28px', gap: 4, padding: '4px 8px', alignItems: 'center', background: voidId === s.id ? '#FFFBEB' : 'transparent' }}>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#1B3A6B', fontWeight: 600 }}>{s.refNumber}</span>
                      <span style={{ fontSize: 11, color: '#212529', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.buyerName}</span>
                      <span style={{ fontSize: 10, color: '#6C757D', textAlign: 'center' }}>{s.lines.length}</span>
                      <span title={`${currSym} ${new Decimal(s.totalAmount).toFixed(2)}`} style={{ fontSize: 10, fontFamily: 'monospace', color: colors.action, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{currSym} {new Decimal(s.totalAmount).toFixed(2)}</span>
                      <span title={`${currSym} ${bal.toFixed(2)}`} style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color: colors.action, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{currSym} {bal.toFixed(2)}</span>
                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>{timeAgo(s.createdAt)}</span>

                      {/* ⋮ action menu */}
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={(e) => {
                            const next = actionMenuId === s.id ? null : s.id
                            setActionMenuId(next)
                            setActionMenuRect(next ? (e.currentTarget as HTMLButtonElement).getBoundingClientRect() : null)
                          }}
                          style={{ height: 22, width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #C0C0C0', borderRadius: 2, background: actionMenuId === s.id ? '#E8E8E8' : 'transparent', cursor: 'pointer', fontSize: 14, color: '#374151', lineHeight: 1 }}
                        >
                          ⋮
                        </button>

                        {actionMenuId === s.id && actionMenuRect && (
                          <div style={{ position: 'fixed', right: window.innerWidth - actionMenuRect.right, bottom: window.innerHeight - actionMenuRect.top + 2, zIndex: 9999, background: '#fff', border: '1px solid #C0C0C0', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 180 }}>
                            {([
                              { label: 'Process Payment',    action: () => { setPayTarget({ id: s.id, ref: s.refNumber, totalAmount: s.totalAmount, amountPaid: s.amountPaid ?? '0', customerId: s.customerId ?? null }); setActionMenuId(null) } },
                              { label: 'Print Slip',         action: () => { router.push(`/app/sales/${s.id}`); setActionMenuId(null) } },
                              { label: 'View Full Details',  action: () => { router.push(`/app/sales/${s.id}`); setActionMenuId(null) } },
                              { label: 'Void Sale',          destructive: true, action: () => { setVoidId(s.id); setActionMenuId(null) } },
                            ] as { label: string; action: () => void; destructive?: boolean }[]).map((item, idx) => (
                              <button
                                key={idx}
                                onClick={item.action}
                                style={{ display: 'block', width: '100%', padding: '6px 12px', textAlign: 'left', fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: item.destructive ? '#EF4444' : '#212529' }}
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

                    {/* Void Sale inline form */}
                    {voidId === s.id && (
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
                            onClick={() => handleVoidSale(s.id)}
                            style={{ height: 24, padding: '0 10px', fontSize: 11, fontWeight: 600, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 2, cursor: 'pointer', opacity: actionLoading || voidReason.trim().length < 5 ? 0.5 : 1 }}
                          >
                            {actionLoading ? '…' : 'Void'}
                          </button>
                          <button
                            onClick={() => { setVoidId(null); setVoidReason('') }}
                            style={{ height: 24, padding: '0 8px', fontSize: 11, background: 'none', borderRadius: 2, cursor: 'pointer', color: '#6C757D', ...winBevel() }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Totals */}
          <div style={{ flexShrink: 0, padding: '4px 10px', borderTop: '2px solid #B0B0B0', background: '#F8F9FA', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#6C757D' }}>Sub Total</span>
                <span style={{ fontFamily: 'monospace', color: '#212529' }}>{currSym} {subTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6C757D', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={applyVat}
                    onChange={(e) => setApplyVat(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Apply VAT (15%)
                </label>
                <span style={{ fontFamily: 'monospace', color: '#6C757D' }}>{currSym} {vatAmount.toFixed(2)}</span>
              </div>
              <div style={{ height: 1, background: '#C0C0C0', margin: '2px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: '#212529' }}>Total</span>
                <span style={{ fontFamily: 'monospace', color: colors.action }}>{currSym} {total.toFixed(2)}</span>
              </div>
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
        <Btn
          variant="primary"
          onClick={() => {
            if (editingSale) { submitEdit(); return }
            if (paymentType === 'unpaid') { submitSale(true); return }
            // A business loan that hasn't been unlocked this session gates
            // here, at the point of actually saving, rather than requiring
            // a separate click somewhere else first. Once unlocked, always
            // show the breakdown confirm step before actually submitting —
            // never jump straight to "sale completed" without the operator
            // seeing how much went to the loan vs cash/eft.
            if (hasOutstandingBusinessLoan && !businessLoanSummary) setBusinessLoanPinOpen(true)
            else if (hasOutstandingBusinessLoan && businessLoanSummary) setSettlementConfirmOpen(true)
            else submitSale(false)
          }}
          disabled={submitting || isBlacklisted || (!editingSale && paymentType !== 'unpaid' && hasStockError)}
          loading={submitting}
          style={{ padding: '0 24px' }}
        >
          {submitting
            ? 'Saving…'
            : editingSale ? 'Save Changes' : paymentType === 'unpaid' ? 'Save Sale' : `Save Sale · ${currSym} ${total.toFixed(2)}`}
        </Btn>
      </div>

      {/* Overlay to close action menu */}
      {actionMenuId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setActionMenuId(null)} />
      )}

      {/* Record Payment modal */}
      {payTarget && (
        <RecordPaymentModal
          sale={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={() => { mutatePending(); setPayTarget(null) }}
        />
      )}

      {/* Print result dialog */}
      {printDialog && (
        <PrintResultModal
          type="sale"
          id={printDialog.id}
          refNumber={printDialog.refNumber}
          onClose={() => router.push(`/app/sales/new?t=${Date.now()}`)}
          onViewPurchase={() => router.push(`/app/sales/${printDialog.id}`)}
          onDone={() => router.push('/app/dashboard')}
        />
      )}

      {/* Admin PIN — triggered by clicking Save Sale, not a separate step.
          Reveals the business loan balance, then hands off to the
          settlement confirm modal below rather than submitting straight
          away — the operator needs to see the loan/cash breakdown first. */}
      {businessLoanPinOpen && customer && (
        <AdminPinUnlockModal
          customerId={customer.id}
          onClose={() => setBusinessLoanPinOpen(false)}
          onUnlocked={(summary: BusinessLoanFullSummary) => {
            const amount = Decimal.min(new Decimal(summary.outstanding), total).toFixed(2)
            setBusinessLoanSummary(summary)
            setBusinessLoanAmount(amount)
            setBusinessLoanPinOpen(false)
            setSettlementConfirmOpen(true)
          }}
        />
      )}

      {/* Settlement confirm — shows the loan/cash breakdown and requires an
          explicit confirm click before the sale is actually submitted. */}
      {settlementConfirmOpen && businessLoanSummary && (
        <SaleSettlementModal
          total={total}
          businessLoanAmount={businessLoanAmount}
          onChangeAmount={setBusinessLoanAmount}
          outstanding={businessLoanSummary.outstanding}
          paymentType={paymentType === 'unpaid' ? 'cash' : paymentType}
          submitting={submitting}
          onCancel={() => setSettlementConfirmOpen(false)}
          onConfirm={() => {
            setSettlementConfirmOpen(false)
            submitSale(false, { summary: businessLoanSummary, amount: businessLoanAmount })
          }}
        />
      )}

    </div>
  )
}

// ─── Sale Settlement Confirm Modal ─────────────────────────────────────────────
// Shown after the admin PIN reveals the business loan balance — the operator
// must see exactly how the sale splits between the mandatory loan deduction
// and cash/eft before it's actually submitted, never an instant auto-submit.
function SaleSettlementModal({
  total,
  businessLoanAmount,
  onChangeAmount,
  outstanding,
  paymentType,
  submitting,
  onCancel,
  onConfirm,
}: {
  total: Decimal
  businessLoanAmount: string
  onChangeAmount: (amount: string) => void
  outstanding: string
  paymentType: 'cash' | 'eft'
  submitting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { symbol: currSym } = useSystemCurrency()
  const cap        = Decimal.min(new Decimal(outstanding), total)
  const loanAmt    = new Decimal(businessLoanAmount || '0')
  const remaining  = Decimal.max(total.minus(loanAmt), new Decimal(0))

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <RpxDialogContent maxWidth={420}>
        <RpxDialogHeader title="Confirm Sale Payment" icon={Split} onClose={onCancel} />
        <RpxDialogBody>
          <div className="space-y-4">
            <div className="px-3 py-2.5 space-y-1" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0', borderRadius: 2 }}>
              <div className="flex justify-between" style={{ fontSize: 12, color: '#6C757D' }}>
                <span>Sale total</span>
                <span className="font-mono">{currSym} {total.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 px-3 py-2" style={{ background: '#FFF3E0', border: '1px solid #FFCC80', borderRadius: 2 }}>
              <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#E65100' }} />
              <div className="w-full space-y-1.5">
                <div className="flex items-center justify-between" style={{ fontSize: 12, fontWeight: 600, color: '#E65100' }}>
                  <span>Applied to business loan</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono">{currSym}</span>
                    <input
                      type="number"
                      min={0}
                      max={cap.toNumber()}
                      step="0.01"
                      value={businessLoanAmount}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '') { onChangeAmount(''); return }
                        // Decimal() throws on an in-progress value like "12."
                        // — let those through as typed and only clamp once
                        // it parses to a real number.
                        if (!/^\d*\.?\d*$/.test(raw)) return
                        if (!/\d/.test(raw)) { onChangeAmount(raw); return }
                        const parsed  = new Decimal(raw)
                        const clamped = Decimal.min(Decimal.max(parsed, new Decimal(0)), cap)
                        onChangeAmount(clamped.equals(parsed) ? raw : clamped.toString())
                      }}
                      style={{ width: 90, fontFamily: 'monospace', fontSize: 12, textAlign: 'right', padding: '2px 4px', border: '1px solid #FFCC80', borderRadius: 2, background: '#fff' }}
                    />
                  </div>
                </div>
                <p className="text-xs" style={{ color: '#EF6C00' }}>
                  Outstanding balance: {currSym} {new Decimal(outstanding).toFixed(2)} — enter how much of this sale to put
                  toward the loan (up to {currSym} {cap.toFixed(2)}), or 0 to skip a deduction this time.
                </p>
              </div>
            </div>

            <div className="flex justify-between pt-1 border-t" style={{ fontSize: 13, borderColor: '#E0E0E0' }}>
              <span className="font-semibold" style={{ color: colors.action }}>Due via {paymentType.toUpperCase()}</span>
              <span className="font-mono font-bold" style={{ color: colors.action }}>{currSym} {remaining.toFixed(2)}</span>
            </div>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onCancel} disabled={submitting}>Cancel</Btn>
          <Btn variant="primary" loading={submitting} onClick={onConfirm}>
            Confirm &amp; Complete Sale
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
