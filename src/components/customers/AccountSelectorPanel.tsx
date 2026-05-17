'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, UserPlus, Search } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; blacklisted: boolean; priceGroupId?: string | null
  tradeCommodities?: string[] | null; zeroRated?: boolean
  companyName?: string | null; contactPerson?: string | null
}

type AccountCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; accountCode: string | null; blacklisted: boolean
  blacklistReason?: string | null; priceGroupId?: string | null
  tradeCommodities?: string[] | null; zeroRated?: boolean
  companyName?: string | null; contactPerson?: string | null
}

interface Props {
  onSelect: (customer: SelectedCustomer) => void
}

// ─── AccountSelectorPanel ─────────────────────────────────────────────────────

export function AccountSelectorPanel({ onSelect }: Props) {
  const router    = useRouter()
  const pathname  = usePathname()
  const [query,    setQuery]   = useState('')
  const [results,  setResults] = useState<AccountCustomer[]>([])
  const [loading,  setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  async function performSearch(q: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}&type=account&limit=8`)
      if (!res.ok) { setResults([]); return }
      const data = await res.json() as { customers: AccountCustomer[] }
      setResults(data.customers ?? [])
      setSearched(true)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    setSearched(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(() => performSearch(value), 300)
  }

  function handleSelect(c: AccountCustomer) {
    if (c.blacklisted) return
    onSelect({
      id:               c.id,
      firstName:        c.firstName,
      lastName:         c.lastName,
      idNumber:         c.idNumber,
      phone:            c.phone,
      blacklisted:      c.blacklisted,
      priceGroupId:     c.priceGroupId ?? null,
      tradeCommodities: c.tradeCommodities ?? null,
      zeroRated:        c.zeroRated ?? false,
      companyName:      c.companyName ?? null,
      contactPerson:    c.contactPerson ?? null,
    })
  }

  return (
    <div className="space-y-2">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6C757D] pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by name, account code, or phone…"
          className="h-8 text-[12px] pl-8 pr-8"
          aria-label="Search account customers"
          autoFocus
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[#6C757D]" />
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="rounded border border-[#E0E0E0] divide-y divide-[#E0E0E0] max-h-48 overflow-y-auto">
          {results.map((c) => (
            <div
              key={c.id}
              className={`flex items-center justify-between px-3 py-2 ${c.blacklisted ? 'bg-red-50' : 'hover:bg-[#F8F9FA]'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {c.accountCode && (
                    <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">
                      {c.accountCode}
                    </span>
                  )}
                  <p className="text-[12px] font-semibold truncate" style={{ color: '#212529' }}>
                    {c.companyName ?? `${c.firstName} ${c.lastName}`}
                  </p>
                </div>
                {c.companyName && (
                  <p className="text-[11px] mt-0.5" style={{ color: '#374151' }}>
                    {c.contactPerson
                      ? <>Parent: <span style={{ fontWeight: 500 }}>{c.contactPerson}</span></>
                      : <>{c.firstName} {c.lastName}</>}
                  </p>
                )}
                <p className="text-[11px] mt-0.5" style={{ color: '#6C757D' }}>{c.phone}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={c.blacklisted ? 'destructive' : 'outline'}
                disabled={c.blacklisted}
                onClick={() => handleSelect(c)}
                className="h-6 px-2 text-[11px] shrink-0 ml-2"
              >
                {c.blacklisted ? 'Blacklisted' : 'Select'}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {searched && results.length === 0 && query.length >= 2 && (
        <p className="text-[11px] text-center py-1" style={{ color: '#6C757D' }}>
          No accounts found for &ldquo;{query}&rdquo;
        </p>
      )}

      {/* Create new account — navigates to the standalone form; returnTo brings user back here */}
      <div className="flex items-center justify-between pt-0.5">
        <p className="text-[10px]" style={{ color: '#6C757D' }}>
          {query.length < 2 ? 'Type 2+ characters to search' : ''}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => router.push(`/app/customers/new?returnTo=${encodeURIComponent(pathname)}`)}
          className="h-7 px-2 text-[11px] flex items-center gap-1"
        >
          <UserPlus className="w-3.5 h-3.5" /> Create New Account
        </Button>
      </div>
    </div>
  )
}
