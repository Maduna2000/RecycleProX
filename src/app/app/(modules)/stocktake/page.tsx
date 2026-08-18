'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { format } from '@/lib/utils/format'
import { colors } from '@/lib/design-tokens'
import { PortalPage } from '@/components/rpx'
import { DataTable, StatusBadge, type Column } from '@/components/ui/DataTable'
import { fetcher } from '@/lib/swrFetcher'


type StocktakeItem = {
  id: string
  refNumber: string
  status: 'open' | 'completed' | 'voided'
  notes: string | null
  completedAt: string | null
  createdAt: string
  createdBy: { fullName: string }
  _count: { entries: number }
}

export default function StocktakePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const createFired = useRef(false)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data, isLoading, error } = useSWR<{ items: StocktakeItem[]; total: number }>(
    isManager ? '/api/stocktake' : null,
    fetcher
  )

  // Toolbar "Start Stocktake" deep-link (?create=1)
  useEffect(() => {
    if (searchParams.get('create') === '1' && isManager && !createFired.current) {
      createFired.current = true
      router.replace('/app/stocktake', { scroll: false })
      void handleCreate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isManager, router])

  if (!isManager) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, fontSize: 13, color: colors.textSecondary }}>
        Access restricted to managers and administrators.
      </div>
    )
  }

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    const toastId = toast.loading('Starting stocktake…')
    try {
      const res = await fetch('/api/stocktake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Failed') }
      const stocktake = await res.json()
      mutate('/api/stocktake')
      toast.dismiss(toastId)
      router.push(`/app/stocktake/${stocktake.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create stocktake', { id: toastId })
      setCreating(false)
      createFired.current = false
    }
  }

  const items = data?.items ?? []
  const count = data?.total ?? 0

  // Client-side pagination — same pattern as Products/Price Groups/Users,
  // and the only thing DataTable needs to render its "Showing X–Y of Z"
  // footer bar, which this page was previously missing entirely.
  const PAGE_SIZE  = 30
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pagedItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const columns: Column<StocktakeItem>[] = [
    {
      key: 'refNumber', header: 'Ref #',
      render: (s) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: colors.textPrimary }}>{s.refNumber}</span>,
    },
    {
      key: 'status', header: 'Status', width: '110px',
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'count', header: 'Products Counted',
      render: (s) => s._count.entries,
    },
    {
      key: 'createdBy', header: 'Created By',
      render: (s) => s.createdBy.fullName,
    },
    {
      key: 'createdAt', header: 'Date',
      render: (s) => <span style={{ color: '#6C757D', fontSize: 11 }}>{format.datetime(s.createdAt)}</span>,
    },
    {
      key: 'completedAt', header: 'Completed',
      render: (s) => <span style={{ color: '#6C757D', fontSize: 11 }}>{s.completedAt ? format.datetime(s.completedAt) : '—'}</span>,
    },
  ]

  return (
    <PortalPage title={`Stocktake (${count} on record)`}>
      <div style={{ flex: 1, minHeight: 0, padding: 10 }}>
        <DataTable
          columns={columns}
          rows={pagedItems}
          rowKey={(s) => s.id}
          onRowClick={(s) => router.push(`/app/stocktake/${s.id}`)}
          loading={isLoading}
          error={error}
          emptyMessage="No stocktakes yet — create one to start counting"
          total={items.length}
          page={safePage}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </PortalPage>
  )
}
