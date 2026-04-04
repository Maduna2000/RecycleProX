'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Eye } from 'lucide-react'
import { format } from '@/lib/utils/format'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Sale = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  totalAmount: string
  paymentMethod: string
  buyerName: string
  buyerIdNumber?: string
  createdAt: string
  lines: { id: string }[]
}

export default function SalesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const query = new URLSearchParams({
    ...(search && { search }),
    ...(status && { status }),
    pageSize: '50',
  })

  const { data } = useSWR<{ sales: Sale[]; total: number }>(`/api/sales?${query}`, fetcher)
  const sales = data?.sales ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? 0} total records</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => router.push('/app/sales/new')}>
          <Plus className="w-4 h-4 mr-2" /> New Sale
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search ref or buyer name..."
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
        {sales.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No sales found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Ref #', 'Buyer', 'Lines', 'Total', 'Payment', 'Date', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sales.map((s) => (
                <tr
                  key={s.id}
                  className={`hover:bg-gray-50 cursor-pointer ${s.status === 'voided' ? 'opacity-60' : ''}`}
                  onClick={() => router.push(`/app/sales/${s.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.refNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.buyerName}</p>
                    {s.buyerIdNumber && <p className="text-xs text-gray-400 font-mono">{s.buyerIdNumber}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{s.lines.length}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-900">
                    R {Number(s.totalAmount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-500">{s.paymentMethod}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{format.datetime(s.createdAt)}</td>
                  <td className="px-4 py-3">
                    {s.status === 'completed'
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
