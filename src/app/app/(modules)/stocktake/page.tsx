'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from '@/lib/utils/format'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

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
    return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.actionBg, color: colors.action }}>Open</span>
  return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.neutralBg, color: colors.textSecondary }}>Completed</span>
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
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: colors.textSecondary }}>
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
  const count = data?.total ?? 0
  const subtitle = `${count} stocktake${count !== 1 ? 's' : ''} on record`

  return (
    <PageShell title="Stocktake" subtitle={subtitle}>
      <div className="flex flex-col flex-1 min-h-0 gap-3">

        {/* Actions row */}
        <div className="flex justify-end shrink-0">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: colors.action }}
            onMouseEnter={(e) => !creating && (e.currentTarget.style.background = '#185A38')}
            onMouseLeave={(e) => !creating && (e.currentTarget.style.background = colors.action)}
          >
            {creating
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating…</>
              : <><Plus className="w-3.5 h-3.5" />New Stocktake</>}
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg" style={{ border: `1px solid ${colors.border}` }}>
          {isLoading ? (
            <div className="flex items-center justify-center p-10" style={{ color: colors.textSecondary }}>
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-sm" style={{ color: colors.textSecondary }}>
              No stocktakes yet — create one to start counting
            </div>
          ) : (
            <table className="w-full bg-white">
              <thead style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.border}` }}>
                <tr>
                  {['Ref #', 'Status', 'Products Counted', 'Created By', 'Date', 'Completed'].map((h) => (
                    <th key={h} className="text-left px-4 py-2" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((s, i) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer"
                    style={{ borderBottom: i < items.length - 1 ? `1px solid ${colors.neutralBg}` : 'none' }}
                    onClick={() => router.push(`/app/stocktake/${s.id}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-2.5 font-mono font-medium" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{s.refNumber}</td>
                    <td className="px-4 py-2.5">{statusBadge(s.status)}</td>
                    <td className="px-4 py-2.5" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{s._count.entries}</td>
                    <td className="px-4 py-2.5" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{s.createdBy.fullName}</td>
                    <td className="px-4 py-2.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{format.datetime(s.createdAt)}</td>
                    <td className="px-4 py-2.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{s.completedAt ? format.datetime(s.completedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PageShell>
  )
}
