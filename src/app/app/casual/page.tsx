'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2, UserCheck } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; isActive: boolean; blacklisted: boolean; createdAt: string
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function CasualDetailsPage() {
  const router = useRouter()
  const [search, setSearch]   = useState('')
  const [letter, setLetter]   = useState<string | null>(null)

  const params = new URLSearchParams({ type: 'casual', limit: '200' })
  if (search) params.set('search', search)
  const { data, isLoading } = useSWR<{ customers: Customer[]; total: number }>(
    `/api/customers?${params}`,
    fetcher,
  )

  const customers = (data?.customers ?? []).filter((c) =>
    letter ? c.lastName.toUpperCase().startsWith(letter) : true,
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
          <UserCheck className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Casual Details</h1>
          <p className="text-sm text-gray-500">
            {data?.total ?? 0} casual seller{(data?.total ?? 0) !== 1 ? 's' : ''} on record
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setLetter(null) }}
          placeholder="Search by name or ID number..."
          className="pl-9"
        />
      </div>

      {/* A–Z quick filter */}
      <div className="flex flex-wrap gap-1 mb-4">
        <button
          onClick={() => setLetter(null)}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
            letter === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {ALPHA.map((l) => (
          <button
            key={l}
            onClick={() => { setLetter(l === letter ? null : l); setSearch('') }}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              letter === l ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-10 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        ) : !customers.length ? (
          <div className="text-center p-10 text-gray-400">
            {letter ? `No casual customers with surname starting with "${letter}"` : 'No casual customers found'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Name', 'ID Number', 'Phone', 'Registered', 'Status'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/app/customers/${c.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {c.lastName}, {c.firstName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{c.idNumber}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString('en-ZA')}
                  </td>
                  <td className="px-4 py-3">
                    {c.blacklisted ? (
                      <Badge variant="destructive">Blacklisted</Badge>
                    ) : c.isActive ? (
                      <Badge className="bg-green-100 text-green-700">Active</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-500">Inactive</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
