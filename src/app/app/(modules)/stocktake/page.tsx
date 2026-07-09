'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from '@/lib/utils/format'
import { colors } from '@/lib/design-tokens'
import { TH, TD, HEADER_GRAD, PortalPage, EmptyHint } from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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

function StatusBadge({ status }: { status: 'open' | 'completed' | 'voided' }) {
  if (status === 'open')
    return <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: colors.actionBg, color: colors.action }}>Open</span>
  if (status === 'voided')
    return <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: colors.dangerBg, color: colors.danger }}>Voided</span>
  return <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: colors.neutralBg, color: colors.textSecondary }}>Completed</span>
}

export default function StocktakePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [creating, setCreating] = useState(false)
  const createFired = useRef(false)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data, isLoading } = useSWR<{ items: StocktakeItem[]; total: number }>(
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

  return (
    <PortalPage title={`Stocktake (${count} on record)`}>
        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#6C757D', fontSize: 12, gap: 8 }}>
              <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <EmptyHint text="No stocktakes yet — create one to start counting" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
                  {['Ref #', 'Status', 'Products Counted', 'Created By', 'Date', 'Completed'].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((s, i) => (
                  <tr
                    key={s.id}
                    style={{ background: i % 2 === 1 ? '#FAFAFA' : '#fff', borderBottom: '1px solid #F0F0F0', height: 30, cursor: 'pointer' }}
                    onClick={() => router.push(`/app/stocktake/${s.id}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF4FB')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 1 ? '#FAFAFA' : '#fff')}
                  >
                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600 }}>{s.refNumber}</td>
                    <td style={TD}><StatusBadge status={s.status} /></td>
                    <td style={TD}>{s._count.entries}</td>
                    <td style={TD}>{s.createdBy.fullName}</td>
                    <td style={{ ...TD, color: '#6C757D', fontSize: 11 }}>{format.datetime(s.createdAt)}</td>
                    <td style={{ ...TD, color: '#6C757D', fontSize: 11 }}>{s.completedAt ? format.datetime(s.completedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
    </PortalPage>
  )
}
