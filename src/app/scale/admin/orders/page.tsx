'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Download, Eye, CheckCircle2, XCircle, Loader2, X, RefreshCw, AlertCircle } from 'lucide-react'
import { StatusBadge } from '../components/StatusBadge'

interface OrderLine {
  product: { name: string; unit: string; category?: string }
  weight: string
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
                          <span className="text-slate-400 font-mono">{Number(l.weight).toFixed(2)} {l.product.unit}</span>
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
                    : <>{Number(o.weight).toFixed(2)} {o.product.unit}</>
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
                        <span className="font-mono text-slate-700">{Number(l.weight).toFixed(2)} {l.product.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <DetailRow label="Category" value={detail.product.category} />
                  <DetailRow label="Product"  value={detail.product.name} />
                  <DetailRow label="Weight"   value={`${Number(detail.weight).toFixed(2)} ${detail.product.unit}`} />
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

      {/* Fullscreen Photo Viewer Modal */}
      {photoViewer && (
        <FullscreenPhotoViewer
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

// Fullscreen Photo Viewer with keyboard navigation
function FullscreenPhotoViewer({
  urls,
  initialIndex,
  onClose
}: {
  urls: string[]
  initialIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)

  const goNext = useCallback(() => {
    if (urls.length > 1) {
      setIndex(prev => (prev + 1) % urls.length)
    }
  }, [urls.length])

  const goPrev = useCallback(() => {
    if (urls.length > 1) {
      setIndex(prev => (prev - 1 + urls.length) % urls.length)
    }
  }, [urls.length])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        goNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        goPrev()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    // Prevent body scroll while modal is open
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose, goNext, goPrev])

  return (
    <div
      className="fixed inset-0 bg-black z-[100] flex items-center justify-center"
      onClick={(e) => {
        // Close when clicking on the backdrop (not the image or controls)
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      {/* Close button - top right */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-20 p-3 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
        aria-label="Close"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Photo counter - top left */}
      <div className="absolute top-4 left-4 z-20 px-4 py-2 bg-black/60 rounded-full">
        <span className="text-white text-sm font-medium">
          {index + 1} / {urls.length}
        </span>
      </div>

      {/* Previous button */}
      {urls.length > 1 && (
        <button
          onClick={goPrev}
          className="absolute left-4 z-20 p-4 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
          aria-label="Previous photo"
        >
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Main image - centered and fills available space */}
      <div className="w-full h-full flex items-center justify-center p-4 md:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[index]}
          alt={`Photo ${index + 1}`}
          className="max-w-full max-h-full object-contain select-none"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      </div>

      {/* Next button */}
      {urls.length > 1 && (
        <button
          onClick={goNext}
          className="absolute right-4 z-20 p-4 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
          aria-label="Next photo"
        >
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Thumbnail strip - bottom */}
      {urls.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-3 bg-black/60 rounded-xl overflow-x-auto max-w-[90vw]">
          {urls.map((url, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                i === index
                  ? 'border-emerald-500 opacity-100 scale-110'
                  : 'border-transparent opacity-50 hover:opacity-100'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Keyboard hint */}
      <div className="absolute bottom-4 right-4 z-20 text-white/40 text-xs hidden md:block">
        Press ESC to close{urls.length > 1 ? ' · Arrow keys to navigate' : ''}
      </div>
    </div>
  )
}
