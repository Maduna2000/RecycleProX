'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Download, Eye, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { PhotoViewerOverlay } from '@/components/ui/PhotoViewerOverlay'
import { colors, fontSize } from '@/lib/design-tokens'
import {
  inp, Btn, Field, PortalPage, FilterBar,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
  SectionLabel, DL,
} from '@/components/rpx'

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
  p.set('pageSize', '30')
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

  const orders: Order[] = data?.orders ?? []

  const columns: Column<Order>[] = [
    {
      key: 'orderNumber',
      header: 'Order #',
      width: '110px',
      render: (o) => <span className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{o.orderNumber}</span>,
    },
    {
      key: 'createdAt',
      header: 'Date/Time',
      width: '110px',
      render: (o) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {new Date(o.createdAt).toLocaleDateString('en-ZA')}<br />
          {new Date(o.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (o) => <span style={{ color: colors.textPrimary }}>{customerName(o)}</span>,
    },
    {
      key: 'product',
      header: 'Product',
      render: (o) => (
        o.lines && o.lines.length > 1 ? (
          <div>
            {o.lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: fontSize.xs }}>
                <span style={{ fontWeight: 500, color: colors.textPrimary }}>{l.product.name}</span>
                <span className="font-mono" style={{ color: colors.textMuted }}>{l.weight ? `${Number(l.weight).toFixed(2)} ${l.product.unit}` : '—'}</span>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ color: colors.textSecondary }}>{o.product.name}</span>
        )
      ),
    },
    {
      key: 'weight',
      header: 'Weight',
      width: '110px',
      align: 'right',
      render: (o) => (
        o.lines && o.lines.length > 1
          ? <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>see products</span>
          : <span className="font-mono" style={{ color: colors.textPrimary }}>{o.weight ? `${Number(o.weight).toFixed(2)} ${o.product.unit}` : '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (o) => <StatusBadge status={o.status} />,
    },
    {
      key: 'operator',
      header: 'Operator',
      width: '130px',
      render: (o) => <span style={{ color: colors.textSecondary }}>{o.operator.fullName}</span>,
    },
  ]

  const rowActions: RowAction<Order>[] = [
    { label: 'View', icon: Eye, onClick: (o) => openDetail(o.id) },
    { label: 'Mark Processed', icon: CheckCircle2, hidden: (o) => o.status !== 'pending', onClick: (o) => processMut.mutate(o.id) },
    { label: 'Void', icon: XCircle, danger: true, hidden: (o) => o.status === 'voided', onClick: (o) => setVoidId(o.id) },
  ]

  return (
    <PortalPage
      title="Scale Orders"
      actions={
        <>
          {data?.total !== undefined && (
            <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{data.total} total</span>
          )}
          <Btn size="sm" icon={RefreshCw} loading={isFetching} onClick={() => refetch()} title="Refresh orders">Refresh</Btn>
          <Btn size="sm" icon={Download} onClick={() => exportOrders('csv')}>CSV</Btn>
          <Btn size="sm" icon={Download} onClick={() => exportOrders('xlsx')}>Excel</Btn>
        </>
      }
    >
      {/* Filters */}
      <FilterBar>
        <Field label="From" width={145}>
          <input type="date" value={filters.dateFrom} onChange={e => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setPage(1) }} style={inp} />
        </Field>
        <Field label="To" width={145}>
          <input type="date" value={filters.dateTo} onChange={e => { setFilters(f => ({ ...f, dateTo: e.target.value })); setPage(1) }} style={inp} />
        </Field>
        <Field label="Status" width={130}>
          <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1) }} style={inp}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processed">Processed</option>
            <option value="voided">Voided</option>
          </select>
        </Field>
        <Field label="Search" width={220}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
            <input
              value={filters.search}
              onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1) }}
              placeholder="Search order # or customer..."
              style={{ ...inp, paddingLeft: 26 }}
            />
          </div>
        </Field>
      </FilterBar>

      {/* Table */}
      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={columns}
          rows={orders}
          rowKey={(o) => o.id}
          rowActions={rowActions}
          loading={isFetching && !data}
          error={error ? (error instanceof Error ? error.message : true) : undefined}
          emptyMessage="No orders found"
          total={data?.total}
          page={page}
          pageSize={30}
          onPageChange={setPage}
        />
      </div>

      {/* Void modal */}
      {voidId && (
        <Dialog open onOpenChange={(o) => { if (!o) { setVoidId(null); setVoidReason('') } }}>
          <RpxDialogContent maxWidth={440}>
            <RpxDialogHeader title="Void Order" onClose={() => { setVoidId(null); setVoidReason('') }} />
            <RpxDialogBody>
              <p style={{ fontSize: fontSize.sm, color: colors.textSecondary, margin: '0 0 10px' }}>
                Please provide a reason for voiding this order.
              </p>
              <textarea
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                rows={3}
                placeholder="Reason for voiding..."
                style={{ ...inp, height: 'auto', resize: 'none' }}
              />
            </RpxDialogBody>
            <RpxDialogFooter>
              <Btn onClick={() => { setVoidId(null); setVoidReason('') }} disabled={voidMut.isPending}>Cancel</Btn>
              <Btn
                variant="danger"
                loading={voidMut.isPending}
                disabled={voidReason.trim().length < 3}
                onClick={() => voidMut.mutate({ id: voidId, reason: voidReason })}
              >
                Void Order
              </Btn>
            </RpxDialogFooter>
          </RpxDialogContent>
        </Dialog>
      )}

      {/* Detail modal */}
      {detail && (
        <Dialog open onOpenChange={(o) => { if (!o) setDetail(null) }}>
          <RpxDialogContent maxWidth={560} style={{ maxHeight: '85dvh' }}>
            <RpxDialogHeader title={detail.orderNumber} onClose={() => setDetail(null)} />
            <RpxDialogBody>
              <DL rows={[
                ['Status', <StatusBadge key="status" status={detail.status} />],
                ['Date/Time', new Date(detail.createdAt).toLocaleString('en-ZA')],
                ['Customer', `${customerName(detail)} — ${customerContact(detail)}`],
              ]} />

              {detail.lines && detail.lines.length > 1 ? (
                <>
                  <SectionLabel text="Products" />
                  <div style={{ marginBottom: 6 }}>
                    {detail.lines.map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', borderBottom: '1px solid #F5F5F5' }}>
                        <span style={{ fontSize: fontSize.base }}>
                          <span style={{ fontWeight: 500, color: colors.textPrimary }}>{l.product.name}</span>
                          {l.product.category && <span style={{ fontSize: fontSize.xs, color: colors.textMuted, marginLeft: 6 }}>({l.product.category})</span>}
                        </span>
                        <span className="font-mono" style={{ fontSize: fontSize.base, color: colors.textPrimary }}>{l.weight ? `${Number(l.weight).toFixed(2)} ${l.product.unit}` : '—'}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <DL rows={[
                  ['Category', detail.product.category],
                  ['Product', detail.product.name],
                  ['Weight', detail.weight ? `${Number(detail.weight).toFixed(2)} ${detail.product.unit}` : '—'],
                ]} />
              )}

              <DL rows={[
                ['Operator', detail.operator.fullName],
                ...(detail.notes ? ([['Notes', detail.notes]] as [string, React.ReactNode][]) : []),
                ...(detail.voidReason ? ([['Void Reason', detail.voidReason]] as [string, React.ReactNode][]) : []),
              ]} />

              {detail.photoUrls && detail.photoUrls.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <SectionLabel text={`Photos (${detail.photoUrls.length})`} />
                    <button
                      onClick={() => setPhotoViewer({ urls: detail.photoUrls!, index: 0 })}
                      style={{ fontSize: fontSize.xs, fontWeight: 500, color: colors.action, background: 'none', border: 'none', cursor: 'pointer' }}
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {(() => {
                        let offset = 0
                        return detail.lines.map((line, li) => {
                          const urls = line.photoUrls ?? []
                          const startIndex = offset
                          offset += urls.length
                          if (urls.length === 0) return null
                          return (
                            <div key={li}>
                              <p style={{ fontSize: fontSize.xs, fontWeight: 500, color: colors.textSecondary, marginBottom: 6 }}>{line.product.name}</p>
                              <div className="grid grid-cols-2 gap-3">
                                {urls.map((url, i) => (
                                  <button
                                    key={i}
                                    onClick={() => setPhotoViewer({ urls: detail.photoUrls!, index: startIndex + i })}
                                    className="relative group"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt={`${line.product.name} photo ${i + 1}`} className="w-full h-36 object-cover group-hover:opacity-90 transition-opacity" style={{ border: '1px solid #E0E0E0', borderRadius: 2 }} />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors" style={{ borderRadius: 2 }}>
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
                          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-36 object-cover group-hover:opacity-90 transition-opacity" style={{ border: '1px solid #E0E0E0', borderRadius: 2 }} />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors" style={{ borderRadius: 2 }}>
                            <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detail.slipUrl && (
                <a
                  href={detail.slipUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%', border: '1px solid #B0B0B0', borderRadius: 3, padding: '8px 0',
                    fontSize: fontSize.sm, fontWeight: 500, color: colors.textPrimary, textDecoration: 'none',
                  }}
                >
                  View Slip PDF
                </a>
              )}
            </RpxDialogBody>
          </RpxDialogContent>
        </Dialog>
      )}

      {/* Photo Viewer - Fullscreen Overlay */}
      {photoViewer && (
        <PhotoViewerOverlay
          urls={photoViewer.urls}
          initialIndex={photoViewer.index}
          onClose={() => setPhotoViewer(null)}
        />
      )}
    </PortalPage>
  )
}
