'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { WinButton } from '@/components/ui/WinButton'
import { format } from '@/lib/utils/format'
import { colors } from '@/lib/design-tokens'

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

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 10px', height: 28,
  fontSize: 10, fontWeight: 700, color: '#6C757D',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '0 10px', fontSize: 12, color: '#212529' }

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
  const [creating, setCreating] = useState(false)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data, isLoading } = useSWR<{ items: StocktakeItem[]; total: number }>(
    isManager ? '/api/stocktake' : null,
    fetcher
  )

  if (!isManager) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, fontSize: 13, color: colors.textSecondary }}>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1B3A6B' }}>Stocktake</span>
          <span style={{ fontSize: 11, color: '#6C757D' }}>{count} on record</span>
          <div style={{ flex: 1 }} />
          <WinButton onClick={handleCreate} disabled={creating}>
            {creating
              ? <><Loader2 style={{ width: 9, height: 9 }} className="animate-spin" />Creating…</>
              : <><Plus style={{ width: 9, height: 9 }} />New Stocktake</>}
          </WinButton>
        </div>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#6C757D', fontSize: 12, gap: 8 }}>
              <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#6C757D', fontSize: 12 }}>
              No stocktakes yet — create one to start counting
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
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
      </div>
    </div>
  )
}
