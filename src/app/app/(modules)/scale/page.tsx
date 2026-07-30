'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  Search, X, Download, RefreshCw,
  FileText, Images, CheckCircle2, XCircle,
  UserPlus, Eye, EyeOff, Loader2,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { InlineDetailPanel } from '@/components/ui/InlineDetailPanel'
import { PhotoViewerModal } from '@/components/ui/PhotoViewerModal'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Btn, BtnMenu, Field, FilterBar, PortalPage, inp, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { Dialog } from '@/components/ui/dialog'

// ─── Types ────────────────────────────────────────────────────────────────────

type ScaleOrderLine = {
  weight:  string | null
  product: { name: string; unit: string; category: string }
  photoUrls?: string[]
}

type ScaleOrder = {
  id:          string
  orderNumber: string
  status:      'pending' | 'processed' | 'voided'
  /** Legacy header field — first line only. Use lines[] for the full order. */
  weight:      string | null
  createdAt:   string
  photoR2Keys: string[]
  notes?:      string
  customer:    { id: string; firstName: string; lastName: string; phone: string; customerType?: string } | null
  product:     { id: string; name: string; unit?: string; category: string }
  operator:    { id: string; fullName: string }
  lines?:      ScaleOrderLine[]
}

/** All product lines of an order; legacy orders without line rows fall back to the header product. */
function orderLines(o: ScaleOrder & { photoUrls?: string[] }): ScaleOrderLine[] {
  if (o.lines && o.lines.length > 0) return o.lines
  return [{
    weight: o.weight,
    product: { name: o.product.name, unit: o.product.unit ?? 'kg', category: o.product.category },
    photoUrls: o.photoUrls,
  }]
}

function orderTotalWeight(o: ScaleOrder): number {
  return orderLines(o).reduce((sum, l) => sum + (l.weight ? Number(l.weight) : 0), 0)
}

function orderProductNames(o: ScaleOrder): string {
  return orderLines(o).map(l => l.product.name).join(', ')
}

// ─── Export (CSV / PDF) ─────────────────────────────────────────────────────

const EXPORT_HEADERS = ['Order #', 'Date', 'Customer', 'Type', 'Product', 'Category', 'Weight (kg)', 'Order Total (kg)', 'Status', 'Operator']

// pdf-lib's standard fonts use WinAnsi encoding — replace anything outside
// its printable range rather than let drawText() throw on an odd character
// in a customer/product name.
// eslint-disable-next-line no-control-regex
function sanitizePdfText(text: string): string {
  return text.replace(/[^\x20-\xFF–—''""•…]/g, '?')
}

function truncatePdfText(text: string, maxWidthPt: number, font: PDFFont, size: number): string {
  const clean = sanitizePdfText(text)
  if (font.widthOfTextAtSize(clean, size) <= maxWidthPt) return clean
  let result = clean
  while (result.length > 1 && font.widthOfTextAtSize(result + '…', size) > maxWidthPt) {
    result = result.slice(0, -1)
  }
  return result + '…'
}

type StatsData = {
  todayTotal:     number
  todayPending:   number
  todayProcessed: number
  todayWeightKg:  string
}

type OrderDetail = ScaleOrder & {
  photoUrls: string[]
  slipUrl:   string | null
  voidedBy?: { id: string; fullName: string } | null
  voidReason?: string | null
  voidedAt?:   string | null
}

type Operator = {
  id:          string
  fullName:    string
  username:    string
  isActive:    boolean
  lastLoginAt: string | null
  createdAt:   string
}

type StepConfig = {
  categoryId:    string
  categoryName:  string
  parentId:      string | null
  requireWeight: boolean
  requirePhotos: boolean
  isInherited:   boolean
  updatedAt:     string | null
}

const TABS = [
  { value: 'orders',    label: 'Orders' },
  { value: 'operators', label: 'Operators' },
  { value: 'config',    label: 'Step Config' },
] as const

const fetcher = (url: string) => fetch(url).then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json() })

function useDebounce<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────

