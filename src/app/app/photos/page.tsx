'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Search, Download, Images, X, ChevronLeft, ChevronRight,
  Loader2, FileText, IdCard, Scale, ShoppingCart, Receipt, FileDown,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { colors } from '@/lib/design-tokens'
import type { PhotoRecord } from '@/app/api/photos/search/route'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type PhotosResponse = {
  photos: PhotoRecord[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

// ─── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_META: Record<PhotoRecord['type'], { label: string; color: string; bg: string; icon: React.ElementType }> = {
  purchase_signature: { label: 'Signature',    color: colors.action,   bg: colors.actionBg,  icon: FileText },
  purchase_vat264:    { label: 'VAT264 / SHG', color: colors.process,  bg: colors.processBg, icon: FileText },
  sale_photo:         { label: 'Sale Photo',   color: '#8B5CF6',       bg: '#F3EFFF',        icon: ShoppingCart },
  weighbridge:        { label: 'Scale Photo',  color: colors.warning,  bg: colors.warningBg, icon: Scale },
  casual_id:          { label: 'ID Photo',     color: colors.process,  bg: colors.processBg, icon: IdCard },
}

// ─── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(photos: PhotoRecord[]) {
  const header = 'Type,Ref#,Customer Name,ID Number,Product,Date\n'
  const rows = photos.map((p) => {
    const name    = p.customer ? `${p.customer.firstName} ${p.customer.lastName}` : ''
    const idNo    = p.customer?.idNumber ?? ''
    const prodName = p.product?.name ?? ''
    const date    = new Date(p.createdAt).toLocaleDateString('en-ZA')
    return [TYPE_META[p.type]?.label ?? p.type, p.refNumber ?? '', name, idNo, prodName, date]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  }).join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = `photos-export-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Photo card ────────────────────────────────────────────────────────────────

function PhotoCard({ photo, onClick }: { photo: PhotoRecord; onClick: () => void }) {
  const isPdf = photo.r2Key.toLowerCase().includes('.pdf') || photo.type === 'purchase_vat264'
  const meta  = TYPE_META[photo.type]
  const Icon  = meta?.icon ?? Images

  return (
    <div
      className="group relative bg-white rounded-xl overflow-hidden hover:shadow-lg transition-all cursor-pointer"
      style={{ border: `1px solid ${colors.border}` }}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="aspect-square flex items-center justify-center overflow-hidden" style={{ background: colors.bg }}>
        {isPdf ? (
          <div className="flex flex-col items-center gap-2" style={{ color: colors.textSecondary }}>
            <FileText className="w-10 h-10 opacity-40" />
            <span className="text-xs font-medium">{meta?.label ?? 'PDF'}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.viewUrl}
            alt="Photo"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
            onError={(e) => {
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              el.parentElement!.innerHTML = `<div class="flex flex-col items-center gap-1 opacity-40"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>`
            }}
          />
        )}
      </div>

      {/* Info strip */}
      <div className="p-2.5 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-xs font-semibold px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ color: meta?.color, background: meta?.bg }}
          >
            <Icon className="w-3 h-3" />
            {meta?.label ?? photo.type}
          </span>
          <span className="text-xs shrink-0" style={{ color: colors.textSecondary }}>
            {new Date(photo.createdAt).toLocaleDateString('en-ZA')}
          </span>
        </div>
        {photo.customer && (
          <p className="text-xs font-medium truncate" style={{ color: colors.textPrimary }}>
            {photo.customer.firstName} {photo.customer.lastName}
          </p>
        )}
        {photo.product && (
          <p className="text-xs truncate" style={{ color: colors.textSecondary }}>{photo.product.name}</p>
        )}
        {photo.refNumber && (
          <p className="text-xs font-mono truncate" style={{ color: colors.textSecondary }}>{photo.refNumber}</p>
        )}
      </div>
    </div>
  )
}

// ─── Viewer dialog ─────────────────────────────────────────────────────────────

function ViewerDialog({ viewer, onClose }: { viewer: PhotoRecord; onClose: () => void }) {
  const isPdf = viewer.r2Key.toLowerCase().includes('.pdf') || viewer.type === 'purchase_vat264'
  const meta  = TYPE_META[viewer.type]

  function download() {
    const a   = document.createElement('a')
    a.href    = viewer.viewUrl
    a.download = viewer.r2Key.split('/').pop() ?? 'file'
    a.target  = '_blank'
    a.click()
  }

  function openReceiptPdf() {
    if (viewer.type === 'purchase_signature' || viewer.type === 'purchase_vat264') {
      window.open(`/api/purchases/${viewer.transactionId}/receipt`, '_blank')
    } else if (viewer.type === 'sale_photo') {
      window.open(`/api/sales/${viewer.transactionId}/receipt`, '_blank')
    }
  }

  function openVat264() {
    window.open(`/api/purchases/${viewer.transactionId}/vat264`, '_blank')
  }

  const customerName = viewer.customer
    ? `${viewer.customer.firstName} ${viewer.customer.lastName}`.trim()
    : null

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden" style={{ maxHeight: '90vh' }}>
        <div className="flex flex-col" style={{ maxHeight: '90vh' }}>

          {/* Header */}
          <div className="flex items-start justify-between px-4 py-3 border-b" style={{ borderColor: colors.border, background: '#fff' }}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded"
                  style={{ color: meta?.color, background: meta?.bg }}
                >
                  {meta?.label}
                </span>
                {viewer.refNumber && (
                  <span className="text-xs font-mono" style={{ color: colors.textSecondary }}>{viewer.refNumber}</span>
                )}
                <span className="text-xs" style={{ color: colors.textSecondary }}>
                  {new Date(viewer.createdAt).toLocaleString('en-ZA')}
                </span>
              </div>
              {customerName && (
                <p className="text-sm font-semibold mt-0.5" style={{ color: colors.textPrimary }}>{customerName}</p>
              )}
              {viewer.customer?.idNumber && (
                <p className="text-xs" style={{ color: colors.textSecondary }}>ID: {viewer.customer.idNumber}</p>
              )}
              {viewer.product && (
                <p className="text-xs" style={{ color: colors.textSecondary }}>Product: {viewer.product.name}</p>
              )}
            </div>
            <button onClick={onClose} className="ml-3 p-1 rounded hover:bg-gray-100 shrink-0">
              <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto flex items-center justify-center" style={{ background: colors.bg, minHeight: 300 }}>
            {isPdf ? (
              <iframe
                src={viewer.viewUrl}
                className="w-full"
                style={{ height: '60vh', border: 'none' }}
                title="PDF Document"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewer.viewUrl}
                alt="Full photo"
                className="max-w-full object-contain"
                style={{ maxHeight: '65vh' }}
              />
            )}
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-t" style={{ borderColor: colors.border, background: '#fff' }}>
            <button
              onClick={download}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border"
              style={{ borderColor: colors.border, color: colors.textPrimary }}
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>

            {(viewer.type === 'purchase_signature' || viewer.type === 'purchase_vat264' || viewer.type === 'sale_photo') && (
              <button
                onClick={openReceiptPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white"
                style={{ background: colors.action }}
              >
                <Receipt className="w-3.5 h-3.5" /> Reprint Receipt
              </button>
            )}

            {(viewer.type === 'purchase_signature' || viewer.type === 'purchase_vat264') && (
              <button
                onClick={openVat264}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white"
                style={{ background: colors.process }}
              >
                <FileText className="w-3.5 h-3.5" /> VAT264 / SHG Act
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Photo grid ────────────────────────────────────────────────────────────────

function PhotoGrid({ queryType }: { queryType?: string }) {
  const [search,  setSearch]  = useState('')
  const [product, setProduct] = useState('')
  const [from,    setFrom]    = useState('')
  const [to,      setTo]      = useState('')
  const [page,    setPage]    = useState(1)
  const [viewer,  setViewer]  = useState<PhotoRecord | null>(null)

  const query = new URLSearchParams({
    ...(queryType && { type: queryType }),
    ...(search    && { search }),
    ...(product   && { product }),
    ...(from      && { from }),
    ...(to        && { to }),
    page: String(page),
    pageSize: '24',
  })

  const { data, isLoading } = useSWR<PhotosResponse>(
    `/api/photos/search?${query}`,
    fetcher,
    { keepPreviousData: true }
  )

  const photos    = data?.photos    ?? []
  const pageCount = data?.pageCount ?? 1
  const total     = data?.total     ?? 0

  function clearFilters() {
    setSearch(''); setProduct(''); setFrom(''); setTo(''); setPage(1)
  }

  const hasFilters = search || product || from || to

  return (
    <div className="space-y-4">

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative min-w-[180px] flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5" style={{ color: colors.textSecondary }} />
          <Input
            placeholder="Name, ID no, ref…"
            className="pl-8 h-9 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="relative min-w-[150px]">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5" style={{ color: colors.textSecondary }} />
          <Input
            placeholder="Product name…"
            className="pl-8 h-9 text-sm"
            value={product}
            onChange={(e) => { setProduct(e.target.value); setPage(1) }}
          />
        </div>
        <Input type="date" className="w-36 h-9 text-sm" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
        <Input type="date" className="w-36 h-9 text-sm" value={to}   onChange={(e) => { setTo(e.target.value);   setPage(1) }} />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs"
            style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {total > 0 && (
            <span className="text-xs" style={{ color: colors.textSecondary }}>
              {total} file{total !== 1 ? 's' : ''}
            </span>
          )}
          {photos.length > 0 && (
            <button
              onClick={() => exportCsv(photos)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
              style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}
            >
              <FileDown className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-2" style={{ color: colors.textSecondary }}>
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {!isLoading && photos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: colors.textSecondary }}>
          <Images className="w-12 h-12 opacity-25" />
          <p className="text-sm">No photos or documents found</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs underline" style={{ color: colors.process }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {photos.map((photo, i) => (
            <PhotoCard key={`${photo.r2Key}-${i}`} photo={photo} onClick={() => setViewer(photo)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-1.5 rounded border disabled:opacity-40"
            style={{ borderColor: colors.border }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs" style={{ color: colors.textSecondary }}>Page {page} of {pageCount}</span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="p-1.5 rounded border disabled:opacity-40"
            style={{ borderColor: colors.border }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Viewer */}
      {viewer && <ViewerDialog viewer={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PhotosPage() {
  return (
    <PageShell title="Photo Viewer" subtitle="Browse purchases, sales, weighbridge images, ID photos and documents">
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="purchase">Purchases</TabsTrigger>
          <TabsTrigger value="sale">Sales</TabsTrigger>
          <TabsTrigger value="weighbridge">Weighbridge</TabsTrigger>
          <TabsTrigger value="casual">ID Photos</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <PhotoGrid />
        </TabsContent>
        <TabsContent value="purchase">
          <PhotoGrid queryType="purchase" />
        </TabsContent>
        <TabsContent value="sale">
          <PhotoGrid queryType="sale" />
        </TabsContent>
        <TabsContent value="weighbridge">
          <PhotoGrid queryType="weighbridge" />
        </TabsContent>
        <TabsContent value="casual">
          <PhotoGrid queryType="casual" />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
