'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, AlertTriangle } from 'lucide-react'
import { CreateCustomerModal } from '@/components/customers/CreateCustomerModal'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; customerType: string; isActive: boolean; blacklisted: boolean
}

export default function CustomersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showBlacklisted, setShowBlacklisted] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const query = new URLSearchParams({
    ...(search && { search }),
    ...(typeFilter && { type: typeFilter }),
    ...(showBlacklisted && { blacklisted: showBlacklisted }),
  })

  const { data } = useSWR<{ customers: Customer[] }>(`/api/customers?${query}`, fetcher)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.customers?.length ?? 0} customers</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Customer
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search name, ID, phone..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="border rounded-md px-3 py-2 text-sm bg-white" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="casual">Casual</option>
          <option value="account">Account</option>
        </select>
        <select className="border rounded-md px-3 py-2 text-sm bg-white" value={showBlacklisted} onChange={(e) => setShowBlacklisted(e.target.value)}>
          <option value="">All Status</option>
          <option value="false">Active Only</option>
          <option value="true">Blacklisted Only</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['ID Number', 'Name', 'Type', 'Phone', 'Status', 'Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data?.customers?.map((c) => (
              <tr
                key={c.id}
                className={`hover:bg-gray-50 cursor-pointer ${c.blacklisted ? 'bg-red-50 hover:bg-red-100' : ''}`}
                onClick={() => router.push(`/app/customers/${c.id}`)}
              >
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{c.idNumber}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3">
                  <Badge className={c.customerType === 'account' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-100'}>
                    {c.customerType}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-500">{c.phone}</td>
                <td className="px-4 py-3">
                  {c.blacklisted
                    ? <Badge variant="destructive" className="flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" />Blacklisted</Badge>
                    : c.isActive
                      ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                      : <Badge variant="secondary">Inactive</Badge>}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/app/customers/${c.id}`)}>View</Button>
                </td>
              </tr>
            ))}
            {!data?.customers?.length && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No customers found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateCustomerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { mutate(`/api/customers?${query}`); setCreateOpen(false) }}
      />
    </div>
  )
}
