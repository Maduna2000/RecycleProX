'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, Plus, Loader2 } from 'lucide-react'
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
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-green-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stocktake</h1>
            <p className="text-sm text-gray-500 mt-0.5">Periodic stock count and variance analysis</p>
          </div>
        </div>
        <Button onClick={handleCreate} disabled={creating} className="bg-green-600 hover:bg-green-700">
          {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : <><Plus className="w-4 h-4 mr-2" />New Stocktake</>}
        </Button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No stocktakes yet — create one to start counting</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Ref #', 'Status', 'Products Counted', 'Created By', 'Date', 'Completed'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/app/stocktake/${s.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-gray-900">{s.refNumber}</td>
                  <td className="px-4 py-3">
                    {s.status === 'open'
                      ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Open</Badge>
                      : <Badge variant="secondary">Completed</Badge>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{s._count.entries}</td>
                  <td className="px-4 py-3 text-gray-700">{s.createdBy.fullName}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{format.datetime(s.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.completedAt ? format.datetime(s.completedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
