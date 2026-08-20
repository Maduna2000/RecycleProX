'use client'

import { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { Dialog } from '@/components/ui/dialog'
import { fetcher } from '@/lib/swrFetcher'
import {
  Search, Download, Images, X, ChevronLeft, ChevronRight,
  Loader2, FileText, IdCard, Scale, ShoppingCart, Receipt,
} from 'lucide-react'
import { colors, fontSize } from '@/lib/design-tokens'
import type { PhotoRecord } from '@/app/api/photos/search/route'
import { inp, Btn, Field, PortalPage, FilterBar, RpxDialogContent, RpxDialogFooter, BAR_GRAD, winBevel } from '@/components/rpx'


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
  purchase_photo:     { label: 'Stock Photo',  color: colors.netWeightText, bg: colors.netWeightBg, icon: ShoppingCart },
  sale_photo:         { label: 'Sale Photo',   color: colors.violet,   bg: colors.violetBg,  icon: ShoppingCart },
  weighbridge:        { label: 'Scale Photo',  color: colors.warning,  bg: colors.warningBg, icon: Scale       },
  casual_id:          { label: 'ID Photo',     color: colors.process,  bg: colors.processBg, icon: IdCard      },
}

const TABS = [
  { value: 'casual',       label: 'ID Photos',   icon: IdCard      },
  { value: 'all',          label: 'All',         icon: Images      },
  { value: 'purchase',     label: 'Purchases',   icon: ShoppingCart },
  { value: 'sale',         label: 'Sales',       icon: Receipt     },
  { value: 'weighbridge',  label: 'Weighbridge', icon: Scale       },
] as const

