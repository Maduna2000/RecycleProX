'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, LogOut as LogOutIcon, Loader2 } from 'lucide-react'

interface OnSiteEntry {
  id:               string
  entryNumber:      string
  purpose:          string
  vehicleReg:       string | null
  visitorFirstName: string
  visitorLastName:  string
  createdAt:        string
}

interface Props {
  onDone: () => void
}

export default function CheckOutMode({ onDone }: Props) {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<OnSiteEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)

  const fetchEntries = useCallback(async (search: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ onSiteOnly: 'true', pageSize: '50', ...(search && { search }) })
      const res = await fetch(`/api/gate/entries?${params}`)
      const data = await res.json()
      setEntries(data.entries ?? [])
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchEntries(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query, fetchEntries])

  async function handleCheckout(id: string) {
    setCheckingOut(id)
    try {
      const res = await fetch(`/api/gate/entries/${id}/checkout`, { method: 'PATCH' })
      if (!res.ok) throw new Error()
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch {
      // Leave it in the list so the guard can retry.
    } finally {
      setCheckingOut(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col p-5 max-w-lg mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Check Out</h2>
      <p className="text-slate-500 mb-4">Find a vehicle or visitor currently on site</p>

      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border border-slate-300 rounded-xl pl-11 pr-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Name, ID number or vehicle reg…"
          autoFocus
        />
        {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" />}
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between bg-white rounded-xl shadow-sm p-4">
            <div>
              <div className="font-semibold text-slate-800">{e.visitorFirstName} {e.visitorLastName}</div>
              <div className="text-slate-500 text-sm">{e.entryNumber}{e.vehicleReg ? ` · ${e.vehicleReg}` : ''}</div>
            </div>
            <button
              onClick={() => handleCheckout(e.id)}
              disabled={checkingOut === e.id}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
            >
              {checkingOut === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOutIcon className="w-4 h-4" />}
              Check Out
            </button>
          </div>
        ))}
        {!loading && entries.length === 0 && (
          <p className="text-center text-slate-400 py-8">
            {query.trim() ? 'No matching entries on site' : 'No one currently on site'}
          </p>
        )}
      </div>

      <button onClick={onDone} className="mt-4 text-slate-500 text-sm self-center">
        ← Back to New Entry
      </button>
    </div>
  )
}
