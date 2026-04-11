'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Download, Images, X, ChevronLeft, ChevronRight, Loader2, FileText, IdCard } from 'lucide-react'
import type { PhotoRecord } from '@/app/api/photos/search/route'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type PhotosResponse = {
  photos: PhotoRecord[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const TYPE_LABELS: Record<string, string> = {
  purchase_signature: 'Signature',
  purchase_vat264:    'VAT264',
  casual_id:          'ID Photo',
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  purchase_signature: FileText,
  purchase_vat264:    FileText,
  casual_id:          IdCard,
}

function PhotoCard({
  photo,
  onClick,
}: {
  photo: PhotoRecord
  onClick: () => void
}) {
  const isPdf = photo.r2Key.endsWith('.pdf')
  const Icon  = TYPE_ICONS[photo.type] ?? Images

  return (
    <div className="group relative bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      {/* Thumbnail */}
      <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
        {isPdf ? (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <FileText className="w-12 h-12 opacity-50" />
            <span className="text-xs">PDF Document</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.viewUrl}
            alt="Photo"
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
      </div>

      {/* Info strip */}
      <div className="p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
            {TYPE_LABELS[photo.type] ?? photo.type}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(photo.createdAt).toLocaleDateString('en-ZA')}
          </span>
        </div>
        {photo.customer && (
          <p className="text-xs font-medium text-gray-800 mt-1 truncate">
            {photo.customer.firstName} {photo.customer.lastName}
          </p>
        )}
        {photo.refNumber && (
          <p className="text-xs font-mono text-gray-400 truncate">{photo.refNumber}</p>
        )}
      </div>
    </div>
  )
}

function PhotoGrid({
  queryType,
}: {
  queryType?: string
}) {
  const [search, setSearch]   = useState('')
  const [from,   setFrom]     = useState('')
  const [to,     setTo]       = useState('')
  const [page,   setPage]     = useState(1)
  const [viewer, setViewer]   = useState<PhotoRecord | null>(null)

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

  const photos     = data?.photos     ?? []
  const pageCount  = data?.pageCount  ?? 1
  const total      = data?.total      ?? 0

  function handleDownload(photo: PhotoRecord) {
    const a   = document.createElement('a')
    a.href    = photo.viewUrl
    a.download = photo.r2Key.split('/').pop() ?? 'photo'
    a.target   = '_blank'
    a.click()
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search customer name, ID or ref…"
            className="pl-8"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <Input
          type="date"
          className="w-36"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(1) }}
        />
        <Input
          type="date"
          className="w-36"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPage(1) }}
        />
        {(search || from || to) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFrom(''); setTo(''); setPage(1) }}>
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
        {total > 0 && (
          <span className="text-sm text-gray-500 ml-auto">{total} photo{total !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Grid */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      )}

      {!isLoading && photos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <Images className="w-12 h-12 opacity-30" />
          <p className="text-sm">No photos found</p>
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-gray-500">Page {page} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Full-screen viewer dialog */}
      {viewer && (
        <Dialog open onOpenChange={() => setViewer(null)}>
          <DialogContent className="max-w-3xl p-0 overflow-hidden">
            <div className="flex flex-col">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
                <div>
                  <p className="font-semibold text-gray-900">
                    {viewer.customer ? `${viewer.customer.firstName} ${viewer.customer.lastName}` : 'Photo'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {TYPE_LABELS[viewer.type]} · {viewer.refNumber ?? viewer.transactionId}
                    {' · '}{new Date(viewer.createdAt).toLocaleDateString('en-ZA')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleDownload(viewer)}>
                    <Download className="w-4 h-4 mr-1.5" /> Download
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setViewer(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Image / PDF */}
              <div className="flex items-center justify-center bg-gray-100 min-h-[400px]">
                {viewer.r2Key.endsWith('.pdf') ? (
                  <div className="flex flex-col items-center gap-4 py-12 text-gray-500">
                    <FileText className="w-16 h-16 opacity-40" />
                    <p className="text-sm">PDF document — use Download to view</p>
                    <Button onClick={() => handleDownload(viewer)}>
                      <Download className="w-4 h-4 mr-2" /> Download PDF
                    </Button>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={viewer.viewUrl}
                    alt="Full photo"
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export default function PhotosPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Photo Viewer</h1>
        <p className="text-sm text-gray-500 mt-0.5">Browse and search all transaction and ID photos</p>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Photos</TabsTrigger>
          <TabsTrigger value="purchase">Transactions</TabsTrigger>
          <TabsTrigger value="casual">ID Photos</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <PhotoGrid />
        </TabsContent>
        <TabsContent value="purchase" className="mt-4">
          <PhotoGrid queryType="purchase" />
        </TabsContent>
        <TabsContent value="casual" className="mt-4">
          <PhotoGrid queryType="casual" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
