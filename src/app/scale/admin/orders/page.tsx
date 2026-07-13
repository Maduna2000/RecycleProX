'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Download, Eye, CheckCircle2, XCircle, Loader2, X, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { StatusBadge } from '../components/StatusBadge'
import { colors, fontSize, fontWeight, layout } from '@/lib/design-tokens'

interface OrderLine {
  product: { name: string; unit: string; category?: string }
  weight: string
  photoUrls?: string[]
}

interface Order {
  id: string; orderNumber: string; createdAt: string
  customer: { firstName: string; lastName: string; phone: string } | null
  casualFirstName?: string | null; casualLastName?: string | null; casualPhone?: string | null
  product:  { name: string; unit: string; category: string }
  weight: string; status: string; operator: { fullName: string }
  lines?: OrderLine[]
  photoUrls?: string[]; slipUrl?: string; notes?: string; voidReason?: string
}

function customerName(o: Order): string {
  if (o.customer) return `${o.customer.firstName} ${o.customer.lastName}`
  return `${o.casualFirstName ?? ''} ${o.casualLastName ?? ''}`.trim() || 'Walk-in'
}

function customerContact(o: Order): string {
  return o.customer?.phone ?? o.casualPhone ?? ''
}

interface Filters {
  dateFrom: string; dateTo: string; status: string
  operatorId: string; search: string
}

function buildQuery(f: Filters, page: number) {
  const p = new URLSearchParams()
  if (f.dateFrom)   p.set('dateFrom',   f.dateFrom)
  if (f.dateTo)     p.set('dateTo',     f.dateTo)
  if (f.status)     p.set('status',     f.status)
  if (f.operatorId) p.set('operatorId', f.operatorId)
  if (f.search)     p.set('search',     f.search)
  p.set('page',     String(page))
  p.set('pageSize', '50')
  return p.toString()
}

