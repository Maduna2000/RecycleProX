'use client'

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, UserX, UserCheck, Plus, Loader2 } from 'lucide-react'
import { QuickCreateModal } from '@/components/customers/QuickCreateModal'

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; customerType: string; blacklisted: boolean; blacklistReason?: string | null
}

interface Props {
  onSelect: (customer: Customer) => void
  selectedCustomer?: Customer | null
  onClear?: () => void
}

export function CustomerLookupWidget({ onSelect, selectedCustomer, onClear }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [searched, setSearched] = useState(false)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setSearched(false); return }
    setLoading(true)
    const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=5`)
    const data = await res.json()
    setResults(data.customers ?? [])
    setSearched(true)
    setLoading(false)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    search(e.target.value)
  }

  if (selectedCustomer) {
    return (
      <div className={`rounded-lg border p-4 ${selectedCustomer.blacklisted ? 'border-red-300 bg-red-50' : 'border-green-200 bg-green-50'}`}>
        {selectedCustomer.blacklisted && (
          <div className="flex items-center gap-2 mb-3 p-2 bg-red-100 rounded border border-red-200">
            <UserX className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              Blacklisted: {selectedCustomer.blacklistReason ?? 'No reason provided'}
            </p>
          </div>
        )}
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-gray-900">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
            <p className="text-sm text-gray-500">{selectedCustomer.idNumber}</p>
            <p className="text-sm text-gray-500">{selectedCustomer.phone}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={selectedCustomer.customerType === 'account' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}>
              {selectedCustomer.customerType}
            </Badge>
            {onClear && (
              <Button variant="ghost" size="sm" onClick={onClear} className="text-gray-400 hover:text-gray-600">
                ✕
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search by ID number or name..."
          className="pl-9"
          value={query}
          onChange={handleChange}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {searched && results.length === 0 && (
        <div className="mt-2 p-3 border rounded-lg bg-gray-50 text-center">
          <p className="text-sm text-gray-500 mb-2">No customer found</p>
          <Button size="sm" variant="outline" onClick={() => setQuickCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Quick Create
          </Button>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-1 border rounded-lg overflow-hidden shadow-sm">
          {results.map((c) => (
            <div key={c.id} className={`flex items-center justify-between p-3 hover:bg-gray-50 border-b last:border-0 ${c.blacklisted ? 'bg-red-50' : ''}`}>
              <div>
                <p className="text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                <p className="text-xs text-gray-500">{c.idNumber} · {c.phone}</p>
                {c.blacklisted && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <UserX className="w-3 h-3 text-red-500" />
                    <p className="text-xs text-red-600">Blacklisted</p>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant={c.blacklisted ? 'destructive' : 'outline'}
                disabled={c.blacklisted}
                onClick={() => { if (!c.blacklisted) { onSelect(c); setQuery(''); setResults([]) } }}
              >
                {c.blacklisted ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5 mr-1" />}
                {c.blacklisted ? 'Blacklisted' : 'Select'}
              </Button>
            </div>
          ))}
        </div>
      )}

      <QuickCreateModal
        open={quickCreateOpen}
        prefillQuery={query}
        onClose={() => setQuickCreateOpen(false)}
        onSuccess={(customer) => { onSelect(customer); setQuery(''); setResults([]); setQuickCreateOpen(false) }}
      />
    </div>
  )
}