const EMPTY_MESSAGES: Record<string, string> = {
  all:          'No photos or documents found',
  purchase:     'No purchase product photos or signatures',
  sale:         'No sale photos',
  weighbridge:  'No weighbridge photos',
  casual:       'No ID photos',
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({ photo, onClick }: { photo: PhotoRecord; onClick: () => void }) {
  const isPdf = photo.r2Key.toLowerCase().includes('.pdf')
  const meta  = TYPE_META[photo.type]
  const Icon  = meta?.icon ?? Images

  return (
    <div
      className="group bg-white overflow-hidden cursor-pointer transition-colors hover:bg-[#F5F5F5]"
      style={{ border: `1px solid ${colors.border}`, borderRadius: 2 }}
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
  const isPdf = viewer.r2Key.toLowerCase().includes('.pdf')
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
    if (viewer.type === 'purchase_signature') {
      window.open(`/api/purchases/${viewer.transactionId}/receipt`, '_blank')
    } else if (viewer.type === 'sale_photo') {
      window.open(`/api/sales/${viewer.transactionId}/receipt`, '_blank')
    }
  }

  const customerName = viewer.customer
    ? `${viewer.customer.firstName} ${viewer.customer.lastName}`.trim()
    : null

  return (
    <Dialog open onOpenChange={onClose}>
      <RpxDialogContent maxWidth={768} style={{ maxHeight: '90vh' }}>
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
          <RpxDialogFooter style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            {/* Prev / Next navigation */}
            <div className="flex items-center gap-1 mr-2">
              <Btn size="sm" icon={ChevronLeft} disabled={!onPrev} onClick={onPrev ?? undefined} title="Previous (←)" />
              <span className="text-xs tabular-nums" style={{ color: colors.textSecondary }}>
                {idx + 1} / {photos.length}
              </span>
              <Btn size="sm" icon={ChevronRight} disabled={!onNext} onClick={onNext ?? undefined} title="Next (→)" />
            </div>

            <Btn size="sm" icon={Download} onClick={download}>Download</Btn>

            {(viewer.type === 'purchase_signature' || viewer.type === 'sale_photo') && (
              <Btn size="sm" icon={Receipt} onClick={openReceiptPdf}>Reprint Receipt</Btn>
            )}
          </RpxDialogFooter>
        </div>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Photo grid ───────────────────────────────────────────────────────────────

function PhotoGrid({
  queryType,
  onQueryTypeChange,
}: {
  queryType?: string
  onQueryTypeChange: (value: typeof TABS[number]['value']) => void
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

  const { data, isLoading, error } = useSWR<PhotosResponse>(
    `/api/photos/search?${query}`,
    fetcher,
    { keepPreviousData: true }
  )

  const photos    = useMemo(() => data?.photos ?? [], [data])
  const pageCount = data?.pageCount ?? 1
  const total     = data?.total     ?? 0

  // Photos from the same transaction as the one currently open — prev/next
  // steps through the other photos on that purchase/sale/etc, not the whole
  // (unrelated) filtered grid.
  const relatedPhotos = useMemo(
    () => (viewer ? photos.filter((p) => p.transactionId === viewer.transactionId) : []),
    [viewer, photos]
  )

  // Keyboard navigation in viewer
  useEffect(() => {
    if (!viewer) return
    function onKey(e: KeyboardEvent) {
      const idx = relatedPhotos.findIndex((p) => p.r2Key === viewer!.r2Key)
      if (e.key === 'ArrowRight' && idx < relatedPhotos.length - 1) setViewer(relatedPhotos[idx + 1]!)
      if (e.key === 'ArrowLeft'  && idx > 0)                        setViewer(relatedPhotos[idx - 1]!)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewer, relatedPhotos])

  function clearFilters() {
    setSearch(''); setFrom(''); setTo(''); setPage(1)
  }

  const hasFilters = !!(search || from || to)
  const emptyMsg   = EMPTY_MESSAGES[queryType ?? 'all'] ?? 'No photos found'

  const viewerIdx  = viewer ? relatedPhotos.findIndex((p) => p.r2Key === viewer.r2Key) : -1
  const onPrev     = viewerIdx > 0                        ? () => setViewer(relatedPhotos[viewerIdx - 1]!) : null
  const onNext     = viewerIdx < relatedPhotos.length - 1 ? () => setViewer(relatedPhotos[viewerIdx + 1]!) : null

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Filter bar — fixed above the scroll area, never moves when the
          grid below is scrolled (outer sizes / inner scrolls pattern). */}
      <div style={{ padding: '10px 10px 0' }}>
        <FilterBar>
          <Field label="Search" width={220}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: colors.textSecondary }} />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Name, ID no, ref, product…"
                style={{ ...inp, paddingLeft: 24 }}
              />
            </div>
          </Field>
          <Field label="Type" width={160}>
            <select
              style={inp}
              value={queryType ?? 'all'}
              onChange={(e) => { onQueryTypeChange(e.target.value as typeof TABS[number]['value']); setPage(1) }}
            >
              {TABS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="From" width={145}>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} style={inp} />
          </Field>
          <Field label="To" width={145}>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} style={inp} />
          </Field>
          {hasFilters && (
            <Btn size="sm" icon={X} onClick={clearFilters}>Clear</Btn>
          )}
          {total > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.textSecondary, paddingBottom: 8 }}>
              {total} file{total !== 1 ? 's' : ''}
            </span>
          )}
        </FilterBar>
      </div>

      <div className="flex-1 min-h-0 flex flex-col" style={{ padding: 10 }}>
      <div
        className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 bg-white"
        style={{
          padding: 10, borderRadius: 0,
          ...winBevel(true),
          // Same fix as DataTable's own well — winBevel(true)'s "light"
          // right/bottom edges are pure white and invisible against this
          // white background, so this grid (unlike table pages) had no
          // visible frame on any side at all.
          borderRight: '1px solid #B0B0B0',
          borderBottom: '1px solid #B0B0B0',
        }}
      >

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-2" style={{ color: colors.textSecondary }}>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: colors.danger }}>
            <p className="text-sm">Failed to load photos. Please try again.</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && photos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: colors.textSecondary }}>
            <Images className="w-12 h-12 opacity-20" />
            <p className="text-sm">{emptyMsg}</p>
            {hasFilters && (
              <Btn size="sm" onClick={clearFilters}>Clear filters</Btn>
            )}
          </div>
        )}

        {/* Grid */}
        {!error && photos.length > 0 && (
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
            <Btn size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} />
            <span className="text-xs" style={{ color: colors.textSecondary }}>
              Page {page} of {pageCount}
            </span>
            <Btn size="sm" icon={ChevronRight} disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} />
          </div>
        )}
      </div>

      {/* Decorative footer scroller — same track + floating thumb look
          used on every DataTable page, present whether or not the grid
          above actually overflows or has pagination showing. */}
      <div
        className="shrink-0 relative"
        style={{ height: 14, marginTop: 6, borderRadius: 2, background: '#F0F0F0', border: '1px solid #D4D4D4' }}
      >
        <div
          className="absolute"
          style={{ top: 1, left: 1, bottom: 1, width: '35%', minWidth: 60, borderRadius: 2, background: BAR_GRAD, border: '1px solid #B0B0B0' }}
        />
      </div>
      </div>

      {/* Viewer */}
      {viewer && (
        <ViewerDialog
          viewer={viewer}
          photos={relatedPhotos}
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
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['value']>('purchase')

  return (
    <PortalPage>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <PhotoGrid
          queryType={activeTab === 'all' ? undefined : activeTab}
          onQueryTypeChange={setActiveTab}
        />
      </div>
    </PortalPage>
  )
}
