'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, UserPlus, Users, ArrowRight, Loader2, AlertCircle } from 'lucide-react'

const CasualSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName:  z.string().min(1, 'Required'),
  phone:     z.string().regex(/^[72]\d{7}$/, 'Must be 8 digits, starting with 7 (mobile) or 2 (landline)'),
  idNumber:  z.string().optional().refine(v => !v || /^\d{13}$/.test(v), 'Must be exactly 13 digits'),
  address:   z.string().optional(),
})

type CasualForm = z.infer<typeof CasualSchema>

export interface SelectedCustomer {
  id:        string | null  // null = walk-in (no Customer row created)
  firstName: string
  lastName:  string
  phone:     string
  idNumber?: string
  isNew?:    boolean
}

interface Props {
  onSelect: (customer: SelectedCustomer) => void
}

export default function Step1Customer({ onSelect }: Props) {
  const [mode, setMode] = useState<'choose' | 'casual' | 'account'>('choose')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SelectedCustomer[]>([])
  const [searching, setSearching]     = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const form = useForm<CasualForm>({ resolver: zodResolver(CasualSchema) })

  async function runSearch(query: string) {
    setSearching(true)
    setSearchError(null)
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(query)}&type=account&limit=20`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Server error (${res.status})`)
      }
      const data = await res.json()
      const list: SelectedCustomer[] = (data.customers ?? []).map((c: Record<string, string>) => ({
        id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone,
      }))
      setSearchResults(list)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  // Only search when the user has typed at least 2 characters
  useEffect(() => {
    if (mode !== 'account') return
    if (searchQuery.trim().length < 2) { setSearchResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(searchQuery.trim()), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, searchQuery])

  function handleCasualSubmit(data: CasualForm) {
    onSelect({ id: null, firstName: data.firstName, lastName: data.lastName, phone: data.phone, idNumber: data.idNumber || undefined, isNew: true })
  }

  // ── Mode: choose ──────────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
        <h2 className="text-2xl font-bold text-slate-800 text-center">Customer Type</h2>
        <p className="text-slate-500 text-center">Select how to identify this customer</p>

        <div className="w-full max-w-sm flex flex-col gap-4 mt-2">
          <button
            onClick={() => setMode('casual')}
            className="flex items-center gap-4 bg-white rounded-2xl shadow-md p-5 border-2 border-transparent hover:border-emerald-500 active:scale-95 transition-all text-left"
          >
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-lg">Walk-in / Casual</div>
              <div className="text-slate-500 text-sm">Enter name and contact details</div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 ml-auto" />
          </button>

          <button
            onClick={() => setMode('account')}
            className="flex items-center gap-4 bg-white rounded-2xl shadow-md p-5 border-2 border-transparent hover:border-emerald-500 active:scale-95 transition-all text-left"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-lg">Account Customer</div>
              <div className="text-slate-500 text-sm">Search by ID number or phone</div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 ml-auto" />
          </button>
        </div>
      </div>
    )
  }

  // ── Mode: casual form ─────────────────────────────────────────────────────
  if (mode === 'casual') {
    return (
      <div className="flex-1 flex flex-col p-5 max-w-lg mx-auto w-full">
        <button onClick={() => setMode('choose')} className="flex items-center gap-1 text-slate-500 text-sm mb-4 self-start min-h-[44px] px-2 -ml-2 rounded-lg hover:text-slate-800 hover:bg-slate-100 transition-colors">← Back</button>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Customer Details</h2>
        <p className="text-slate-500 mb-6">Enter the walk-in customer&apos;s information</p>

        <form onSubmit={form.handleSubmit(handleCasualSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">First Name *</label>
              <input
                {...form.register('firstName')}
                autoComplete="given-name"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="John"
              />
              {form.formState.errors.firstName && (
                <p className="text-red-500 text-xs mt-1">{form.formState.errors.firstName.message}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Last Name *</label>
              <input
                {...form.register('lastName')}
                autoComplete="family-name"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Smith"
              />
              {form.formState.errors.lastName && (
                <p className="text-red-500 text-xs mt-1">{form.formState.errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Phone Number *</label>
            <input
              {...form.register('phone')}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="76123456"
            />
            {form.formState.errors.phone && (
              <p className="text-red-500 text-xs mt-1">{form.formState.errors.phone.message}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">National ID / Passport</label>
            <input
              {...form.register('idNumber')}
              autoComplete="off"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="13-digit national ID (optional)"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Address</label>
            <input
              {...form.register('address')}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Optional"
            />
          </div>

          <button
            type="submit"
            className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold h-14 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            Continue →
          </button>
        </form>
      </div>
    )
  }

  // ── Mode: account search ──────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col p-5 max-w-lg mx-auto w-full">
      <button onClick={() => setMode('choose')} className="flex items-center gap-1 text-slate-500 text-sm mb-4 self-start min-h-[44px] px-2 -ml-2 rounded-lg hover:text-slate-800 hover:bg-slate-100 transition-colors">← Back</button>
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Account Customer</h2>
      <p className="text-slate-500 mb-6">Search by name, ID number or account code</p>

      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full border border-slate-300 rounded-xl pl-11 pr-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Name, ID number or account code…"
          autoFocus
        />
        {searching && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" />
        )}
      </div>

      {searchError && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 mb-4 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {searchError}
        </div>
      )}

      <div className="flex flex-col gap-3 overflow-y-auto">
        {searchResults.map(c => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="flex items-center justify-between bg-white rounded-xl shadow-sm p-4 border-2 border-transparent hover:border-emerald-500 active:scale-95 transition-all text-left"
          >
            <div>
              <div className="font-semibold text-slate-800">{c.firstName} {c.lastName}</div>
              <div className="text-slate-500 text-sm">{c.phone}</div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400" />
          </button>
        ))}
        {!searching && !searchError && searchResults.length === 0 && (
          <p className="text-center text-slate-400 py-8">
            {searchQuery.trim().length >= 2 ? 'No account customers found' : 'Type at least 2 characters to search'}
          </p>
        )}
      </div>
    </div>
  )
}
