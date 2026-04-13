'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from '@/lib/utils/format'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type StocktakeItem = {
  id: string
  refNumber: string
  status: 'open' | 'completed'
  notes: string | null
  completedAt: string | null
  createdAt: string
  createdBy: { fullName: string }
  _count: { entries: number }
}

function statusBadge(status: 'open' | 'completed') {
  if (status === 'open')
    return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F0FBF4', color: '#217346' }}>Open</span>
  return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F1F3F4', color: '#6C757D' }}>Completed</span>
}

export default function StocktakePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data, isLoading } = useSWR<{ items: StocktakeItem[]; total: number }>(
    isManager ? '/api/stocktake' : null,
    fetcher
  )

  if (!isManager) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: '#6C757D' }}>
        Access restricted to managers and administrators.
      </div>
    )
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch('/api/stocktake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Failed') }
      const stocktake = await res.json()
      mutate('/api/stocktake')
      router.push(`/app/stocktake/${stocktake.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create stocktake')
      setCreating(false)
    }
  }

  const items = data?.items ?? []

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Page header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Stocktake</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>Periodic stock count and variance analysis</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium text-white transition-colors disabled:opacity-50"
          style={{ background: '#217346' }}
          onMouseEnter={(e) => !creating && (e.currentTarget.style.background = '#185A38')}
          onMouseLeave={(e) => !creating && (e.currentTarget.style.background = '#217346')}
        >
          {creating
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating…</>
            : <><Plus className="w-3.5 h-3.5" />New Stocktake</>}
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg" style={{ border: '1px solid #E0E0E0' }}>
        {isLoading ? (
          <div className="flex items-center justify-center p-10" style={{ color: '#6C757D' }}>
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: '#6C757D' }}>
            No stocktakes yet — create one to start counting
          </div>
        ) : (
          <table className="w-full bg-white">
            <thead style={{ background: '#F8F9FA', borderBottom: '1px solid #E0E0E0' }}>
              <tr>
                {['Ref #', 'Status', 'Products Counted', 'Created By', 'Date', 'Completed'].map((h) => (
                  <th key={h} className="text-left px-4 py-2" style={{ fontSize: 10, fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => (
                <tr
                  key={s.id}
                  className="cursor-pointer"
                  style={{ borderBottom: i < items.length - 1 ? '1px solid #F1F3F4' : 'none' }}
                  onClick={() => router.push(`/app/stocktake/${s.id}`)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F8F9FA')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-2.5 font-mono font-medium" style={{ fontSize: 12, color: '#212529' }}>{s.refNumber}</td>
                  <td className="px-4 py-2.5">{statusBadge(s.status)}</td>
                  <td className="px-4 py-2.5" style={{ fontSize: 12, color: '#212529' }}>{s._count.entries}</td>
                  <td className="px-4 py-2.5" style={{ fontSize: 12, color: '#212529' }}>{s.createdBy.fullName}</td>
                  <td className="px-4 py-2.5" style={{ fontSize: 11, color: '#6C757D' }}>{format.datetime(s.createdAt)}</td>
                  <td className="px-4 py-2.5" style={{ fontSize: 11, color: '#6C757D' }}>{s.completedAt ? format.datetime(s.completedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
