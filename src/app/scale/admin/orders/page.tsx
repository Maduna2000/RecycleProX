'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Download, Eye, CheckCircle2, XCircle, Loader2, X } from 'lucide-react'
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

  const query = buildQuery(filters, page)
  const { data, isFetching } = useQuery({
    queryKey: ['scale-orders', query],
    queryFn: () => fetch(`/api/scale/orders?${query}`).then(r => r.json()),
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
        <h1 className="text-2xl font-bold text-slate-900">Scale Orders</h1>
        <div className="flex gap-2">
          <button onClick={() => exportOrders('csv')}  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"><Download className="w-4 h-4" />CSV</button>
          <button onClick={() => exportOrders('xlsx')} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"><Download className="w-4 h-4" />Excel</button>
        </div>
      </div>

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
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Photos</p>
                <div className="grid grid-cols-2 gap-3">
                  {detail.photoUrls.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-36 object-cover rounded-xl border border-slate-200 hover:opacity-90 transition-opacity" />
                    </a>
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
