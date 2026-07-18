'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, LogOut as LogOutIcon, Loader2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'

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

const PAGE_SIZE = 10

function useDebounce<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export default function CheckOutMode({ onDone }: Props) {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<OnSiteEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const debouncedQuery = useDebounce(query, 300)
  const prevQueryRef = useRef(debouncedQuery)

  const fetchEntries = useCallback(async (search: string, pg: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ onSiteOnly: 'true', pageSize: String(PAGE_SIZE), page: String(pg), ...(search && { search }) })
      const res = await fetch(`/api/gate/entries?${params}`)
      const data = await res.json()
      const fetchedEntries: OnSiteEntry[] = data.entries ?? []
      const fetchedTotal: number = data.total ?? 0
      // This page came back empty but there are entries on an earlier page —
      // e.g. the last entry on the last page just got checked out. Step back
      // a page; the effect below picks up the resulting page change.
      if (fetchedEntries.length === 0 && pg > 1 && fetchedTotal > 0) {
        setPage(pg - 1)
        return
      }
      setEntries(fetchedEntries)
      setTotal(fetchedTotal)
    } catch {
      setEntries([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const changed = prevQueryRef.current !== debouncedQuery
    prevQueryRef.current = debouncedQuery
    if (changed) {
      setPage(1)
      fetchEntries(debouncedQuery, 1)
    } else {
      fetchEntries(debouncedQuery, page)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, page, fetchEntries])

  async function handleCheckout(id: string) {
    setCheckingOut(id)
    setError(null)
    try {
      const res = await fetch(`/api/gate/entries/${id}/checkout`, { method: 'PATCH' })
      if (!res.ok) throw new Error()
      await fetchEntries(debouncedQuery, page)
    } catch {
      setError('Failed to check out — please try again.')
    } finally {
      setCheckingOut(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex-1 flex flex-col p-5 sm:p-8 max-w-lg sm:max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <LogOutIcon className="w-5 h-5 text-slate-700" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Check Out</h2>
      </div>
      <p className="text-slate-500 mb-4 sm:mb-5">Find a vehicle or visitor currently on site</p>

      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border border-slate-300 rounded-xl pl-11 pr-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
          placeholder="Name, ID number or vehicle reg…"
          autoFocus
        />
        {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" />}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 mb-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 overflow-y-auto sm:grid sm:grid-cols-2 sm:gap-3 sm:items-start">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between bg-white rounded-xl shadow-sm p-4 gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-slate-800 truncate">{e.visitorFirstName} {e.visitorLastName}</div>
              <div className="text-slate-500 text-sm truncate">{e.entryNumber}{e.vehicleReg ? ` · ${e.vehicleReg}` : ''}</div>
            </div>
            <button
              onClick={() => handleCheckout(e.id)}
              disabled={checkingOut === e.id}
              className="flex items-center gap-1.5 bg-[#0F203A] hover:bg-[#16305A] active:bg-[#0A1830] disabled:opacity-50 text-white text-sm font-medium px-4 min-h-[44px] rounded-lg transition-colors shrink-0"
            >
              {checkingOut === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOutIcon className="w-4 h-4" />}
              Check Out
            </button>
          </div>
        ))}
        {!loading && entries.length === 0 && (
          <p className="text-center text-slate-400 py-8 sm:col-span-2">
            {query.trim() ? 'No matching entries on site' : 'No one currently on site'}
          </p>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 shrink-0">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium min-h-[44px] px-3 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <span className="text-slate-500 text-sm tabular-nums">
            Page {page} of {totalPages} · {total} on site
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium min-h-[44px] px-3 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <button
        onClick={onDone}
        className="mt-2 text-slate-500 hover:text-slate-700 text-sm font-medium self-center min-h-[44px] px-4 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors flex items-center gap-1"
      >
        <ChevronLeft className="w-4 h-4" /> Back to New Entry
      </button>
    </div>
  )
}
