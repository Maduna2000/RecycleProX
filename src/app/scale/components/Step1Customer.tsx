'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, UserPlus, Users, ArrowRight, Loader2 } from 'lucide-react'

const CasualSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName:  z.string().min(1, 'Required'),
  phone:     z.string().min(7, 'Enter a valid phone number'),
  address:   z.string().optional(),
})

type CasualForm = z.infer<typeof CasualSchema>

export interface SelectedCustomer {
  id:        string
  firstName: string
  lastName:  string
  phone:     string
  isNew?:    boolean
}

interface Props {
  onSelect: (customer: SelectedCustomer) => void
}

export default function Step1Customer({ onSelect }: Props) {
  const [mode, setMode] = useState<'choose' | 'casual' | 'account'>('choose')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SelectedCustomer[]>([])
  const [searching, setSearching]   = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<CasualForm>({ resolver: zodResolver(CasualSchema) })

  async function handleCasualSubmit(data: CasualForm) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/customers/quick-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName:       data.firstName,
          lastName:        data.lastName,
          phone:           data.phone,
          physicalAddress: data.address,
          customerType:    'casual',
          primaryFunction: 'supplier',
        }),
      })
      if (!res.ok) throw new Error('Failed to create customer')
      const customer = await res.json()
      onSelect({ id: customer.id, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, isNew: true })
    } catch {
      form.setError('root', { message: 'Failed to save customer. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSearch() {
    if (searchQuery.trim().length < 2) return
    setSearching(true)
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(searchQuery)}&pageSize=10`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSearchResults((data.customers ?? data).map((c: SelectedCustomer & { id: string }) => ({
        id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone,
      })))
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
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
        <button onClick={() => setMode('choose')} className="text-slate-500 text-sm mb-4 self-start">← Back</button>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Customer Details</h2>
        <p className="text-slate-500 mb-6">Enter the walk-in customer's information</p>

        <form onSubmit={form.handleSubmit(handleCasualSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">First Name *</label>
              <input
                {...form.register('firstName')}
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
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="+27 82 123 4567"
            />
            {form.formState.errors.phone && (
              <p className="text-red-500 text-xs mt-1">{form.formState.errors.phone.message}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Address</label>
            <input
              {...form.register('address')}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Optional"
            />
          </div>

          {form.formState.errors.root && (
            <p className="text-red-500 text-sm bg-red-50 rounded-xl p-3">{form.formState.errors.root.message}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-lg font-semibold h-14 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {submitting ? 'Saving...' : 'Continue →'}
          </button>
        </form>
      </div>
    )
  }

  // ── Mode: account search ──────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col p-5 max-w-lg mx-auto w-full">
      <button onClick={() => setMode('choose')} className="text-slate-500 text-sm mb-4 self-start">← Back</button>
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Account Customer</h2>
      <p className="text-slate-500 mb-6">Search by ID number, name, or phone</p>

      <div className="flex gap-2 mb-4">
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="flex-1 border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Name, ID number or phone..."
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="bg-emerald-600 text-white px-4 rounded-xl flex items-center justify-center"
        >
          {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
        </button>
      </div>

      <div className="flex flex-col gap-3">
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
        {searchResults.length === 0 && searchQuery && !searching && (
          <p className="text-center text-slate-400 py-8">No customers found</p>
        )}
      </div>
    </div>
  )
}
