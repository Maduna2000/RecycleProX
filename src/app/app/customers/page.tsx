'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { AlertTriangle } from 'lucide-react'
import { DataTable, Avatar, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { CreateCustomerModal } from '@/components/customers/CreateCustomerModal'
import { PageShell } from '@/components/layout/PageShell'
import { colors } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; customerType: string; isActive: boolean; blacklisted: boolean
}

export default function CustomersPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [search,          setSearch]          = useState('')
  const [typeFilter,      setTypeFilter]      = useState('')
  const [showBlacklisted, setShowBlacklisted] = useState('')
  const [createOpen,      setCreateOpen]      = useState(false)

  // Auto-open create modal when toolbar "Add Customer" button navigates here with ?create=1
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateOpen(true)
      router.replace('/app/customers')
    }
  }, [searchParams, router])

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
      render: (r) => <span className="font-mono text-xs" style={{ color: colors.textSecondary }}>{r.idNumber}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Avatar name={`${r.firstName} ${r.lastName}`} size={26} />
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 12, fontWeight: 500, color: colors.textPrimary }}>
              {r.firstName} {r.lastName}
            </span>
            {r.blacklisted && (
              <span title="Blacklisted">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: colors.danger }} />
              </span>
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
              ? { background: colors.processBg, color: colors.process }
              : { background: colors.neutralBg, color: colors.textSecondary }
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
      render: (r) => <span style={{ fontSize: 12, color: colors.textSecondary }}>{r.phone}</span>,
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
    <PageShell title="Customers" subtitle={`${customers.length} customers`}>
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center shrink-0 mb-3">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, phone…"
            className="pl-7 pr-3 py-1 text-xs rounded border bg-white focus:outline-none w-64"
            style={{ borderColor: colors.border }}
            onFocus={(e) => (e.currentTarget.style.borderColor = colors.borderFocus)}
            onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
          />
        </div>
        <select
          className="rounded px-2 py-1 text-xs bg-white focus:outline-none border"
          style={{ color: colors.textPrimary, borderColor: colors.border }}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          onFocus={(e) => (e.currentTarget.style.borderColor = colors.borderFocus)}
          onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
        >
          <option value="">All Types</option>
          <option value="casual">Casual</option>
          <option value="account">Account</option>
        </select>
        <select
          className="rounded px-2 py-1 text-xs bg-white focus:outline-none border"
          style={{ color: colors.textPrimary, borderColor: colors.border }}
          value={showBlacklisted}
          onChange={(e) => setShowBlacklisted(e.target.value)}
          onFocus={(e) => (e.currentTarget.style.borderColor = colors.borderFocus)}
          onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
        >
          <option value="">All Status</option>
          <option value="false">Active Only</option>
          <option value="true">Blacklisted Only</option>
        </select>
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
    </PageShell>
  )
}
