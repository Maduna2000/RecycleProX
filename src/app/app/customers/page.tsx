'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Plus, AlertTriangle } from 'lucide-react'
import { DataTable, Avatar, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { CreateCustomerModal } from '@/components/customers/CreateCustomerModal'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; customerType: string; isActive: boolean; blacklisted: boolean
}

export default function CustomersPage() {
  const router = useRouter()
  const [search,          setSearch]          = useState('')
  const [typeFilter,      setTypeFilter]      = useState('')
  const [showBlacklisted, setShowBlacklisted] = useState('')
  const [createOpen,      setCreateOpen]      = useState(false)

  const query = new URLSearchParams({
    ...(search          && { search }),
    ...(typeFilter      && { type: typeFilter }),
    ...(showBlacklisted && { blacklisted: showBlacklisted }),
  })

  const { data, isLoading } = useSWR<{ customers: Customer[] }>(
    `/api/customers?${query}`,
    fetcher,
  )
  const customers = data?.customers ?? []

  const columns: Column<Customer>[] = [
    {
      key: 'idNumber',
      header: 'ID Number',
      width: '140px',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#6C757D' }}>{r.idNumber}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Avatar name={`${r.firstName} ${r.lastName}`} size={26} />
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 12, fontWeight: 500, color: '#212529' }}>
              {r.firstName} {r.lastName}
            </span>
            {r.blacklisted && (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: '#C0392B' }} title="Blacklisted" />
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'customerType',
      header: 'Type',
      width: '100px',
      render: (r) => (
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={
            r.customerType === 'account'
              ? { background: '#EBF3FC', color: '#185ABD' }
              : { background: '#F1F3F4', color: '#6C757D' }
          }
        >
          {r.customerType}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      width: '130px',
      render: (r) => <span style={{ fontSize: 12, color: '#6C757D' }}>{r.phone}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (r) => (
        <StatusBadge status={r.blacklisted ? 'blacklisted' : r.isActive ? 'active' : 'inactive'} />
      ),
    },
  ]

  const rowActions: RowAction<Customer>[] = [
    {
      label:   'View Profile',
      onClick: (r) => router.push(`/app/customers/${r.id}`),
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Page header */}
      <div className="shrink-0">
        <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Customers</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>{customers.length} customers</p>
      </div>

      {/* Filters + action */}
      <div className="flex gap-2 flex-wrap items-center shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#6C757D' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, phone…"
            className="pl-7 pr-3 py-1 text-xs rounded border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] w-64"
          />
        </div>
        <select
          className="border border-[#E0E0E0] rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-[#185ABD]"
          style={{ color: '#212529' }}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="casual">Casual</option>
          <option value="account">Account</option>
        </select>
        <select
          className="border border-[#E0E0E0] rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-[#185ABD]"
          style={{ color: '#212529' }}
          value={showBlacklisted}
          onChange={(e) => setShowBlacklisted(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="false">Active Only</option>
          <option value="true">Blacklisted Only</option>
        </select>
        <button
          onClick={() => setCreateOpen(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-white"
          style={{ background: '#217346' }}
        >
          <Plus className="w-3.5 h-3.5" /> Add Customer
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns}
          rows={customers}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/app/customers/${r.id}`)}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="No customers found"
          emptyAction={{ label: '+ Add Customer', onClick: () => setCreateOpen(true) }}
        />
      </div>

      <CreateCustomerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { mutate(`/api/customers?${query}`); setCreateOpen(false) }}
      />
    </div>
  )
}
