'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { AlertTriangle, Eye, ShieldBan, ShieldCheck, UserX, Trash2, UserMinus, Search } from 'lucide-react'
import { DataTable, Avatar, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import {
  inp, lbl, Btn, Field, FilterBar, PortalPage,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; landline?: string | null; email?: string | null
  customerType: string; primaryFunction: string; isActive: boolean; blacklisted: boolean
  createdAt: string; priceGroup?: { id: string; name: string } | null
  dealerCategory?: string | null
  companyName?: string | null
  zeroRated: boolean
  accountCode?: string | null
  gender?: string | null
  nationality?: string | null
  dateOfBirth?: string | null
  physicalAddress?: string | null
}

// ─── Blacklist modal ───────────────────────────────────────────────────────────
function BlacklistModal({ customer, onClose, onSuccess }: {
  customer: Customer; onClose: () => void; onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (reason.trim().length < 10) { toast.error('Reason must be at least 10 characters'); return }
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
          <span style={lbl}>Reason (min 10 characters)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fraudulent activity, stolen ID..." style={inp} />
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" loading={loading} disabled={reason.trim().length < 10} onClick={handleSubmit}>
            Blacklist
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Primary function badge ────────────────────────────────────────────────────
function PrimaryFunctionBadge({ fn }: { fn: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    supplier: { label: 'Supplier', bg: colors.processBg, color: colors.process },
    customer: { label: 'Customer', bg: colors.actionBg,  color: colors.action  },
    both:     { label: 'Both',     bg: colors.warningBg, color: colors.warning },
  }
  const meta = map[fn] ?? { label: fn, bg: colors.neutralBg, color: colors.textSecondary }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  )
}

// ─── Dealer category badge ─────────────────────────────────────────────────────
function DealerCategoryBadge({ cat }: { cat?: string | null }) {
  if (!cat) return <span style={{ color: colors.textSecondary, fontSize: 11 }}>—</span>
  const map: Record<string, { label: string; bg: string; color: string }> = {
    casual:   { label: 'Casual',   bg: colors.neutralBg, color: colors.textSecondary },
    dealer_1: { label: 'Dealer 1', bg: colors.processBg, color: colors.process },
    dealer_2: { label: 'Dealer 2', bg: colors.actionBg,  color: colors.action  },
    dealer_3: { label: 'Dealer 3', bg: colors.warningBg, color: colors.warning },
  }
  const meta = map[cat] ?? { label: cat, bg: colors.neutralBg, color: colors.textSecondary }
  return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
}

// ─── Accounts list ─────────────────────────────────────────────────────────────
function AccountsList({ onAddCustomer }: { onAddCustomer: () => void }) {
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [search,          setSearch]          = useState('')
  const [showBlacklisted, setShowBlacklisted] = useState('')
  const [dealerCategory,  setDealerCategory]  = useState('')
  const [primaryFunction, setPrimaryFunction] = useState('')
  const [blacklistId,     setBlacklistId]     = useState<string | null>(null)
  const [deleteId,        setDeleteId]        = useState<string | null>(null)
  const [deleteLoading,   setDeleteLoading]   = useState(false)
  const [convertId,       setConvertId]       = useState<string | null>(null)
  const [convertLoading,  setConvertLoading]  = useState(false)

  const query = new URLSearchParams({
    type: 'account',
    ...(search          && { search }),
    ...(showBlacklisted && { blacklisted: showBlacklisted }),
    ...(dealerCategory  && { dealerCategory }),
    ...(primaryFunction && { primaryFunction }),
  })

  const { data, isLoading, error } = useSWR<{ customers: Customer[] }>(
    `/api/customers?${query}`, fetcher,
  )
  const customers = data?.customers ?? []

  function refreshList() {
    mutate((key) => typeof key === 'string' && key.includes('/api/customers'), undefined, { revalidate: true })
  }

  async function handleSuspend(c: Customer) {
    const res = await fetch(`/api/customers/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    })
    if (res.ok) { toast.success(c.isActive ? 'Customer suspended' : 'Customer reactivated'); refreshList() }
    else toast.error('Failed to update customer')
  }

  async function handleUnblacklist(c: Customer) {
    const res = await fetch(`/api/customers/${c.id}/unblacklist`, { method: 'POST' })
    if (res.ok) { toast.success('Customer unblacklisted'); refreshList() }
    else toast.error('Failed to unblacklist')
  }

  async function handleConvertToCasual(id: string) {
    setConvertLoading(true)
    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerType: 'casual', dealerCategory: null, priceGroupId: null }),
    })
    setConvertLoading(false)
    if (res.ok) { toast.success('Converted to casual seller'); setConvertId(null); refreshList() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to convert customer') }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true)
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
    setDeleteLoading(false)
    if (res.ok) { toast.success('Customer deleted'); setDeleteId(null); refreshList() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to delete customer') }
  }

  const blacklistTarget = customers.find((c) => c.id === blacklistId)
  const deleteTarget    = customers.find((c) => c.id === deleteId)
  const convertTarget   = customers.find((c) => c.id === convertId)

  const columns: Column<Customer>[] = [
    {
      key: 'accountCode',
      header: 'Acc Code',
      width: '80px',
      render: (r) => r.accountCode
        ? <span className="font-mono text-[11px] font-semibold" style={{ color: '#185ABD' }}>{r.accountCode}</span>
        : <span className="text-[11px]" style={{ color: colors.textSecondary }}>—</span>,
    },
    {
      key: 'idNumber',
      header: 'ID Number',
      width: '140px',
      render: (r) => <span className="font-mono text-[11px]" style={{ color: colors.textSecondary }}>{r.idNumber}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      width: '200px',
      render: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          <Avatar name={`${r.firstName} ${r.lastName}`} size={20} />
          <span className="truncate" style={{ fontSize: 12, fontWeight: 500, color: colors.textPrimary }}>
            {r.firstName} {r.lastName}
            {r.companyName && <span style={{ color: colors.textSecondary, fontWeight: 400 }}> · {r.companyName}</span>}
            {r.blacklisted && <AlertTriangle className="w-3 h-3 inline ml-1 text-red-500" />}
          </span>
        </div>
      ),
    },
    {
      key: 'dealerCategory',
      header: 'Category',
      width: '100px',
      render: (r) => <DealerCategoryBadge cat={r.dealerCategory} />,
    },
    {
      key: 'primaryFunction',
      header: 'Function',
      width: '95px',
      render: (r) => <PrimaryFunctionBadge fn={r.primaryFunction} />,
    },
    {
      key: 'priceGroup',
      header: 'Price Group',
      width: '110px',
      render: (r) => r.priceGroup
        ? <span className="text-[11px] font-medium" style={{ color: colors.process }}>{r.priceGroup.name}</span>
        : <span className="text-[11px]" style={{ color: colors.textSecondary }}>—</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      width: '120px',
      render: (r) => <span className="font-mono text-[11px]" style={{ color: colors.textSecondary }}>{r.phone}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      width: '160px',
      render: (r) => r.email
        ? <span className="text-[11px] truncate block" style={{ color: colors.textSecondary }}>{r.email}</span>
        : <span className="text-[11px]" style={{ color: colors.textSecondary }}>—</span>,
    },
    {
      key: 'gender',
      header: 'Gender',
      width: '75px',
      render: (r) => <span className="text-[11px]" style={{ color: colors.textSecondary }}>
        {r.gender ? r.gender.charAt(0).toUpperCase() + r.gender.slice(1) : '—'}
      </span>,
    },
    {
      key: 'nationality',
      header: 'Nationality',
      width: '100px',
      render: (r) => <span className="text-[11px]" style={{ color: colors.textSecondary }}>{r.nationality ?? '—'}</span>,
    },
    {
      key: 'dateOfBirth',
      header: 'DOB',
      width: '90px',
      render: (r) => (
        <span className="font-mono text-[11px]" style={{ color: colors.textSecondary }}>
          {r.dateOfBirth ? new Date(r.dateOfBirth).toLocaleDateString('en-ZA') : '—'}
        </span>
      ),
    },
    {
      key: 'physicalAddress',
      header: 'Address',
      width: '170px',
      render: (r) => r.physicalAddress
        ? <span className="text-[11px] truncate block" title={r.physicalAddress} style={{ color: colors.textSecondary }}>{r.physicalAddress}</span>
        : <span className="text-[11px]" style={{ color: colors.textSecondary }}>—</span>,
    },
    {
      key: 'zeroRated',
      header: 'Zero VAT',
      width: '75px',
      render: (r) => r.zeroRated
        ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>Y</span>
        : <span className="text-[11px]" style={{ color: colors.textSecondary }}>N</span>,
    },
    {
      key: 'createdAt',
      header: 'Registered',
      width: '90px',
      render: (r) => (
        <span className="font-mono text-[11px]" style={{ color: colors.textSecondary }}>
          {new Date(r.createdAt).toLocaleDateString('en-ZA')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (r) => (
        <StatusBadge status={r.blacklisted ? 'blacklisted' : r.isActive ? 'active' : 'inactive'} />
      ),
    },
  ]

  const rowActions: RowAction<Customer>[] = [
    {
      label: 'View Profile',
      icon: Eye,
      onClick: (r) => router.push(`/app/customers/${r.id}`),
    },
    {
      label: 'Blacklist',
      icon: ShieldBan,
      danger: true,
      hidden: (r) => r.blacklisted || !isManager,
      onClick: (r) => setBlacklistId(r.id),
    },
    {
      label: 'Remove Blacklist',
      icon: ShieldCheck,
      hidden: (r) => !r.blacklisted || !isManager,
      onClick: (r) => handleUnblacklist(r),
    },
    {
      label: 'Suspend',
      icon: UserX,
      hidden: (r) => !r.isActive || !isManager,
      onClick: (r) => handleSuspend(r),
    },
    {
      label: 'Reactivate',
      icon: UserX,
      hidden: (r) => r.isActive || !isManager,
      onClick: (r) => handleSuspend(r),
    },
    {
      label: 'Convert to Casual',
      icon: UserMinus,
      danger: true,
      hidden: () => !isManager,
      onClick: (r) => setConvertId(r.id),
    },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      hidden: () => !isManager,
      onClick: (r) => setDeleteId(r.id),
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filters */}
      <FilterBar>
        <Field label="Search" width={230}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, phone…"
              style={{ ...inp, paddingLeft: 26 }}
            />
          </div>
        </Field>
        <Field label="Status" width={130}>
          <select style={inp} value={showBlacklisted} onChange={(e) => setShowBlacklisted(e.target.value)}>
            <option value="">All Status</option>
            <option value="false">Active Only</option>
            <option value="true">Blacklisted Only</option>
          </select>
        </Field>
        <Field label="Category" width={130}>
          <select style={inp} value={dealerCategory} onChange={(e) => setDealerCategory(e.target.value)}>
            <option value="">All Categories</option>
            <option value="casual">Casual</option>
            <option value="dealer_1">Dealer 1</option>
            <option value="dealer_2">Dealer 2</option>
            <option value="dealer_3">Dealer 3</option>
          </select>
        </Field>
        <Field label="Function" width={130}>
          <select style={inp} value={primaryFunction} onChange={(e) => setPrimaryFunction(e.target.value)}>
            <option value="">All Functions</option>
            <option value="supplier">Supplier</option>
            <option value="customer">Customer</option>
            <option value="both">Both</option>
          </select>
        </Field>
        <span style={{ fontSize: 11, color: '#6C757D', marginLeft: 'auto', paddingBottom: 8 }}>
          {customers.length} account{customers.length !== 1 ? 's' : ''}
        </span>
      </FilterBar>

      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={columns}
          rows={customers}
          rowKey={(r) => r.id}
          rowActions={rowActions}
          loading={isLoading}
          error={error}
          emptyMessage="No account customers found"
          emptyAction={{ label: '+ Add Account Customer', onClick: onAddCustomer }}
        />
      </div>

      {/* Blacklist modal */}
      {blacklistId && blacklistTarget && (
        <BlacklistModal
          customer={blacklistTarget}
          onClose={() => setBlacklistId(null)}
          onSuccess={() => { setBlacklistId(null); refreshList() }}
        />
      )}

      {/* Convert to Casual confirm */}
      {convertId && convertTarget && (
        <Dialog open onOpenChange={(o) => { if (!o) setConvertId(null) }}>
          <RpxDialogContent maxWidth={440}>
            <RpxDialogHeader title="Convert to Casual Seller" onClose={() => setConvertId(null)} />
            <RpxDialogBody>
              <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: '0 0 10px' }}>
                Convert <strong style={{ color: colors.textPrimary }}>{convertTarget.firstName} {convertTarget.lastName}</strong> to a casual seller?
              </p>
              <p style={{ fontSize: 11, padding: '6px 10px', borderRadius: 2, background: colors.warningBg, color: colors.warning, margin: 0 }}>
                Dealer category and price group will be removed. Their account code will be retained for reference.
              </p>
            </RpxDialogBody>
            <RpxDialogFooter>
              <Btn onClick={() => setConvertId(null)} disabled={convertLoading}>Cancel</Btn>
              <Btn variant="danger" loading={convertLoading} onClick={() => handleConvertToCasual(convertId)}>
                Convert
              </Btn>
            </RpxDialogFooter>
          </RpxDialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
      {deleteId && deleteTarget && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
          <RpxDialogContent maxWidth={440}>
            <RpxDialogHeader title="Delete Customer" onClose={() => setDeleteId(null)} />
            <RpxDialogBody>
              <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: 0 }}>
                Permanently delete <strong style={{ color: colors.textPrimary }}>{deleteTarget.firstName} {deleteTarget.lastName}</strong>? This cannot be undone.
              </p>
            </RpxDialogBody>
            <RpxDialogFooter>
              <Btn onClick={() => setDeleteId(null)} disabled={deleteLoading}>Cancel</Btn>
              <Btn variant="danger" loading={deleteLoading} onClick={() => handleDelete(deleteId)}>
                Delete
              </Btn>
            </RpxDialogFooter>
          </RpxDialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function AccountsPage() {
  const router = useRouter()

  return (
    <PortalPage
      title="Accounts"
      actions={<Btn variant="primary" size="sm" onClick={() => router.push('/app/customers/new')}>+ Add Account</Btn>}
    >
      <AccountsList onAddCustomer={() => router.push('/app/customers/new')} />
    </PortalPage>
  )
}