function StatsStrip() {
  const [stats, setStats] = useState<StatsData | null>(null)

  useEffect(() => {
    fetcher('/api/scale/admin/stats').then(setStats).catch(() => {})
  }, [])

  const cards = [
    { label: 'Orders Today', value: stats?.todayTotal    ?? '—', color: colors.process },
    { label: 'Pending',      value: stats?.todayPending  ?? '—', color: colors.warning },
    { label: 'Processed',    value: stats?.todayProcessed ?? '—', color: colors.action },
    { label: 'Weight Today', value: stats ? `${stats.todayWeightKg} kg` : '—', color: colors.primary },
  ]

  return (
    <div className="flex flex-wrap items-stretch bg-white border shrink-0" style={{ borderColor: colors.border, borderRadius: 2 }}>
      {cards.map((c, i) => (
        <div
          key={c.label}
          className="flex items-center gap-2 px-4"
          style={{ height: 32, borderRight: i < cards.length - 1 ? `1px solid ${colors.border}` : undefined }}
        >
          <span style={{ fontSize: 10, color: colors.textSecondary, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {c.label}
          </span>
          <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: c.color }}>
            {c.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Void Modal ───────────────────────────────────────────────────────────────

function VoidModal({
  order,
  onClose,
  onVoided,
}: {
  order: ScaleOrder | null
  onClose: () => void
  onVoided: (id: string) => void
}) {
  const [reason,    setReason]    = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => { if (!order) { setReason(''); setError(null) } }, [order])

  if (!order) return null

  async function handleVoid() {
    if (!reason.trim()) { setError('Void reason is required'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/scale/orders/${order!.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voidReason: reason.trim() }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed to void') }
      onVoided(order!.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to void order')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Void Order" icon={XCircle} onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: fontSize.sm, color: colors.textPrimary, marginBottom: 10 }}>
            Void <strong>{order.orderNumber}</strong>? This cannot be undone.
          </p>
          <label style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>
            Reason *
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            className="w-full border border-[#E0E0E0] px-3 py-2 focus:outline-none focus:border-[#185ABD] resize-none"
            style={{ fontSize: fontSize.sm, borderRadius: 2 }}
            placeholder="Enter reason for voiding…"
          />
          {error && <p style={{ fontSize: fontSize.xs, color: colors.danger, marginTop: 6 }}>{error}</p>}
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" onClick={handleVoid} loading={loading}>Void Order</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Create Operator Panel ────────────────────────────────────────────────────

function CreateOperatorPanel({
  open,
  onClose,
  onCreated,
}: {
  open:      boolean
  onClose:   () => void
  onCreated: () => void
}) {
  const [fullName,  setFullName]  = useState('')
  const [username,  setUsername]  = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) { setFullName(''); setUsername(''); setPassword(''); setError(null); setFieldErrs({}) }
  }, [open])

  async function handleCreate() {
    setError(null); setFieldErrs({})
    if (!fullName.trim()) { setFieldErrs(p => ({ ...p, fullName: 'Required' })); return }
    if (username.length < 3) { setFieldErrs(p => ({ ...p, username: 'Min 3 characters' })); return }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setFieldErrs(p => ({ ...p, username: 'Letters, numbers and _ only' })); return }
    if (password.length < 8) { setFieldErrs(p => ({ ...p, password: 'Min 8 characters' })); return }

    setLoading(true)
    try {
      const res = await fetch('/api/scale/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.issues) {
          const errs: Record<string, string> = {}
          for (const i of data.issues) errs[i.path[0]] = i.message
          setFieldErrs(errs)
        } else {
          setError(data.error ?? 'Failed to create operator')
        }
        return
      }
      onCreated()
      onClose()
    } catch {
      setError('Failed to create operator')
    } finally {
      setLoading(false)
    }
  }

  return (
    <InlineDetailPanel open={open} onClose={onClose} title="Create Scale Operator" height={340}>
      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSecondary, display: 'block', marginBottom: 3 }}>
              Full Name *
            </label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full border px-3 py-1.5 focus:outline-none focus:border-[#185ABD]"
              style={{ fontSize: fontSize.sm, borderColor: fieldErrs.fullName ? colors.danger : '#E0E0E0', borderRadius: 2 }}
              placeholder="Jane Doe"
            />
            {fieldErrs.fullName && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{fieldErrs.fullName}</p>}
          </div>
          <div>
            <label style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSecondary, display: 'block', marginBottom: 3 }}>
              Username *
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border px-3 py-1.5 focus:outline-none focus:border-[#185ABD]"
              style={{ fontSize: fontSize.sm, borderColor: fieldErrs.username ? colors.danger : '#E0E0E0', borderRadius: 2 }}
              placeholder="jane_scale"
            />
            {fieldErrs.username && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{fieldErrs.username}</p>}
          </div>
        </div>
        <div>
          <label style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSecondary, display: 'block', marginBottom: 3 }}>
            Password *
          </label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border px-3 py-1.5 pr-9 focus:outline-none focus:border-[#185ABD]"
              style={{ fontSize: fontSize.sm, borderColor: fieldErrs.password ? colors.danger : '#E0E0E0', borderRadius: 2 }}
              placeholder="Min 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6C757D] hover:text-[#212529]"
            >
              {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          {fieldErrs.password && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{fieldErrs.password}</p>}
        </div>
        {error && <p style={{ fontSize: fontSize.xs, color: colors.danger }}>{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" variant="primary" onClick={handleCreate} loading={loading}>Create Operator</Btn>
        </div>
      </div>
    </InlineDetailPanel>
  )
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────

function OrdersTab() {
  const [search,       setSearch]       = useState('')
  const [status,       setStatus]       = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [operatorId,   setOperatorId]   = useState('')
  const [customerType, setCustomerType] = useState('')
  const [page,         setPage]         = useState(1)

  const [orders,       setOrders]       = useState<ScaleOrder[]>([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [operators,    setOperators]    = useState<{ id: string; fullName: string }[]>([])
  const [categories,   setCategories]   = useState<{ id: string; name: string }[]>([])
  const [exporting,    setExporting]    = useState(false)

  const [photoOrder,   setPhotoOrder]   = useState<OrderDetail | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [voidTarget,   setVoidTarget]   = useState<ScaleOrder | null>(null)

  const debouncedSearch = useDebounce(search, 300)
  const abortRef = useRef<AbortController | null>(null)

  const hasFilters = !!(search || status || dateFrom || dateTo || categoryName || operatorId || customerType)

  function clearFilters() {
    setSearch(''); setStatus(''); setDateFrom(''); setDateTo('')
    setCategoryName(''); setOperatorId(''); setCustomerType(''); setPage(1)
  }

  const fetchOrders = useCallback(async (pg: number) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const params = new URLSearchParams({
      page: String(pg), pageSize: '50',
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(status          && { status }),
      ...(dateFrom        && { dateFrom }),
      ...(dateTo          && { dateTo }),
      ...(categoryName    && { categoryName }),
      ...(operatorId      && { operatorId }),
      ...(customerType    && { customerType }),
    })

    setLoading(true); setError(null)
    try {
      const data = await fetcher(`/api/scale/orders?${params}`)
      setOrders(data.orders ?? [])
      setTotal(data.total   ?? 0)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, status, dateFrom, dateTo, categoryName, operatorId, customerType])

  // When filters change, reset to page 1; when page changes, fetch that page
  const prevFiltersRef = useRef({ debouncedSearch, status, dateFrom, dateTo, categoryName, operatorId, customerType })
  useEffect(() => {
    const prev = prevFiltersRef.current
    const filtersChanged =
      prev.debouncedSearch !== debouncedSearch || prev.status !== status ||
      prev.dateFrom !== dateFrom || prev.dateTo !== dateTo ||
      prev.categoryName !== categoryName || prev.operatorId !== operatorId ||
      prev.customerType !== customerType
    prevFiltersRef.current = { debouncedSearch, status, dateFrom, dateTo, categoryName, operatorId, customerType }
    if (filtersChanged) {
      setPage(1)
      fetchOrders(1)
    } else {
      fetchOrders(page)
    }
  }, [fetchOrders, page, debouncedSearch, status, dateFrom, dateTo, categoryName, operatorId, customerType]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetcher('/api/scale/operators?limit=100')
      .then((d: { users: { id: string; fullName: string }[] }) => setOperators(d.users ?? []))
      .catch(() => {})
    fetcher('/api/scale/categories')
      .then((d: { id: string; name: string }[]) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  async function openPhotos(order: ScaleOrder) {
    setPhotoLoading(true)
    try {
      const detail: OrderDetail = await fetcher(`/api/scale/orders/${order.id}`)
      setPhotoOrder(detail)
    } catch {
      toast.error('Failed to load photos')
    } finally {
      setPhotoLoading(false)
    }
  }

  async function handleMarkProcessed(order: ScaleOrder) {
    try {
      const res = await fetch(`/api/scale/orders/${order.id}/process`, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'processed' } : o))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark as processed')
    }
  }

  function handleVoided(id: string) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'voided' } : o))
  }

  async function fetchExportRows(): Promise<string[][]> {
    const params = new URLSearchParams({
      pageSize: '10000',
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(status          && { status }),
      ...(dateFrom        && { dateFrom }),
      ...(dateTo          && { dateTo }),
      ...(categoryName    && { categoryName }),
      ...(operatorId      && { operatorId }),
      ...(customerType    && { customerType }),
    })
    const data = await fetcher(`/api/scale/orders?${params}`)
    const rows: ScaleOrder[] = data.orders ?? []
    // One row per product line so every weight is captured
    return rows.flatMap(o => {
      const total = orderTotalWeight(o).toFixed(2)
      return orderLines(o).map(l => [
        o.orderNumber,
        new Date(o.createdAt).toLocaleString('en-ZA'),
        o.customer ? `${o.customer.firstName} ${o.customer.lastName}` : 'Walk-in',
        o.customer?.customerType === 'account' ? 'Account' : 'Walk-in',
        l.product.name,
        l.product.category,
        l.weight ? Number(l.weight).toFixed(2) : '—',
        total,
        o.status,
        o.operator.fullName,
      ])
    })
  }

  async function handleExportCsv() {
    setExporting(true)
    try {
      const rows = await fetchExportRows()
      const lines = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      const csv = [EXPORT_HEADERS.join(','), ...lines].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), { href: url, download: `scale-orders-${Date.now()}.csv` })
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function handleExportPdf() {
    setExporting(true)
    try {
      const rows = await fetchExportRows()

      const PAGE_W = 842, PAGE_H = 595 // A4 landscape, points
      const MARGIN = 30
      const ROW_H = 16
      const HEADER_H = 18
      const FONT_SIZE = 7.5
      const COL_W = [65, 90, 90, 55, 95, 75, 65, 80, 55, 90] // sums to 760 = PAGE_W - MARGIN*2

      const doc  = await PDFDocument.create()
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const bold = await doc.embedFont(StandardFonts.HelveticaBold)

      const colWidth = (i: number) => COL_W[i] ?? 70

      const drawColumnHeader = (page: PDFPage, headerY: number) => {
        page.drawRectangle({ x: MARGIN, y: headerY - HEADER_H, width: PAGE_W - MARGIN * 2, height: HEADER_H, color: rgb(0.9, 0.9, 0.9) })
        let x = MARGIN
        EXPORT_HEADERS.forEach((h, i) => {
          page.drawText(truncatePdfText(h, colWidth(i) - 6, bold, FONT_SIZE), { x: x + 3, y: headerY - HEADER_H + 5, size: FONT_SIZE, font: bold, color: rgb(0.1, 0.1, 0.1) })
          x += colWidth(i)
        })
      }

      const startPage = (): { page: PDFPage; y: number } => {
        const page = doc.addPage([PAGE_W, PAGE_H])
        let y = PAGE_H - MARGIN
        page.drawText('Scale Orders Export', { x: MARGIN, y, size: 12, font: bold })
        page.drawText(`Generated ${new Date().toLocaleString('en-ZA')}`, { x: PAGE_W - MARGIN - 160, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) })
        y -= 20
        drawColumnHeader(page, y)
        y -= HEADER_H
        return { page, y }
      }

      let { page, y } = startPage()

      for (const row of rows) {
        if (y - ROW_H < MARGIN) ({ page, y } = startPage())
        let x = MARGIN
        row.forEach((cell, i) => {
          page.drawText(truncatePdfText(cell, colWidth(i) - 6, font, FONT_SIZE), { x: x + 3, y: y - ROW_H + 5, size: FONT_SIZE, font, color: rgb(0.15, 0.15, 0.15) })
          x += colWidth(i)
        })
        page.drawLine({ start: { x: MARGIN, y: y - ROW_H }, end: { x: PAGE_W - MARGIN, y: y - ROW_H }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) })
        y -= ROW_H
      }

      const bytes = await doc.save()
      const blob  = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      const url   = URL.createObjectURL(blob)
      const a     = Object.assign(document.createElement('a'), { href: url, download: `scale-orders-${Date.now()}.pdf` })
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('PDF export failed')
    } finally {
      setExporting(false)
    }
  }

  const columns: Column<ScaleOrder>[] = [
    {
      key: 'orderNumber', header: 'Order #', width: '140px',
      render: (o) => (
        <span style={{ fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.process }}>
          {o.orderNumber}
        </span>
      ),
    },
    {
      key: 'createdAt', header: 'Date / Time', width: '140px',
      render: (o) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {new Date(o.createdAt).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'customer', header: 'Customer', width: '160px',
      render: (o) => {
        const name  = o.customer ? `${o.customer.firstName} ${o.customer.lastName}` : 'Walk-in'
        const isAcc = o.customer?.customerType === 'account'
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate" title={name} style={{ fontSize: fontSize.xs }}>{name}</span>
            <span
              className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
              style={{
                background: isAcc ? colors.processBg  : colors.neutralBg,
                color:      isAcc ? colors.process     : colors.textSecondary,
              }}
            >
              {isAcc ? 'Account' : 'Walk-in'}
            </span>
          </div>
        )
      },
    },
    {
      key: 'product', header: 'Product', width: '150px',
      render: (o) => {
        const lines = orderLines(o)
        // Show only the first product to keep rows aligned; the full list is on hover
        return (
          <span className="truncate block" title={orderProductNames(o)} style={{ fontSize: fontSize.xs }}>
            {lines[0]!.product.name}
            {lines.length > 1 && (
              <span className="ml-1" style={{ color: colors.textSecondary }}>+{lines.length - 1} more</span>
            )}
          </span>
        )
      },
    },
    {
      key: 'category', header: 'Category', width: '110px',
      render: (o) => {
        const cats = Array.from(new Set(orderLines(o).map(l => l.product.category)))
        return (
          <span className="truncate block" title={cats.join(', ')} style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
            {cats[0]}
            {cats.length > 1 && <span className="ml-1">+{cats.length - 1}</span>}
          </span>
        )
      },
    },
    {
      key: 'weight', header: 'Total Weight', width: '100px',
      render: (o) => {
        const total = orderTotalWeight(o)
        return (
          <span
            className="block text-right"
            title={orderLines(o).map(l => `${l.product.name}: ${l.weight ? Number(l.weight).toFixed(2) : '—'} ${l.product.unit}`).join('\n')}
            style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, fontFamily: 'monospace' }}
          >
            {total > 0 ? `${total.toFixed(2)} kg` : '—'}
          </span>
        )
      },
    },
    {
      key: 'status', header: 'Status', width: '90px',
      render: (o) => <StatusBadge status={o.status} />,
    },
    {
      key: 'operator', header: 'Operator', width: '120px',
      render: (o) => (
        <span className="truncate block" title={o.operator.fullName} style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {o.operator.fullName}
        </span>
      ),
    },
  ]

  const rowActions: RowAction<ScaleOrder>[] = [
    {
      label: 'View Slip',
      icon:  FileText,
      onClick: (o) => window.open(`/api/scale/orders/${o.id}/slip`, '_blank'),
    },
    {
      label:   'View Photos',
      icon:    Images,
      onClick: openPhotos,
    },
    {
      label:  'Mark Processed',
      icon:   CheckCircle2,
      hidden: (o) => o.status !== 'pending',
      onClick: handleMarkProcessed,
    },
    {
      label:   'Void Order',
      icon:    XCircle,
      danger:  true,
      hidden:  (o) => o.status === 'voided',
      onClick: (o) => setVoidTarget(o),
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <StatsStrip />

      {/* Filter bar */}
      <FilterBar>
        <Field label="Search" width={220}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search order #, customer…"
              style={{ ...inp, paddingLeft: 26 }}
            />
          </div>
        </Field>
        <Field label="Status" width={120}>
          <select style={inp} value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processed">Processed</option>
            <option value="voided">Voided</option>
          </select>
        </Field>
        <Field label="Customer" width={120}>
          <select style={inp} value={customerType} onChange={e => { setCustomerType(e.target.value); setPage(1) }}>
            <option value="">All Customers</option>
            <option value="casual">Walk-in</option>
            <option value="account">Account</option>
          </select>
        </Field>
        <Field label="Category" width={140}>
          <select style={inp} value={categoryName} onChange={e => { setCategoryName(e.target.value); setPage(1) }}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Operator" width={140}>
          <select style={inp} value={operatorId} onChange={e => { setOperatorId(e.target.value); setPage(1) }}>
            <option value="">All Operators</option>
            {operators.map(op => <option key={op.id} value={op.id}>{op.fullName}</option>)}
          </select>
        </Field>
        <Field label="From" width={140}>
          <input type="date" style={inp} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
        </Field>
        <Field label="To" width={140}>
          <input type="date" style={inp} value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
        </Field>
        {hasFilters && (
          <Field label={' '}>
            <Btn size="sm" icon={X} onClick={clearFilters}>Reset</Btn>
          </Field>
        )}
        <Field label={' '}>
          <Btn size="sm" icon={RefreshCw} onClick={() => fetchOrders(page)} title="Refresh">Refresh</Btn>
        </Field>
        <Field label={' '}>
          <BtnMenu
            size="sm"
            icon={Download}
            label="Export"
            loading={exporting}
            items={[
              { label: 'CSV', icon: Download, onClick: handleExportCsv },
              { label: 'PDF', icon: FileText, onClick: handleExportPdf },
            ]}
          />
        </Field>
        <span style={{ fontSize: 11, color: '#6C757D', marginLeft: 'auto', paddingBottom: 8 }}>
          {total} order{total !== 1 ? 's' : ''}
        </span>
      </FilterBar>

      {/* Table + photo panel stacked */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0" style={{ padding: 10 }}>
          <DataTable
            columns={columns}
            rows={orders}
            rowKey={o => o.id}
            rowActions={rowActions}
            loading={loading || photoLoading}
            error={error ?? undefined}
            emptyMessage="No scale orders found"
            total={total}
            page={page}
            pageSize={50}
            onPageChange={setPage}
          />
        </div>

        {photoOrder && (() => {
          const urls = photoOrder.photoUrls ?? []
          // Each product line always contributes photos in the same fixed
          // order it was captured in (see Step4Photos.tsx): scale reading,
          // then product/load. Building labels per-line (rather than one
          // hardcoded pair) is what makes orders with more than one product
          // show correctly here.
          const labels = orderLines(photoOrder).flatMap((l) =>
            (l.photoUrls ?? []).map((_, i) => `${l.product.name} — ${i === 0 ? 'Scale Reading' : i === 1 ? 'Product / Load' : `Photo ${i + 1}`}`)
          )
          const customerName = photoOrder.customer ? `${photoOrder.customer.firstName} ${photoOrder.customer.lastName}` : 'Walk-in'
          const dateStr = new Date(photoOrder.createdAt).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          return (
            <PhotoViewerModal
              title={`Photos — ${photoOrder.orderNumber}`}
              subtitle={`${customerName} · ${dateStr}`}
              photos={urls.map((url, i) => ({ label: labels[i] ?? `Photo ${i + 1}`, url }))}
              onClose={() => setPhotoOrder(null)}
            />
          )
        })()}
      </div>

      <VoidModal order={voidTarget} onClose={() => setVoidTarget(null)} onVoided={handleVoided} />
    </div>
  )
}

// ─── Operators Tab ────────────────────────────────────────────────────────────

function OperatorsTab() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const [operators,   setOperators]   = useState<Operator[]>([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(1)
  const [showCreate,  setShowCreate]  = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const fetchOperators = useCallback(async (pg: number) => {
    const params = new URLSearchParams({ page: String(pg), limit: '50', ...(debouncedSearch && { search: debouncedSearch }) })
    setLoading(true); setError(null)
    try {
      const data = await fetcher(`/api/scale/operators?${params}`)
      setOperators(data.users ?? [])
      setTotal(data.total   ?? 0)
    } catch {
      setError('Failed to load operators')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  useEffect(() => { fetchOperators(page) }, [fetchOperators, page])
  useEffect(() => { setPage(1); fetchOperators(1) }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAction(op: Operator, action: 'deactivate' | 'reactivate') {
    setActionLoading(op.id)
    try {
      const res = await fetch(`/api/scale/operators/${op.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      const updated: Operator = await res.json()
      setOperators(prev => prev.map(o => o.id === updated.id ? updated : o))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const columns: Column<Operator>[] = [
    {
      key: 'fullName', header: 'Full Name', width: '200px',
      render: (op) => (
        <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{op.fullName}</span>
      ),
    },
    {
      key: 'username', header: 'Username', width: '150px',
      render: (op) => (
        <span style={{ fontSize: fontSize.xs, fontFamily: 'monospace', color: colors.textSecondary }}>{op.username}</span>
      ),
    },
    {
      key: 'isActive', header: 'Status', width: '90px',
      render: (op) => <StatusBadge status={op.isActive ? 'active' : 'inactive'} />,
    },
    {
      key: 'lastLoginAt', header: 'Last Login', width: '140px',
      render: (op) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {op.lastLoginAt
            ? new Date(op.lastLoginAt).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Never'}
        </span>
      ),
    },
    {
      key: 'createdAt', header: 'Created', width: '120px',
      render: (op) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {new Date(op.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
  ]

  const rowActions: RowAction<Operator>[] = isAdmin ? [
    {
      label:  'Deactivate',
      icon:   EyeOff,
      danger: true,
      hidden: (op) => !op.isActive || actionLoading === op.id,
      onClick: (op) => handleAction(op, 'deactivate'),
    },
    {
      label:  'Reactivate',
      icon:   CheckCircle2,
      hidden: (op) => op.isActive || actionLoading === op.id,
      onClick: (op) => handleAction(op, 'reactivate'),
    },
  ] : []

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <FilterBar>
        <Field label="Search" width={230}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or username…"
              style={{ ...inp, paddingLeft: 26 }}
            />
          </div>
        </Field>
        <span style={{ marginLeft: 'auto', paddingBottom: 8 }}>
          <Btn size="sm" variant="primary" icon={UserPlus} onClick={() => setShowCreate(true)}>Create Operator</Btn>
        </span>
      </FilterBar>

      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0" style={{ padding: 10 }}>
          <DataTable
            columns={columns}
            rows={operators}
            rowKey={op => op.id}
            rowActions={rowActions}
            loading={loading}
            error={error ?? undefined}
            emptyMessage="No scale operators found — create one to get started"
            total={total}
            page={page}
            pageSize={50}
            onPageChange={setPage}
          />
        </div>

        <CreateOperatorPanel
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => { fetchOperators(1); setPage(1) }}
        />
      </div>
    </div>
  )
}

// ─── Step Config Tab ─────────────────────────────────────────────────────────

function ConfigTab() {
  const [configs,   setConfigs]   = useState<StepConfig[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [saving,    setSaving]    = useState<string | null>(null)

  const fetchConfigs = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetcher('/api/scale/step-config')
      setConfigs(data.configs ?? [])
    } catch {
      setError('Failed to load step configurations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])

  async function handleToggle(categoryId: string, field: 'requireWeight' | 'requirePhotos', value: boolean) {
    const config = configs.find(c => c.categoryId === categoryId)
    if (!config) return

    // Optimistic update
    setConfigs(prev => prev.map(c =>
      c.categoryId === categoryId ? { ...c, [field]: value, isInherited: false } : c
    ))

    setSaving(categoryId)
    try {
      const body = {
        requireWeight: field === 'requireWeight' ? value : config.requireWeight,
        requirePhotos: field === 'requirePhotos' ? value : config.requirePhotos,
      }
      const res = await fetch(`/api/scale/step-config/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to save')

      // Refresh to get updated inheritance info
      await fetchConfigs()
    } catch {
      // Revert on error
      fetchConfigs()
      toast.error('Failed to save configuration')
    } finally {
      setSaving(null)
    }
  }

  // Flatten parent categories followed by their own children (in order) so
  // the hierarchy still reads top-to-bottom in a single DataTable — each
  // child row indents itself off its own (already-present) parentId.
  const parents = configs.filter(c => !c.parentId)
  const childrenMap = new Map<string, StepConfig[]>()
  configs.filter(c => c.parentId).forEach(c => {
    const arr = childrenMap.get(c.parentId!) ?? []
    arr.push(c)
    childrenMap.set(c.parentId!, arr)
  })
  const rows = parents.flatMap(parent => [parent, ...(childrenMap.get(parent.categoryId) ?? [])])

  const columns: Column<StepConfig>[] = [
    {
      key: 'categoryName', header: 'Category',
      render: (c) => (
        <div className="flex items-center gap-2">
          {c.parentId && <span style={{ color: colors.textMuted, marginLeft: 8 }}>↳</span>}
          <span style={{ fontSize: fontSize.sm, fontWeight: c.parentId ? fontWeight.regular : fontWeight.semibold, color: colors.textPrimary }}>
            {c.categoryName}
          </span>
          {c.isInherited && (
            <span className="px-1.5 py-0.5 text-[10px]" style={{ background: colors.neutralBg, color: colors.textMuted, borderRadius: 2 }}>
              inherited
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'requireWeight', header: 'Weight', width: '100px',
      render: (c) => (
        <div className="flex justify-center">
          <ToggleSwitch checked={c.requireWeight} disabled={saving === c.categoryId} onChange={(v) => handleToggle(c.categoryId, 'requireWeight', v)} />
        </div>
      ),
    },
    {
      key: 'requirePhotos', header: 'Photos', width: '100px',
      render: (c) => (
        <div className="flex justify-center">
          <ToggleSwitch checked={c.requirePhotos} disabled={saving === c.categoryId} onChange={(v) => handleToggle(c.categoryId, 'requirePhotos', v)} />
        </div>
      ),
    },
    {
      key: 'updatedAt', header: 'Updated', width: '120px', align: 'right',
      render: (c) => saving === c.categoryId ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin inline" style={{ color: colors.process }} />
      ) : (
        <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
          {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }) : '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 shrink-0" style={{ background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 2 }}>
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: colors.process }} />
        <div style={{ fontSize: fontSize.xs, color: colors.textPrimary }}>
          <p className="font-medium">Configure Scale Station Steps</p>
          <p style={{ color: colors.textSecondary, marginTop: 2 }}>
            Enable or disable the <strong>Weight</strong> and <strong>Photos</strong> steps for each category.
            Child categories inherit parent settings unless overridden.
            Disabled steps will be skipped in the Scale Station app.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={c => c.categoryId}
          loading={loading}
          error={error ?? undefined}
          emptyMessage="No categories found. Create categories first."
        />
      </div>
    </div>
  )
}

// ─── Page (inner — uses useSearchParams) ─────────────────────────────────────

function ScaleManagementInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const tabParam     = searchParams.get('tab')
  const initial      = tabParam === 'operators' ? 'operators' : tabParam === 'config' ? 'config' : 'orders'
  const [activeTab, setActiveTab] = useState(initial)

  function changeTab(value: string) {
    setActiveTab(value)
    const query = value === 'operators' ? '?tab=operators' : value === 'config' ? '?tab=config' : ''
    router.replace(`/app/scale${query}`, { scroll: false })
  }

  return (
    <PortalPage
      tabs={[...TABS]}
      active={activeTab}
      onChange={changeTab}
    >
      {activeTab === 'orders'    && <OrdersTab />}
      {activeTab === 'operators' && <OperatorsTab />}
      {activeTab === 'config'    && <ConfigTab />}
    </PortalPage>
  )
}

export default function ScaleManagementPage() {
  return (
    <Suspense>
      <ScaleManagementInner />
    </Suspense>
  )
}
