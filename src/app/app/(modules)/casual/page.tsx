'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Search, ShieldBan, ShieldCheck, UserX, Trash2, UserCheck, Eye, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { DataTable, StatusBadge, Column, RowAction } from '@/components/ui/DataTable'
import { colors, fontSize } from '@/lib/design-tokens'
import {
  inp, Btn, BtnMenu, Field, FilterBar, PortalPage,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; physicalAddress?: string | null
  isActive: boolean; blacklisted: boolean; createdAt: string
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function customerStatus(c: Customer): string {
  if (c.blacklisted) return 'blacklisted'
  if (c.isActive) return 'active'
  return 'suspended'
}

export default function CasualsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [search, setSearch]               = useState('')
  const [letter, setLetter]               = useState<string | null>(null)
  const [showBlacklisted, setShowBlacklisted] = useState('')
  const [dealerCategory, setDealerCategory]   = useState('')
  const [primaryFunction, setPrimaryFunction] = useState('')
  const [page, setPage]                   = useState(1)
  const [blacklistId, setBlacklistId]     = useState<string | null>(null)
  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [promoteId, setPromoteId]         = useState<string | null>(null)
  const exportFired = useRef(false)

  const params = new URLSearchParams({ type: 'casual', limit: '200' })
  if (search) params.set('search', search)
  if (showBlacklisted) params.set('blacklisted', showBlacklisted)
  if (dealerCategory) params.set('dealerCategory', dealerCategory)
  if (primaryFunction) params.set('primaryFunction', primaryFunction)
  const { data, isLoading } = useSWR<{ customers: Customer[]; total: number }>(
    `/api/customers?${params}`,
    fetcher,
  )

  async function handleToolbarExport(format: 'xlsx' | 'pdf') {
    const toastId = toast.loading(`Exporting ${format === 'pdf' ? 'PDF' : 'Excel'}…`)
    try {
      const qs = new URLSearchParams({ format })
      if (search) qs.set('search', search)
      if (showBlacklisted) qs.set('blacklisted', showBlacklisted)
      if (dealerCategory) qs.set('dealerCategory', dealerCategory)
      if (primaryFunction) qs.set('primaryFunction', primaryFunction)
      const res = await fetch(`/api/casual/export?${qs}`)
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Export failed') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `casual-sellers-${new Date().toISOString().slice(0, 10)}.${format}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded', { id: toastId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export', { id: toastId })
    } finally {
      exportFired.current = false
    }
  }

  // Toolbar Export deep-link (?export=xlsx|pdf)
  useEffect(() => {
    const fmt = searchParams.get('export')
    if ((fmt === 'xlsx' || fmt === 'pdf') && !exportFired.current) {
      exportFired.current = true
      router.replace('/app/casual', { scroll: false })
      void handleToolbarExport(fmt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router])

  const customers = (data?.customers ?? []).filter((c) =>
    letter ? c.lastName.toUpperCase().startsWith(letter) : true,
  )

  const PAGE_SIZE  = 50
  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pagedCustomers = customers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function refreshList() {
    mutate((key) => typeof key === 'string' && key.includes('/api/customers'), undefined, { revalidate: true })
  }

  async function handleSuspend(c: Customer) {
    const res = await fetch(`/api/customers/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    })
    if (res.ok) {
      toast.success(c.isActive ? 'Customer suspended' : 'Customer reactivated')
      refreshList()
    } else {
      toast.error('Failed to update customer')
    }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true)
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
    setDeleteLoading(false)
    if (res.ok) {
      toast.success('Customer deleted')
      setDeleteId(null)
      refreshList()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to delete customer')
    }
  }

  const deleteTarget   = customers.find((c) => c.id === deleteId)
  const blacklistTarget = customers.find((c) => c.id === blacklistId)

  const columns: Column<Customer>[] = [
    {
      key:    'name',
      header: 'Name',
      render: (r) => (
        <span style={{ color: colors.process, fontWeight: 500 }}>
          {r.lastName}, {r.firstName}
        </span>
      ),
    },
    {
      key:    'idNumber',
      header: 'ID / Passport',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: colors.textSecondary, fontSize: fontSize.xs }}>
          {r.idNumber}
        </span>
      ),
    },
    {
      key:    'phone',
      header: 'Phone',
      render: (r) => r.phone,
    },
    {
      key:    'physicalAddress',
      header: 'Address',
      render: (r) => (
        <span style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
          {r.physicalAddress ?? '—'}
        </span>
      ),
    },
    {
      key:    'createdAt',
      header: 'Registered',
      render: (r) => (
        <span style={{ color: colors.textSecondary }}>
          {new Date(r.createdAt).toLocaleDateString('en-ZA')}
        </span>
      ),
    },
    {
      key:    'status',
      header: 'Status',
      width:  '110px',
      render: (r) => <StatusBadge status={customerStatus(r)} />,
    },
  ]

  const rowActions: RowAction<Customer>[] = [
    {
      label:   'View Profile',
      icon:    Eye,
      onClick: (c) => router.push(`/app/casual/${c.id}`),
    },
    {
      label:   'Promote to Account',
      icon:    UserCheck,
      hidden:  () => !isManager,
      onClick: (c) => setPromoteId(c.id),
    },
    {
      label:   'Blacklist',
      icon:    ShieldBan,
      danger:  true,
      hidden:  (c) => c.blacklisted || !isManager,
      onClick: (c) => setBlacklistId(c.id),
    },
    {
      label:   'Remove Blacklist',
      icon:    ShieldCheck,
      hidden:  (c) => !c.blacklisted || !isManager,
      onClick: async (c) => {
        const res = await fetch(`/api/customers/${c.id}/unblacklist`, { method: 'POST' })
        if (res.ok) { toast.success('Customer unblacklisted'); refreshList() }
        else toast.error('Failed to unblacklist')
      },
    },
    {
      label:   'Suspend',
      icon:    UserX,
      hidden:  (c) => !c.isActive || !isManager,
      onClick: (c) => handleSuspend(c),
    },
    {
      label:   'Reactivate',
      icon:    UserX,
      hidden:  (c) => c.isActive || !isManager,
      onClick: (c) => handleSuspend(c),
    },
    {
      label:   'Delete',
      icon:    Trash2,
      danger:  true,
      hidden:  () => !isManager,
      onClick: (c) => setDeleteId(c.id),
    },
  ]

  return (
    <PortalPage title="Casual Sellers">
      <div className="flex flex-col flex-1 min-h-0">

        {/* Filter bar */}
        <FilterBar>
          <Field label="Search" width={230}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setLetter(null); setPage(1) }}
                placeholder="Search by name or ID number…"
                style={{ ...inp, paddingLeft: 26 }}
              />
            </div>
          </Field>
          <Field label="Status" width={130}>
            <select style={inp} value={showBlacklisted} onChange={(e) => { setShowBlacklisted(e.target.value); setPage(1) }}>
              <option value="">All Status</option>
              <option value="false">Active Only</option>
              <option value="true">Blacklisted Only</option>
            </select>
          </Field>
          <Field label="Category" width={130}>
            <select style={inp} value={dealerCategory} onChange={(e) => { setDealerCategory(e.target.value); setPage(1) }}>
              <option value="">All Categories</option>
              <option value="casual">Casual</option>
              <option value="dealer_1">Dealer 1</option>
              <option value="dealer_2">Dealer 2</option>
              <option value="dealer_3">Dealer 3</option>
            </select>
          </Field>
          <Field label="Function" width={130}>
            <select style={inp} value={primaryFunction} onChange={(e) => { setPrimaryFunction(e.target.value); setPage(1) }}>
              <option value="">All Functions</option>
              <option value="supplier">Supplier</option>
              <option value="customer">Customer</option>
              <option value="both">Both</option>
            </select>
          </Field>
          <Field label={' '}>
            <BtnMenu
              icon={Download}
              label="Export"
              style={{ height: 30 }}
              items={[
                { label: 'Export Excel', href: '/app/casual?export=xlsx' },
                { label: 'Export PDF',   href: '/app/casual?export=pdf'  },
              ]}
            />
          </Field>
          <span style={{ fontSize: 11, color: '#6C757D', marginLeft: 'auto', paddingBottom: 8 }}>
            {customers.length} casual{customers.length !== 1 ? 's' : ''}
          </span>
        </FilterBar>

        {/* A–Z quick filter */}
        <div className="flex flex-wrap gap-1 shrink-0" style={{ padding: '8px 14px 0' }}>
          <Btn size="sm" variant={letter === null ? 'primary' : 'secondary'} onClick={() => { setLetter(null); setPage(1) }}>All</Btn>
          {ALPHA.map((l) => (
            <Btn key={l} size="sm" variant={letter === l ? 'primary' : 'secondary'} onClick={() => { setLetter(l === letter ? null : l); setSearch(''); setPage(1) }}>
              {l}
            </Btn>
          ))}
        </div>

        {/* DataTable */}
        <div className="flex-1 min-h-0" style={{ padding: 10 }}>
          <DataTable
            columns={columns}
            rows={pagedCustomers}
            rowKey={(r) => r.id}
            rowActions={rowActions}
            loading={isLoading}
            total={customers.length}
            page={safePage}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            emptyMessage={letter
              ? `No casual customers with surname starting with "${letter}"`
              : 'No casual customers found'}
          />
        </div>

        {promoteId && (
          <PromoteToAccountModal
            customerId={promoteId}
            customerName={(() => { const c = customers.find(x => x.id === promoteId); return c ? `${c.firstName} ${c.lastName}` : '' })()}
            onClose={() => setPromoteId(null)}
            onSuccess={() => { setPromoteId(null); refreshList() }}
          />
        )}

        {blacklistId && blacklistTarget && (
          <BlacklistModal
            customer={blacklistTarget}
            onClose={() => setBlacklistId(null)}
            onSuccess={() => { setBlacklistId(null); refreshList() }}
          />
        )}

        {deleteId && deleteTarget && (
          <Dialog open onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
            <RpxDialogContent maxWidth={440}>
              <RpxDialogHeader title="Delete Customer" onClose={() => setDeleteId(null)} />
              <RpxDialogBody>
                <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: 0 }}>
                  Are you sure you want to permanently delete <strong style={{ color: colors.textPrimary }}>{deleteTarget.firstName} {deleteTarget.lastName}</strong>?
                  This action cannot be undone and will remove all associated records.
                </p>
              </RpxDialogBody>
              <RpxDialogFooter>
                <Btn onClick={() => setDeleteId(null)} disabled={deleteLoading}>Cancel</Btn>
                <Btn variant="danger" loading={deleteLoading} onClick={() => handleDelete(deleteId)}>Delete</Btn>
              </RpxDialogFooter>
            </RpxDialogContent>
          </Dialog>
        )}
      </div>
    </PortalPage>
  )
}

// ─── Blacklist Modal ───────────────────────────────────────────────────────────
function BlacklistModal({ customer, onClose, onSuccess }: { customer: Customer; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (reason.length < 10) { toast.error('Reason must be at least 10 characters'); return }
    setLoading(true)
    const res = await fetch(`/api/customers/${customer.id}/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Customer blacklisted'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to blacklist') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Blacklist Customer" onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: '0 0 12px' }}>
            Blacklisting <strong style={{ color: colors.textPrimary }}>{customer.firstName} {customer.lastName}</strong> will prevent them from transacting.
          </p>
          <label className="text-xs font-medium" style={{ color: colors.textSecondary }}>Reason (min 10 characters)</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for blacklisting…"
            className="mt-1 border-[#E0E0E0]"
            disabled={loading}
          />
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" loading={loading} disabled={reason.length < 10} onClick={handleSubmit}>
            Blacklist
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Promote to Account Modal ─────────────────────────────────────────────────

function PromoteToAccountModal({ customerId, customerName, onClose, onSuccess }: {
  customerId: string; customerName: string; onClose: () => void; onSuccess: () => void
}) {
  const [primaryFunction, setPrimaryFunction] = useState('supplier')
  const [loading,         setLoading]         = useState(false)

  async function handlePromote() {
    setLoading(true)
    const res = await fetch(`/api/customers/${customerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerType: 'account',
        primaryFunction,
      }),
    })
    setLoading(false)
    if (res.ok) {
      const customer = await res.json()
      toast.success(`Promoted to account — code: ${customer.accountCode ?? ''}`)
      onSuccess()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to promote customer')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Promote to Account" onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: '0 0 12px' }}>
            Promoting <strong style={{ color: colors.textPrimary }}>{customerName}</strong> to an account customer. An account code will be auto-assigned.
          </p>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: '0 0 12px' }}>
            Only regulars qualify — the customer must have <strong style={{ color: colors.textPrimary }}>more than 5 completed purchases</strong>.
            They will stay in the <strong style={{ color: colors.textPrimary }}>Casual</strong> dealer category; only an admin can assign a dealer category afterwards.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: colors.textSecondary }}>Primary Function</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm bg-white focus:outline-none"
                style={{ borderColor: colors.border, color: colors.textPrimary }}
                value={primaryFunction}
                onChange={(e) => setPrimaryFunction(e.target.value)}
              >
                <option value="supplier">Supplier</option>
                <option value="customer">Customer</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" loading={loading} onClick={handlePromote}>Promote →</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