export default function ScaleOrdersPage() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState<Filters>({ dateFrom: '', dateTo: '', status: '', operatorId: '', search: '' })
  const [page, setPage]       = useState(1)
  const [detail, setDetail]   = useState<Order | null>(null)
  const [voidId, setVoidId]   = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [photoViewer, setPhotoViewer] = useState<{ urls: string[]; index: number } | null>(null)

  const query = buildQuery(filters, page)
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['scale-orders', query],
    queryFn: async () => {
      const res = await fetch(`/api/scale/orders?${query}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to fetch orders: ${res.status}`)
      }
      return res.json()
    },
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 2,
  })

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      fetch(`/api/scale/orders/${id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voidReason: reason }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scale-orders'] }); setVoidId(null); setVoidReason('') },
  })

  const processMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/scale/orders/${id}/process`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scale-orders'] }),
  })

  async function openDetail(id: string) {
    const res = await fetch(`/api/scale/orders/${id}`)
    const o   = await res.json()
    setDetail(o)
  }

  function exportOrders(format: 'csv' | 'xlsx') {
    const p = new URLSearchParams()
    if (filters.dateFrom) p.set('dateFrom', filters.dateFrom)
    if (filters.dateTo)   p.set('dateTo',   filters.dateTo)
    if (filters.status)   p.set('status',   filters.status)
    if (filters.search)   p.set('search',   filters.search)
    p.set('format', format)
    window.open(`/api/scale/reports/export?${p.toString()}`, '_blank')
  }

  const orders: Order[]     = data?.orders ?? []
  const totalPages: number  = data?.totalPages ?? 1

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Scale Orders</h1>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh orders"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          {data?.total !== undefined && (
            <span className="text-sm text-slate-500">({data.total} total)</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportOrders('csv')}  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"><Download className="w-4 h-4" />CSV</button>
          <button onClick={() => exportOrders('xlsx')} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"><Download className="w-4 h-4" />Excel</button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-800 font-medium">Failed to load orders</p>
            <p className="text-red-600 text-sm">{error instanceof Error ? error.message : 'Unknown error'}</p>
            <button onClick={() => refetch()} className="text-red-700 text-sm font-medium underline mt-1">Try again</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
        <input type="date" value={filters.dateFrom} onChange={e => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setPage(1) }} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={filters.dateTo}   onChange={e => { setFilters(f => ({ ...f, dateTo:   e.target.value })); setPage(1) }} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1) }} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
          <option value="voided">Voided</option>
        </select>
        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={filters.search} onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1) }} placeholder="Search order # or customer..." className="flex-1 text-sm focus:outline-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isFetching && <div className="h-1 bg-emerald-500 animate-pulse" />}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Order #</th>
              <th className="px-4 py-3 text-left">Date/Time</th>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left hidden lg:table-cell">Product</th>
              <th className="px-4 py-3 text-right hidden md:table-cell">Weight</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-left hidden xl:table-cell">Operator</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map(o => (
              <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs">{o.orderNumber}</td>
                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                  {new Date(o.createdAt).toLocaleDateString('en-ZA')}<br />
                  {new Date(o.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3 text-slate-800">{customerName(o)}</td>
                <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                  {o.lines && o.lines.length > 1 ? (
                    <div className="space-y-0.5">
                      {o.lines.map((l, i) => (
                        <div key={i} className="flex items-baseline gap-1.5 text-xs">
                          <span className="font-medium text-slate-700">{l.product.name}</span>
                          <span className="text-slate-400 font-mono">{l.weight ? `${Number(l.weight).toFixed(2)} ${l.product.unit}` : '—'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    o.product.name
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 hidden md:table-cell">
                  {o.lines && o.lines.length > 1
                    ? <span className="text-slate-400 text-xs">see products</span>
                    : <>{o.weight ? `${Number(o.weight).toFixed(2)} ${o.product.unit}` : '—'}</>
                  }
                </td>
                <td className="px-4 py-3 text-center"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-slate-500 hidden xl:table-cell">{o.operator.fullName}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-center">
                    <button onClick={() => openDetail(o.id)} title="View" className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><Eye className="w-4 h-4 text-slate-500" /></button>
                    {o.status === 'pending' && (
                      <button onClick={() => processMut.mutate(o.id)} title="Mark Processed" className="p-1.5 hover:bg-green-50 rounded-lg transition-colors">
                        {processMut.isPending ? <Loader2 className="w-4 h-4 animate-spin text-green-500" /> : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                      </button>
                    )}
                    {o.status !== 'voided' && (
                      <button onClick={() => setVoidId(o.id)} title="Void" className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"><XCircle className="w-4 h-4 text-red-400" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-slate-50">Previous</button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-slate-50">Next</button>
        </div>
      )}

      {/* Void modal */}
      {voidId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Void Order</h3>
            <p className="text-slate-500 text-sm mb-4">Please provide a reason for voiding this order.</p>
            <textarea
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              rows={3}
              placeholder="Reason for voiding..."
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setVoidId(null); setVoidReason('') }} className="flex-1 border border-slate-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => voidMut.mutate({ id: voidId, reason: voidReason })}
                disabled={voidReason.trim().length < 3 || voidMut.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
              >
                {voidMut.isPending ? 'Voiding...' : 'Void Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">{detail.orderNumber}</h3>
              <button onClick={() => setDetail(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <DetailRow label="Status"    value={<StatusBadge status={detail.status} />} />
              <DetailRow label="Date/Time" value={new Date(detail.createdAt).toLocaleString('en-ZA')} />
              <DetailRow label="Customer"  value={`${customerName(detail)} — ${customerContact(detail)}`} />
              {detail.lines && detail.lines.length > 1 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Products</p>
                  <div className="space-y-1.5">
                    {detail.lines.map((l, i) => (
                      <div key={i} className="flex justify-between items-baseline text-sm">
                        <div>
                          <span className="text-slate-800 font-medium">{l.product.name}</span>
                          {l.product.category && <span className="text-xs text-slate-400 ml-1.5">({l.product.category})</span>}
                        </div>
                        <span className="font-mono text-slate-700">{l.weight ? `${Number(l.weight).toFixed(2)} ${l.product.unit}` : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <DetailRow label="Category" value={detail.product.category} />
                  <DetailRow label="Product"  value={detail.product.name} />
                  <DetailRow label="Weight"   value={detail.weight ? `${Number(detail.weight).toFixed(2)} ${detail.product.unit}` : '—'} />
                </>
              )}
              <DetailRow label="Operator"  value={detail.operator.fullName} />
              {detail.notes     && <DetailRow label="Notes"       value={detail.notes} />}
              {detail.voidReason && <DetailRow label="Void Reason" value={detail.voidReason} />}
            </div>

            {detail.photoUrls && detail.photoUrls.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Photos ({detail.photoUrls.length})</p>
                  <button
                    onClick={() => setPhotoViewer({ urls: detail.photoUrls!, index: 0 })}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    View All
                  </button>
                </div>

                {/* Grouped per product when this is a multi-line order, so
                    it's clear which pair of photos belongs to which
                    weighed item — the fullscreen viewer still opens onto
                    the same flat, order-wide list (correct global index per
                    thumbnail), so prev/next keeps working across products. */}
                {detail.lines && detail.lines.length > 1 && detail.lines.some(l => l.photoUrls?.length) ? (
                  <div className="space-y-4">
                    {(() => {
                      let offset = 0
                      return detail.lines.map((line, li) => {
                        const urls = line.photoUrls ?? []
                        const startIndex = offset
                        offset += urls.length
                        if (urls.length === 0) return null
                        return (
                          <div key={li}>
                            <p className="text-xs font-medium text-slate-600 mb-1.5">{line.product.name}</p>
                            <div className="grid grid-cols-2 gap-3">
                              {urls.map((url, i) => (
                                <button
                                  key={i}
                                  onClick={() => setPhotoViewer({ urls: detail.photoUrls!, index: startIndex + i })}
                                  className="relative group"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={`${line.product.name} photo ${i + 1}`} className="w-full h-36 object-cover rounded-xl border border-slate-200 group-hover:opacity-90 transition-opacity" />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 rounded-xl transition-colors">
                                    <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {detail.photoUrls.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setPhotoViewer({ urls: detail.photoUrls!, index: i })}
                        className="relative group"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-36 object-cover rounded-xl border border-slate-200 group-hover:opacity-90 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 rounded-xl transition-colors">
                          <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {detail.slipUrl && (
              <a href={detail.slipUrl} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 w-full border border-slate-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors">
                View Slip PDF
              </a>
            )}
          </div>
        </div>
      )}

      {/* Photo Viewer - Fullscreen Overlay */}
      {photoViewer && (
        <PhotoViewerOverlay
          urls={photoViewer.urls}
          initialIndex={photoViewer.index}
          onClose={() => setPhotoViewer(null)}
        />
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-slate-800 text-right font-medium">{value}</span>
    </div>
  )
}

// ─── Photo Viewer Overlay ─────────────────────────────────────────────────────
// Fullscreen photo viewer using design tokens - completely unrestricted display

interface PhotoViewerOverlayProps {
  urls: string[]
  initialIndex: number
  onClose: () => void
}

function PhotoViewerOverlay({ urls, initialIndex, onClose }: PhotoViewerOverlayProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [mounted, setMounted] = useState(false)

  // Wait for client-side mount before rendering portal
  useEffect(() => {
    setMounted(true)
  }, [])

  const goNext = useCallback(() => {
    if (urls.length > 1) {
      setCurrentIndex(prev => (prev + 1) % urls.length)
    }
  }, [urls.length])

  const goPrev = useCallback(() => {
    if (urls.length > 1) {
      setCurrentIndex(prev => (prev - 1 + urls.length) % urls.length)
    }
  }, [urls.length])

  // Keyboard navigation + body scroll lock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowRight':
        case 'ArrowDown':
          goNext()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          goPrev()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose, goNext, goPrev])

  // Overlay container - covers entire viewport
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  // Close button style
  const closeButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: layout.cardRadius,
    cursor: 'pointer',
    transition: 'background 150ms ease',
  }

  // Counter badge style
  const counterStyle: React.CSSProperties = {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: '8px 16px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textOnDark,
  }

  // Navigation button style
  const navButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 56,
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'background 150ms ease',
  }

  // Image container - full viewport with minimal padding
  const imageContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  }

  // Image style - unrestricted, fills available space
  const imageStyle: React.CSSProperties = {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: layout.cardRadius,
    userSelect: 'none',
  }

  // Thumbnail strip style
  const thumbnailStripStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    background: 'rgba(0, 0, 0, 0.6)',
    borderRadius: layout.cardRadius,
    maxWidth: '90vw',
    overflowX: 'auto',
  }

  // Thumbnail button style
  const thumbnailStyle = (isActive: boolean): React.CSSProperties => ({
    flexShrink: 0,
    width: 56,
    height: 56,
    borderRadius: layout.btnRadius,
    overflow: 'hidden',
    border: isActive ? `2px solid ${colors.action}` : '2px solid transparent',
    opacity: isActive ? 1 : 0.5,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    transform: isActive ? 'scale(1.1)' : 'scale(1)',
  })

  // Don't render on server - portal needs document.body
  if (!mounted) return null

  const overlayContent = (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={closeButtonStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)' }}
        aria-label="Close photo viewer"
      >
        <X style={{ width: 24, height: 24, color: colors.textOnDark }} />
      </button>

      {/* Photo counter */}
      <div style={counterStyle}>
        {currentIndex + 1} / {urls.length}
      </div>

      {/* Previous button */}
      {urls.length > 1 && (
        <button
          onClick={goPrev}
          style={{ ...navButtonStyle, left: 24 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)' }}
          aria-label="Previous photo"
        >
          <ChevronLeft style={{ width: 32, height: 32, color: colors.textOnDark }} />
        </button>
      )}

      {/* Main image */}
      <div style={imageContainerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[currentIndex]}
          alt={`Photo ${currentIndex + 1} of ${urls.length}`}
          style={imageStyle}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      </div>

      {/* Next button */}
      {urls.length > 1 && (
        <button
          onClick={goNext}
          style={{ ...navButtonStyle, right: 24 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)' }}
          aria-label="Next photo"
        >
          <ChevronRight style={{ width: 32, height: 32, color: colors.textOnDark }} />
        </button>
      )}

      {/* Thumbnail strip */}
      {urls.length > 1 && (
        <div style={thumbnailStripStyle}>
          {urls.map((url, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              style={thumbnailStyle(i === currentIndex)}
              onMouseEnter={(e) => { if (i !== currentIndex) e.currentTarget.style.opacity = '0.8' }}
              onMouseLeave={(e) => { if (i !== currentIndex) e.currentTarget.style.opacity = '0.5' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Thumbnail ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Keyboard hint - desktop only */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          fontSize: fontSize.xs,
          color: 'rgba(255, 255, 255, 0.4)',
        }}
      >
        ESC to close{urls.length > 1 ? ' · Arrow keys to navigate' : ''}
      </div>
    </div>
  )

  // Render via portal to document.body - escapes all parent CSS stacking contexts
  return createPortal(overlayContent, document.body)
}
