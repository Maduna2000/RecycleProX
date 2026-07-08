'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  Search, X, Download, RefreshCw,
  FileText, Images, CheckCircle2, XCircle,
  UserPlus, Eye, EyeOff, Loader2, Scale,
  ChevronLeft, ChevronRight, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { InlineDetailPanel } from '@/components/ui/InlineDetailPanel'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Btn, PortalPage } from '@/components/rpx'

// ─── Types ────────────────────────────────────────────────────────────────────

type ScaleOrderLine = {
  weight:  string | null
  product: { name: string; unit: string; category: string }
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
function orderLines(o: ScaleOrder): ScaleOrderLine[] {
  if (o.lines && o.lines.length > 0) return o.lines
  return [{ weight: o.weight, product: { name: o.product.name, unit: o.product.unit ?? 'kg', category: o.product.category } }]
}

function orderTotalWeight(o: ScaleOrder): number {
  return orderLines(o).reduce((sum, l) => sum + (l.weight ? Number(l.weight) : 0), 0)
}

function orderProductNames(o: ScaleOrder): string {
  return orderLines(o).map(l => l.product.name).join(', ')
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

// ─── Photo Viewer Modal ───────────────────────────────────────────────────────
// Windows-style light modal showing both photos side by side

function FullscreenPhotoViewer({ order, onClose }: { order: OrderDetail | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  const urls = order?.photoUrls ?? []
  const labels = ['Scale Reading', 'Product / Load']

  // Wait for client-side mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset expanded state when order changes
  useEffect(() => {
    setExpandedIndex(null)
  }, [order?.id])

  // Keyboard navigation
  useEffect(() => {
    if (!order) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (expandedIndex !== null) {
          setExpandedIndex(null)
        } else {
          onClose()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [order, onClose, expandedIndex])

  if (!order || !mounted) return null

  const customerName = order.customer
    ? `${order.customer.firstName} ${order.customer.lastName}`
    : 'Walk-in'
  const dateStr = new Date(order.createdAt).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Modal container - Windows style */}
      <div
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 2,
          width: '100%',
          maxWidth: 900,
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: `1px solid ${colors.border}`,
            background: colors.bg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Images style={{ width: 18, height: 18, color: colors.process }} />
            <div>
              <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                Photos — {order.orderNumber}
              </span>
              <span style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginLeft: 12 }}>
                {customerName} · {dateStr}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'background 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.dangerBg }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            aria-label="Close"
          >
            <X style={{ width: 16, height: 16, color: colors.textSecondary }} />
          </button>
        </div>

        {/* Content - Photo grid */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 16,
            background: colors.bg,
          }}
        >
          {urls.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 48,
                color: colors.textSecondary,
              }}
            >
              <Images style={{ width: 48, height: 48, opacity: 0.3, marginBottom: 12 }} />
              <span style={{ fontSize: fontSize.sm }}>No photos available for this order</span>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: urls.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                gap: 16,
              }}
            >
              {urls.map((url, i) => (
                <div
                  key={i}
                  style={{
                    background: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  {/* Photo header */}
                  <div
                    style={{
                      padding: '10px 12px',
                      borderBottom: `1px solid ${colors.border}`,
                      background: colors.toolbar,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: fontSize.sm,
                          fontWeight: fontWeight.semibold,
                          color: colors.textPrimary,
                        }}
                      >
                        {labels[i] ?? `Photo ${i + 1}`}
                      </span>
                      <span
                        style={{
                          fontSize: fontSize.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {i + 1} of {urls.length}
                      </span>
                    </div>
                    <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 }}>
                      {dateStr} · {order.operator.fullName}
                    </div>
                  </div>

                  {/* Photo */}
                  <div
                    style={{
                      position: 'relative',
                      background: colors.bg,
                      cursor: 'pointer',
                    }}
                    onClick={() => setExpandedIndex(i)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={labels[i] ?? `Photo ${i + 1}`}
                      style={{
                        width: '100%',
                        height: 280,
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                    {/* Hover overlay */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 150ms ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0)' }}
                    >
                      <span
                        style={{
                          padding: '6px 12px',
                          background: colors.surface,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 2,
                          fontSize: fontSize.xs,
                          color: colors.textSecondary,
                          opacity: 0,
                          transition: 'opacity 150ms ease',
                        }}
                        className="expand-hint"
                      >
                        Click to expand
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: colors.surface,
          }}
        >
          <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
            {urls.length} photo{urls.length !== 1 ? 's' : ''} · Click to expand
          </span>
          <button
            onClick={onClose}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Expanded photo overlay */}
      {expandedIndex !== null && urls[expandedIndex] && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10000,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setExpandedIndex(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setExpandedIndex(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >
            <X style={{ width: 20, height: 20, color: '#fff' }} />
          </button>

          {/* Navigation */}
          {urls.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedIndex((expandedIndex - 1 + urls.length) % urls.length) }}
                style={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 48,
                  height: 48,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: 2,
                  cursor: 'pointer',
                }}
              >
                <ChevronLeft style={{ width: 24, height: 24, color: '#fff' }} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedIndex((expandedIndex + 1) % urls.length) }}
                style={{
                  position: 'absolute',
                  right: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 48,
                  height: 48,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: 2,
                  cursor: 'pointer',
                }}
              >
                <ChevronRight style={{ width: 24, height: 24, color: '#fff' }} />
              </button>
            </>
          )}

          {/* Expanded image */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urls[expandedIndex]}
              alt={labels[expandedIndex] ?? `Photo ${expandedIndex + 1}`}
              style={{
                maxWidth: 'calc(100vw - 120px)',
                maxHeight: 'calc(100vh - 120px)',
                objectFit: 'contain',
                borderRadius: 2,
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <div
              style={{
                padding: '8px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 2,
                fontSize: fontSize.sm,
                color: '#fff',
              }}
            >
              {labels[expandedIndex] ?? `Photo ${expandedIndex + 1}`} · {expandedIndex + 1} / {urls.length}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(modalContent, document.body)
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
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
          >
            Cancel
          </button>
          <button
            onClick={handleVoid}
            disabled={loading}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: colors.danger,
              border: '1px solid #C82333',
              borderRadius: 2,
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#A93226' }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = colors.danger }}
          >
            {loading && <Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} />}
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
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#E0E0E0' }}
          >
            {loading && <Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} />}
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

  async function handleExport() {
    setExporting(true)
    try {
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
      const headers = ['Order #', 'Date', 'Customer', 'Type', 'Product', 'Category', 'Weight (kg)', 'Order Total (kg)', 'Status', 'Operator']
      // One row per product line so every weight is captured
      const lines = rows.flatMap(o => {
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
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      })
      const csv = [headers.join(','), ...lines].join('\n')
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
          value={categoryName}
          onChange={e => { setCategoryName(e.target.value); setPage(1) }}
          className="h-7 px-2 border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] text-[12px] text-[#212529]"
          style={{ borderRadius: 2 }}
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
          >
            <X style={{ width: 9, height: 9 }} /> Reset
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => fetchOrders(page)}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
          >
            <RefreshCw style={{ width: 9, height: 9 }} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: exporting ? 'not-allowed' : 'pointer',
              opacity: exporting ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { if (!exporting) e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { if (!exporting) e.currentTarget.style.background = '#E0E0E0' }}
            title="Export CSV"
          >
            {exporting ? <Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> : <Download style={{ width: 9, height: 9 }} />}
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

        <FullscreenPhotoViewer order={photoOrder} onClose={() => setPhotoOrder(null)} />
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
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
          >
            <UserPlus style={{ width: 9, height: 9 }} /> Create Operator
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

  // Separate parent and child categories for hierarchical display
  const parents = configs.filter(c => !c.parentId)
  const childrenMap = new Map<string, StepConfig[]>()
  configs.filter(c => c.parentId).forEach(c => {
    const arr = childrenMap.get(c.parentId!) ?? []
    arr.push(c)
    childrenMap.set(c.parentId!, arr)
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.process }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p style={{ fontSize: fontSize.sm, color: colors.danger }}>{error}</p>
        <button
          onClick={fetchConfigs}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border"
          style={{ borderColor: colors.border, borderRadius: 2 }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Info banner */}
      <div
        className="flex items-start gap-3 p-3"
        style={{ background: colors.processBg, border: `1px solid ${colors.process}20`, borderRadius: 2 }}
      >
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

      {/* Config table */}
      <div className="bg-white border" style={{ borderColor: colors.border, borderRadius: 2 }}>
        {/* Header */}
        <div
          className="grid items-center px-4 py-2 border-b"
          style={{
            gridTemplateColumns: '1fr 100px 100px 120px',
            borderColor: colors.border,
            background: colors.bg,
          }}
        >
          <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Category
          </span>
          <span className="text-center" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Weight
          </span>
          <span className="text-center" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Photos
          </span>
          <span className="text-right" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Updated
          </span>
        </div>

        {/* Rows */}
        {parents.length === 0 ? (
          <div className="px-4 py-8 text-center" style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
            No categories found. Create categories first.
          </div>
        ) : (
          parents.map(parent => (
            <div key={parent.categoryId}>
              {/* Parent row */}
              <ConfigRow config={parent} saving={saving} onToggle={handleToggle} isChild={false} />

              {/* Child rows */}
              {childrenMap.get(parent.categoryId)?.map(child => (
                <ConfigRow key={child.categoryId} config={child} saving={saving} onToggle={handleToggle} isChild={true} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ConfigRow({
  config,
  saving,
  onToggle,
  isChild,
}: {
  config:   StepConfig
  saving:   string | null
  onToggle: (id: string, field: 'requireWeight' | 'requirePhotos', value: boolean) => void
  isChild:  boolean
}) {
  const isSaving = saving === config.categoryId

  return (
    <div
      className="grid items-center px-4 py-2.5 border-b last:border-b-0 transition-colors"
      style={{
        gridTemplateColumns: '1fr 100px 100px 120px',
        borderColor: colors.border,
        background: isSaving ? colors.bg : 'transparent',
      }}
    >
      {/* Category name */}
      <div className="flex items-center gap-2">
        {isChild && (
          <span style={{ color: colors.textMuted, marginLeft: 8 }}>↳</span>
        )}
        <span
          style={{
            fontSize: fontSize.sm,
            fontWeight: isChild ? fontWeight.regular : fontWeight.semibold,
            color: colors.textPrimary,
          }}
        >
          {config.categoryName}
        </span>
        {config.isInherited && (
          <span
            className="px-1.5 py-0.5 text-[10px]"
            style={{
              background: colors.neutralBg,
              color: colors.textMuted,
              borderRadius: 2,
            }}
          >
            inherited
          </span>
        )}
      </div>

      {/* Weight toggle */}
      <div className="flex justify-center">
        <ToggleSwitch
          checked={config.requireWeight}
          disabled={isSaving}
          onChange={(v) => onToggle(config.categoryId, 'requireWeight', v)}
        />
      </div>

      {/* Photos toggle */}
      <div className="flex justify-center">
        <ToggleSwitch
          checked={config.requirePhotos}
          disabled={isSaving}
          onChange={(v) => onToggle(config.categoryId, 'requirePhotos', v)}
        />
      </div>

      {/* Updated timestamp */}
      <div className="text-right">
        {isSaving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin inline" style={{ color: colors.process }} />
        ) : (
          <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
            {config.updatedAt
              ? new Date(config.updatedAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
              : '—'}
          </span>
        )}
      </div>
    </div>
  )
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked:  boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: checked ? colors.action : colors.border,
      }}
      role="switch"
      aria-checked={checked}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
        style={{
          transform: checked ? 'translateX(18px)' : 'translateX(3px)',
        }}
      />
    </button>
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
      actions={
        <Btn size="sm" icon={Scale} href="/scale" target="_blank">
          Open Scale Station
        </Btn>
      }
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
