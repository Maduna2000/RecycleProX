'use client'

import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Search, Download, Images, X, ChevronLeft, ChevronRight,
  Loader2, FileText, IdCard, Scale, ShoppingCart, Receipt, FileDown,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize } from '@/lib/design-tokens'
import type { PhotoRecord } from '@/app/api/photos/search/route'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type PhotosResponse = {
  photos: PhotoRecord[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_META: Record<PhotoRecord['type'], { label: string; color: string; bg: string; icon: React.ElementType }> = {
  purchase_signature: { label: 'Signature',    color: colors.action,   bg: colors.actionBg,  icon: FileText    },
  purchase_vat264:    { label: 'VAT264 / SHG', color: colors.process,  bg: colors.processBg, icon: FileText    },
  purchase_photo:     { label: 'Stock Photo',  color: '#059669',       bg: '#ECFDF5',        icon: ShoppingCart },
  sale_photo:         { label: 'Sale Photo',   color: '#8B5CF6',       bg: '#F3EFFF',        icon: ShoppingCart },
  weighbridge:        { label: 'Scale Photo',  color: colors.warning,  bg: colors.warningBg, icon: Scale       },
  casual_id:          { label: 'ID Photo',     color: colors.process,  bg: colors.processBg, icon: IdCard      },
}

const TABS = [
  { value: 'all',          label: 'All'         },
  { value: 'purchase',     label: 'Purchases'   },
  { value: 'sale',         label: 'Sales'       },
  { value: 'weighbridge',  label: 'Weighbridge' },
  { value: 'casual',       label: 'ID Photos'   },
] as const

const EMPTY_MESSAGES: Record<string, string> = {
  all:          'No photos or documents found',
  purchase:     'No purchase signatures or VAT264 documents',
  sale:         'No sale photos',
  weighbridge:  'No weighbridge photos',
  casual:       'No ID photos',
}

// ─── CSV export ───────────────────────────────────────────────────────────────

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

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({ photo, onClick }: { photo: PhotoRecord; onClick: () => void }) {
  const isPdf = photo.r2Key.toLowerCase().includes('.pdf') || photo.type === 'purchase_vat264'
  const meta  = TYPE_META[photo.type]
  const Icon  = meta?.icon ?? Images

  return (
    <div
      className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      style={{ border: `1px solid ${colors.border}` }}
      onClick={onClick}
    >
      {/* Thumbnail — 3:2 landscape ratio */}
      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{ aspectRatio: '3/2', background: colors.bg }}
      >
        {isPdf ? (
          <div className="flex flex-col items-center gap-2" style={{ color: colors.textSecondary }}>
            <FileText className="w-10 h-10 opacity-30" />
            <span className="text-xs font-medium">{meta?.label ?? 'PDF'}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.viewUrl}
            alt={meta?.label ?? 'Photo'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
            onError={(e) => {
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              el.parentElement!.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;opacity:0.3;color:#6C757D"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>`
            }}
          />
        )}
      </div>

      {/* Info strip */}
      <div className="p-3 space-y-1 border-t" style={{ borderColor: colors.border }}>
        <div className="flex items-center justify-between gap-1">
          <span
            className="flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ color: meta?.color, background: meta?.bg }}
          >
            <Icon className="w-3 h-3 shrink-0" />
            {meta?.label ?? photo.type}
          </span>
          <span className="text-xs shrink-0" style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
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
          <p className="font-mono truncate" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
            {photo.refNumber}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Viewer dialog ────────────────────────────────────────────────────────────

function ViewerDialog({
  viewer, photos, onClose, onPrev, onNext,
}: {
  viewer:  PhotoRecord
  photos:  PhotoRecord[]
  onClose: () => void
  onPrev:  (() => void) | null
  onNext:  (() => void) | null
}) {
  const isPdf = viewer.r2Key.toLowerCase().includes('.pdf') || viewer.type === 'purchase_vat264'
  const meta  = TYPE_META[viewer.type]
  const idx   = photos.findIndex((p) => p.r2Key === viewer.r2Key)

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
          <div className="flex items-start justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: colors.border }}>
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
          <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-t shrink-0" style={{ borderColor: colors.border, background: '#fff' }}>
            {/* Prev / Next navigation */}
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={onPrev ?? undefined}
                disabled={!onPrev}
                className="p-1.5 rounded border disabled:opacity-30"
                style={{ borderColor: colors.border }}
                title="Previous (←)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs tabular-nums" style={{ color: colors.textSecondary }}>
                {idx + 1} / {photos.length}
              </span>
              <button
                onClick={onNext ?? undefined}
                disabled={!onNext}
                className="p-1.5 rounded border disabled:opacity-30"
                style={{ borderColor: colors.border }}
                title="Next (→)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

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

// ─── Photo grid ───────────────────────────────────────────────────────────────

function PhotoGrid({
  queryType,
  onPhotosChange,
}: {
  queryType?:      string
  onPhotosChange?: (photos: PhotoRecord[]) => void
}) {
  const [search, setSearch] = useState('')
  const [from,   setFrom]   = useState('')
  const [to,     setTo]     = useState('')
  const [page,   setPage]   = useState(1)
  const [viewer, setViewer] = useState<PhotoRecord | null>(null)

  const query = new URLSearchParams({
    ...(queryType && { type: queryType }),
    ...(search    && { search }),
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

  // Notify parent of current photos (for CSV export in header)
  const stableOnPhotosChange = useCallback(
    (p: PhotoRecord[]) => onPhotosChange?.(p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onPhotosChange]
  )
  useEffect(() => { stableOnPhotosChange(photos) }, [photos, stableOnPhotosChange])

  // Keyboard navigation in viewer
  useEffect(() => {
    if (!viewer) return
    function onKey(e: KeyboardEvent) {
      const idx = photos.findIndex((p) => p.r2Key === viewer!.r2Key)
      if (e.key === 'ArrowRight' && idx < photos.length - 1) setViewer(photos[idx + 1]!)
      if (e.key === 'ArrowLeft'  && idx > 0)                 setViewer(photos[idx - 1]!)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewer, photos])

  function clearFilters() {
    setSearch(''); setFrom(''); setTo(''); setPage(1)
  }

  const hasFilters = !!(search || from || to)
  const emptyMsg   = EMPTY_MESSAGES[queryType ?? 'all'] ?? 'No photos found'

  const viewerIdx  = viewer ? photos.findIndex((p) => p.r2Key === viewer.r2Key) : -1
  const onPrev     = viewerIdx > 0                 ? () => setViewer(photos[viewerIdx - 1]!) : null
  const onNext     = viewerIdx < photos.length - 1 ? () => setViewer(photos[viewerIdx + 1]!) : null

  return (
    <div className="flex flex-col gap-3">

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap items-center shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: colors.textSecondary }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Name, ID no, ref, product…"
            className="pl-7 pr-3 py-1 text-xs rounded border bg-white focus:outline-none w-56 border-rpx-border focus:border-rpx-blue"
          />
        </div>

        <span className="text-xs shrink-0" style={{ color: colors.textSecondary }}>From</span>
        <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(1) }}
          className="border rounded px-2 py-1 text-xs bg-white focus:outline-none border-rpx-border focus:border-rpx-blue"
          style={{ color: from ? colors.textPrimary : colors.textSecondary }}
        />

        <span className="text-xs shrink-0" style={{ color: colors.textSecondary }}>To</span>
        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPage(1) }}
          className="border rounded px-2 py-1 text-xs bg-white focus:outline-none border-rpx-border focus:border-rpx-blue"
          style={{ color: to ? colors.textPrimary : colors.textSecondary }}
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs hover:text-[#212529] transition-colors"
            style={{ color: colors.textSecondary }}
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}

        {total > 0 && (
          <span className="ml-auto text-xs" style={{ color: colors.textSecondary }}>
            {total} file{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-2" style={{ color: colors.textSecondary }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && photos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: colors.textSecondary }}>
          <Images className="w-12 h-12 opacity-20" />
          <p className="text-sm">{emptyMsg}</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs underline" style={{ color: colors.process }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {photos.map((photo, i) => (
            <PhotoCard
              key={`${photo.r2Key}-${i}`}
              photo={photo}
              onClick={() => setViewer(photo)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-1.5 rounded border disabled:opacity-40"
            style={{ borderColor: colors.border }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs" style={{ color: colors.textSecondary }}>
            Page {page} of {pageCount}
          </span>
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
      {viewer && (
        <ViewerDialog
          viewer={viewer}
          photos={photos}
          onClose={() => setViewer(null)}
          onPrev={onPrev}
          onNext={onNext}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PhotosPage() {
  const [activeTab,     setActiveTab]     = useState('all')
  const [exportPhotos,  setExportPhotos]  = useState<PhotoRecord[]>([])

  return (
    <PageShell
      title="Photo Viewer"
      subtitle="Browse purchases, sales, weighbridge images and ID photos"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      action={
        exportPhotos.length > 0 ? (
          <button
            onClick={() => exportCsv(exportPhotos)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border hover:bg-gray-50 transition-colors"
            style={{ borderColor: colors.border, color: colors.textPrimary }}
          >
            <FileDown className="w-3.5 h-3.5" /> Export CSV
          </button>
        ) : undefined
      }
    >
      <PhotoGrid
        queryType={activeTab === 'all' ? undefined : activeTab}
        onPhotosChange={setExportPhotos}
      />
    </PageShell>
  )
}
