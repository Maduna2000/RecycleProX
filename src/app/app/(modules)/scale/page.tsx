'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  Search, X, Download, RefreshCw,
  FileText, Images, CheckCircle2, XCircle,
  UserPlus, Eye, EyeOff, Loader2, Scale,
} from 'lucide-react'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { InlineDetailPanel } from '@/components/ui/InlineDetailPanel'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type ScaleOrder = {
  id:          string
  orderNumber: string
  status:      'pending' | 'processed' | 'voided'
  weight:      string
  createdAt:   string
  photoR2Keys: string[]
  notes?:      string
  customer:    { id: string; firstName: string; lastName: string; phone: string; customerType?: string } | null
  product:     { id: string; name: string; category: { id: string; name: string } }
  operator:    { id: string; fullName: string }
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

const TABS = [
  { value: 'orders',    label: 'Orders' },
  { value: 'operators', label: 'Operators' },
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-[#E0E0E0] rounded-sm px-4 py-3">
          <p style={{ fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.medium, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {c.label}
          </p>
          <p style={{ fontSize: 22, fontWeight: fontWeight.bold, color: c.color, lineHeight: 1.2, marginTop: 4 }}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Photo Detail Panel ───────────────────────────────────────────────────────

function PhotoDetailPanel({ order, onClose }: { order: OrderDetail | null; onClose: () => void }) {
  const open = !!order
  const customerName = order?.customer
    ? `${order.customer.firstName} ${order.customer.lastName}`
    : 'Walk-in'
  const dateStr = order ? new Date(order.createdAt).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : ''
  const labels = ['Scale Reading', 'Product / Load']

  return (
    <InlineDetailPanel
      open={open}
      onClose={onClose}
      title={order ? `Photos — ${order.orderNumber}` : 'Photos'}
      height={320}
    >
      {order && (
        <div className="p-4 flex flex-col gap-3 h-full overflow-y-auto">
          <div className="flex items-center gap-4 text-xs text-[#6C757D]">
            <span><strong style={{ color: colors.textPrimary }}>Customer:</strong> {customerName}</span>
            <span><strong style={{ color: colors.textPrimary }}>Date:</strong> {dateStr}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(order.photoUrls.length > 0 ? order.photoUrls : [null, null]).map((url, i) => (
              <div key={i} className="border border-[#E0E0E0] rounded-sm overflow-hidden bg-[#F8F9FA]">
                <div className="px-3 py-1.5 bg-[#F1F3F4] border-b border-[#E0E0E0]">
                  <p style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>
                    {labels[i] ?? `Photo ${i + 1}`}
                  </p>
                  <p style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{dateStr} · {customerName}</p>
                </div>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={labels[i]} className="w-full object-cover" style={{ maxHeight: 180 }} />
                ) : (
                  <div className="flex items-center justify-center h-32 text-xs text-[#9CA3AF]">No photo</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </InlineDetailPanel>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-[#E0E0E0] shadow-2xl w-full max-w-sm mx-4" style={{ borderRadius: 2 }}>
        <div className="px-5 py-4 border-b border-[#E0E0E0] flex items-center justify-between">
          <p style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.danger }}>
            Void Order
          </p>
          <button onClick={onClose} className="text-[#6C757D] hover:text-[#212529]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <p style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>
            Void <strong>{order.orderNumber}</strong>? This cannot be undone.
          </p>
          <div>
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
          </div>
          {error && <p style={{ fontSize: fontSize.xs, color: colors.danger }}>{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-[#E0E0E0] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 border border-[#E0E0E0] text-xs hover:bg-[#F1F3F4] transition-colors"
            style={{ borderRadius: 2 }}
          >
            Cancel
          </button>
          <button
            onClick={handleVoid}
            disabled={loading}
            className="px-4 py-1.5 text-xs text-white disabled:opacity-50 transition-colors flex items-center gap-1.5"
            style={{ background: colors.danger, borderRadius: 2 }}
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            Void Order
          </button>
        </div>
      </div>
    </div>
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
          <button
            onClick={onClose}
            className="px-4 py-1.5 border border-[#E0E0E0] text-xs hover:bg-[#F1F3F4] transition-colors"
            style={{ borderRadius: 2 }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-1.5 text-xs text-white disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            style={{ background: colors.action, borderRadius: 2 }}
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            Create Operator
          </button>
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
  const [categoryId,   setCategoryId]   = useState('')
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

  const hasFilters = !!(search || status || dateFrom || dateTo || categoryId || operatorId || customerType)

  function clearFilters() {
    setSearch(''); setStatus(''); setDateFrom(''); setDateTo('')
    setCategoryId(''); setOperatorId(''); setCustomerType(''); setPage(1)
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
      ...(categoryId      && { categoryId }),
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
  }, [debouncedSearch, status, dateFrom, dateTo, categoryId, operatorId, customerType])

  // When filters change, reset to page 1; when page changes, fetch that page
  const prevFiltersRef = useRef({ debouncedSearch, status, dateFrom, dateTo, categoryId, operatorId, customerType })
  useEffect(() => {
    const prev = prevFiltersRef.current
    const filtersChanged =
      prev.debouncedSearch !== debouncedSearch || prev.status !== status ||
      prev.dateFrom !== dateFrom || prev.dateTo !== dateTo ||
      prev.categoryId !== categoryId || prev.operatorId !== operatorId ||
      prev.customerType !== customerType
    prevFiltersRef.current = { debouncedSearch, status, dateFrom, dateTo, categoryId, operatorId, customerType }
    if (filtersChanged) {
      setPage(1)
      fetchOrders(1)
    } else {
      fetchOrders(page)
    }
  }, [fetchOrders, page, debouncedSearch, status, dateFrom, dateTo, categoryId, operatorId, customerType]) // eslint-disable-line react-hooks/exhaustive-deps

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
      alert('Failed to load photos')
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
      alert(e instanceof Error ? e.message : 'Failed to mark as processed')
    }
  }

  function handleVoided(id: string) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'voided' } : o))
  }

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams({
        pageSize: '10000',
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(status          && { status }),
        ...(dateFrom        && { dateFrom }),
        ...(dateTo          && { dateTo }),
        ...(categoryId      && { categoryId }),
        ...(operatorId      && { operatorId }),
        ...(customerType    && { customerType }),
      })
      const data = await fetcher(`/api/scale/orders?${params}`)
      const rows: ScaleOrder[] = data.orders ?? []
      const headers = ['Order #', 'Date', 'Customer', 'Type', 'Product', 'Category', 'Weight (kg)', 'Status', 'Operator']
      const lines = rows.map(o => [
        o.orderNumber,
        new Date(o.createdAt).toLocaleString('en-ZA'),
        o.customer ? `${o.customer.firstName} ${o.customer.lastName}` : 'Walk-in',
        o.customer?.customerType === 'account' ? 'Account' : 'Walk-in',
        o.product.name,
        o.product.category.name,
        o.weight,
        o.status,
        o.operator.fullName,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      const csv = [headers.join(','), ...lines].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), { href: url, download: `scale-orders-${Date.now()}.csv` })
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed')
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
      key: 'product', header: 'Product', width: '130px',
      render: (o) => (
        <span className="truncate block" title={o.product.name} style={{ fontSize: fontSize.xs }}>{o.product.name}</span>
      ),
    },
    {
      key: 'category', header: 'Category', width: '110px',
      render: (o) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{o.product.category.name}</span>
      ),
    },
    {
      key: 'weight', header: 'Weight', width: '90px',
      render: (o) => (
        <span className="block text-right" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, fontFamily: 'monospace' }}>
          {Number(o.weight).toFixed(2)} kg
        </span>
      ),
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
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <StatsStrip />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search order #, customer…"
            className="pl-8 pr-3 h-7 border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] text-[12px]"
            style={{ borderRadius: 2, width: 220 }}
          />
        </div>

        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="h-7 px-2 border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] text-[12px] text-[#212529]"
          style={{ borderRadius: 2 }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
          <option value="voided">Voided</option>
        </select>

        <select
          value={customerType}
          onChange={e => { setCustomerType(e.target.value); setPage(1) }}
          className="h-7 px-2 border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] text-[12px] text-[#212529]"
          style={{ borderRadius: 2 }}
        >
          <option value="">All Customers</option>
          <option value="casual">Walk-in</option>
          <option value="account">Account</option>
        </select>

        <select
          value={categoryId}
          onChange={e => { setCategoryId(e.target.value); setPage(1) }}
          className="h-7 px-2 border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] text-[12px] text-[#212529]"
          style={{ borderRadius: 2 }}
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          value={operatorId}
          onChange={e => { setOperatorId(e.target.value); setPage(1) }}
          className="h-7 px-2 border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] text-[12px] text-[#212529]"
          style={{ borderRadius: 2 }}
        >
          <option value="">All Operators</option>
          {operators.map(op => <option key={op.id} value={op.id}>{op.fullName}</option>)}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1) }}
          className="h-7 px-2 border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] text-[12px] text-[#212529]"
          style={{ borderRadius: 2 }}
          title="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1) }}
          className="h-7 px-2 border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] text-[12px] text-[#212529]"
          style={{ borderRadius: 2 }}
          title="To date"
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 h-7 px-2.5 border border-[#E0E0E0] text-[11px] text-[#6C757D] hover:bg-[#F1F3F4] transition-colors"
            style={{ borderRadius: 2 }}
          >
            <X className="w-3 h-3" /> Reset
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => fetchOrders(page)}
            className="flex items-center gap-1 h-7 px-2.5 border border-[#E0E0E0] text-[11px] text-[#6C757D] hover:bg-[#F1F3F4] transition-colors"
            style={{ borderRadius: 2 }}
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 h-7 px-2.5 border border-[#E0E0E0] text-[11px] text-[#6C757D] hover:bg-[#F1F3F4] disabled:opacity-50 transition-colors"
            style={{ borderRadius: 2 }}
            title="Export CSV"
          >
            {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Export
          </button>
        </div>
      </div>

      {/* Table + photo panel stacked */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0">
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

        <PhotoDetailPanel order={photoOrder} onClose={() => setPhotoOrder(null)} />
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
      alert(e instanceof Error ? e.message : 'Action failed')
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
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or username…"
            className="pl-8 pr-3 h-7 border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] text-[12px]"
            style={{ borderRadius: 2, width: 220 }}
          />
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 h-7 px-3 text-[11px] font-medium text-white transition-colors"
            style={{ background: colors.action, borderRadius: 2 }}
          >
            <UserPlus className="w-3.5 h-3.5" /> Create Operator
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0">
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

// ─── Page (inner — uses useSearchParams) ─────────────────────────────────────

function ScaleManagementInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const initial      = (searchParams.get('tab') === 'operators') ? 'operators' : 'orders'
  const [activeTab, setActiveTab] = useState(initial)

  function changeTab(value: string) {
    setActiveTab(value)
    router.replace(`/app/scale${value === 'operators' ? '?tab=operators' : ''}`, { scroll: false })
  }

  return (
    <PageShell
      title="Scale Station"
      subtitle="View scale orders, manage operators, and process transactions"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={changeTab}
      action={
        <a
          href="/scale"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors"
          style={{ borderColor: colors.process, color: colors.process, borderRadius: 2 }}
        >
          <Scale className="w-3.5 h-3.5" />
          Open Scale Station
        </a>
      }
    >
      {activeTab === 'orders'    && <OrdersTab />}
      {activeTab === 'operators' && <OperatorsTab />}
    </PageShell>
  )
}

export default function ScaleManagementPage() {
  return (
    <Suspense>
      <ScaleManagementInner />
    </Suspense>
  )
}
