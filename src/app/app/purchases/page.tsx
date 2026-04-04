'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Eye } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { format } from '@/lib/utils/format'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Purchase = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  totalAmount: string
  paymentMethod: string
  createdAt: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string }
  lines: { id: string }[]
}

export default function PurchasesPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const query = new URLSearchParams({
    ...(search && { search }),
    ...(status && { status }),
    pageSize: '50',
  })

  const { data } = useSWR<{ purchases: Purchase[]; total: number }>(`/api/purchases?${query}`, fetcher)
  const purchases = data?.purchases ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? 0} total records</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => router.push('/app/purchases/new')}>
          <Plus className="w-4 h-4 mr-2" /> New Purchase
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search ref, customer name or ID..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-white"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {purchases.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No purchases found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Ref #', 'Customer', 'Lines', 'Total', 'Payment', 'Date', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {purchases.map((p) => (
                <tr
                  key={p.id}
                  className={`hover:bg-gray-50 cursor-pointer ${p.status === 'voided' ? 'opacity-60' : ''}`}
                  onClick={() => router.push(`/app/purchases/${p.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.refNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{p.customer.firstName} {p.customer.lastName}</p>
                    <p className="text-xs text-gray-400 font-mono">{p.customer.idNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.lines.length}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-900">
                    R {Number(p.totalAmount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-500">{p.paymentMethod}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{format.datetime(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    {p.status === 'completed'
                      ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Completed</Badge>
                      : <Badge variant="destructive">Voided</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
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
