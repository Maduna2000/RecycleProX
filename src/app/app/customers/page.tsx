'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { AlertTriangle, Search, Loader2, Upload, MoreVertical, Eye, ShieldBan, ShieldCheck, UserX, Trash2 } from 'lucide-react'
import { DataTable, Avatar, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { CreateCustomerModal } from '@/components/customers/CreateCustomerModal'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; customerType: string; isActive: boolean; blacklisted: boolean
  createdAt: string
}

type Tab = 'accounts' | 'casuals'

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// ─── Status badge ──────────────────────────────────────────────────────────────
function statusBadge(c: Customer) {
  if (c.blacklisted)
    return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.dangerBg, color: colors.danger }}>Blacklisted</span>
  if (c.isActive)
    return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.actionBg, color: colors.action }}>Active</span>
  return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.neutralBg, color: colors.textSecondary }}>Suspended</span>
}

// ─── Action menu item ──────────────────────────────────────────────────────────
function MenuItem({ icon, label, onClick, danger, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
      style={{ color: danger ? colors.danger : colors.textPrimary }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = danger ? colors.dangerBg : colors.toolbar)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon} {label}
    </button>
  )
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Blacklist Customer</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            Blacklisting <strong style={{ color: colors.textPrimary }}>{customer.firstName} {customer.lastName}</strong> will prevent them from transacting.
          </p>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: colors.textSecondary }}>Reason (min 10 characters)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fraudulent activity, stolen ID..." className="text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <button
              onClick={handleSubmit}
              disabled={loading || reason.trim().length < 10}
              className="h-9 px-4 rounded text-sm font-medium text-white disabled:opacity-50"
              style={{ background: colors.danger }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Blacklist'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Import CSV modal stub ──────────────────────────────────────────────────────
function ImportCsvModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile]       = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<{ imported: number; skipped: number; errors: { row: number; reason: string }[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleImport() {
    if (!file) return
    setLoading(true)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/casual/import', { method: 'POST', body: fd })
    setLoading(false)
    if (res.ok) { setResult(await res.json()); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Import failed') }
  }

  function downloadTemplate() {
    const csv  = 'idNumber,firstName,lastName,phone,dateOfBirth,gender,nationality,physicalAddress\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a    = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'casual-import-template.csv'; a.click()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Import Casuals from CSV</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          {result ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg text-sm" style={{ background: colors.actionBg, color: colors.action }}>
                {result.imported} imported · {result.skipped} skipped
              </div>
              {result.errors.length > 0 && (
                <div className="text-xs space-y-1" style={{ color: colors.danger }}>
                  {result.errors.slice(0, 5).map((e) => <p key={e.row}>Row {e.row}: {e.reason}</p>)}
                </div>
              )}
              <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
            </div>
          ) : (
            <>
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                CSV columns: idNumber, firstName, lastName, phone, dateOfBirth, gender, nationality, physicalAddress
              </p>
              <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <div
                className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg cursor-pointer border-2 border-dashed"
                style={{ borderColor: colors.border }}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="w-8 h-8" style={{ color: colors.textSecondary }} />
                <span className="text-sm" style={{ color: file ? colors.textPrimary : colors.textSecondary }}>
                  {file ? file.name : 'Click to select CSV file'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <button onClick={downloadTemplate} className="text-xs underline" style={{ color: colors.process }}>Download template</button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
                  <Button onClick={handleImport} disabled={!file || loading}>
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</> : 'Import'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Accounts tab ──────────────────────────────────────────────────────────────
function AccountsTab({ onAddCustomer }: { onAddCustomer: () => void }) {
  const router = useRouter()
  const [search,          setSearch]          = useState('')
  const [showBlacklisted, setShowBlacklisted] = useState('')

  const query = new URLSearchParams({
    type: 'account',
    ...(search          && { search }),
    ...(showBlacklisted && { blacklisted: showBlacklisted }),
  })

  const { data, isLoading } = useSWR<{ customers: Customer[] }>(
    `/api/customers?${query}`, fetcher,
  )
  const customers = data?.customers ?? []

  const columns: Column<Customer>[] = [
    {
      key: 'idNumber',
      header: 'ID Number',
      width: '150px',
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
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: colors.danger }} aria-label="Blacklisted" />
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      width: '140px',
      render: (r) => <span style={{ fontSize: 12, color: colors.textSecondary }}>{r.phone}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (r) => (
        <StatusBadge status={r.blacklisted ? 'blacklisted' : r.isActive ? 'active' : 'inactive'} />
      ),
    },
    {
      key: 'createdAt',
      header: 'Registered',
      width: '120px',
      render: (r) => (
        <span style={{ fontSize: 11, color: colors.textSecondary }}>
          {new Date(r.createdAt).toLocaleDateString('en-ZA')}
        </span>
      ),
    },
  ]

  const rowActions: RowAction<Customer>[] = [
    { label: 'View Profile', onClick: (r) => router.push(`/app/customers/${r.id}`) },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center shrink-0">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, phone…"
            className="w-full pl-7 pr-3 py-1 text-xs rounded border bg-white focus:outline-none"
            style={{ borderColor: colors.border }}
            onFocus={(e) => (e.currentTarget.style.borderColor = colors.borderFocus)}
            onBlur={(e)  => (e.currentTarget.style.borderColor = colors.border)}
          />
        </div>
        <select
          className="rounded px-2 py-1 text-xs bg-white focus:outline-none border"
          style={{ color: colors.textPrimary, borderColor: colors.border }}
          value={showBlacklisted}
          onChange={(e) => setShowBlacklisted(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="false">Active Only</option>
          <option value="true">Blacklisted Only</option>
        </select>
        <span className="text-xs ml-auto" style={{ color: colors.textSecondary }}>
          {customers.length} account{customers.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns}
          rows={customers}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/app/customers/${r.id}`)}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="No account customers found"
          emptyAction={{ label: '+ Add Account Customer', onClick: onAddCustomer }}
        />
      </div>
    </div>
  )
}

// ─── Casuals tab ───────────────────────────────────────────────────────────────
function CasualsTab({ onAddCustomer }: { onAddCustomer: () => void }) {
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [search,       setSearch]       = useState('')
  const [letter,       setLetter]       = useState<string | null>(null)
  const [importOpen,   setImportOpen]   = useState(false)
  const [menuOpen,     setMenuOpen]     = useState<string | null>(null)
  const [blacklistId,  setBlacklistId]  = useState<string | null>(null)
  const [deleteId,     setDeleteId]     = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const params = new URLSearchParams({ type: 'casual', limit: '200' })
  if (search) params.set('search', search)

  const { data, isLoading } = useSWR<{ customers: Customer[]; total: number }>(
    `/api/customers?${params}`, fetcher,
  )

  const allCasuals = data?.customers ?? []
  const customers  = allCasuals.filter((c) =>
    letter ? c.lastName.toUpperCase().startsWith(letter) : true,
  )

  function refreshList() {
    mutate((key) => typeof key === 'string' && key.includes('/api/customers'), undefined, { revalidate: true })
  }

  async function handleSuspend(c: Customer) {
    setMenuOpen(null)
    const res = await fetch(`/api/customers/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    })
    if (res.ok) { toast.success(c.isActive ? 'Customer suspended' : 'Customer reactivated'); refreshList() }
    else toast.error('Failed to update customer')
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true)
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
    setDeleteLoading(false)
    if (res.ok) { toast.success('Customer deleted'); setDeleteId(null); refreshList() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to delete customer') }
  }

  const deleteTarget    = allCasuals.find((c) => c.id === deleteId)
  const blacklistTarget = allCasuals.find((c) => c.id === blacklistId)

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3" onClick={() => setMenuOpen(null)}>

      {/* Top action row */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLetter(null) }}
            placeholder="Search name or ID number…"
            className="pl-7 h-7 text-xs border-[#E0E0E0]"
          />
        </div>
        <span className="text-xs" style={{ color: colors.textSecondary }}>
          {data?.total ?? 0} casual{(data?.total ?? 0) !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto flex gap-2">
          {isManager && (
            <button
              onClick={(e) => { e.stopPropagation(); setImportOpen(true) }}
              className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium"
              style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary, background: colors.surface }}
              onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
              onMouseLeave={(e) => (e.currentTarget.style.background = colors.surface)}
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
          )}
        </div>
      </div>

      {/* A–Z quick filter */}
      <div className="flex flex-wrap gap-1 shrink-0">
        <button
          onClick={() => setLetter(null)}
          className="px-2 py-0.5 text-xs font-medium rounded transition-colors"
          style={letter === null
            ? { background: colors.process, color: colors.surface }
            : { background: colors.neutralBg, color: colors.textSecondary }}
        >
          All
        </button>
        {ALPHA.map((l) => (
          <button
            key={l}
            onClick={() => { setLetter(l === letter ? null : l); setSearch('') }}
            className="px-2 py-0.5 text-xs font-medium rounded transition-colors"
            style={letter === l
              ? { background: colors.process, color: colors.surface }
              : { background: colors.neutralBg, color: colors.textSecondary }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg" style={{ border: `1px solid ${colors.border}` }}>
        {isLoading ? (
          <div className="flex items-center justify-center p-10" style={{ color: colors.textSecondary }}>
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : !customers.length ? (
          <div className="flex flex-col items-center justify-center p-10 gap-3">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              {letter ? `No casuals with surname starting with "${letter}"` : 'No casual customers found'}
            </p>
            {!letter && (
              <button
                onClick={onAddCustomer}
                className="text-xs font-medium px-3 py-1.5 rounded"
                style={{ background: colors.actionBg, color: colors.action }}
              >
                + Add Casual Customer
              </button>
            )}
          </div>
        ) : (
          <table className="w-full bg-white">
            <thead style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.border}` }}>
              <tr>
                {['Name', 'ID Number', 'Phone', 'Registered', 'Status', ''].map((h, i) => (
                  <th
                    key={i}
                    className="text-left px-4 py-2"
                    style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', width: h === '' ? 48 : undefined }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: i < customers.length - 1 ? `1px solid ${colors.neutralBg}` : 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-2.5 font-medium" style={{ fontSize: fontSize.sm, color: colors.textPrimary }} onClick={() => router.push(`/app/customers/${c.id}`)}>
                    {c.lastName}, {c.firstName}
                  </td>
                  <td className="px-4 py-2.5 font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }} onClick={() => router.push(`/app/customers/${c.id}`)}>
                    {c.idNumber}
                  </td>
                  <td className="px-4 py-2.5" style={{ fontSize: fontSize.sm, color: colors.textSecondary }} onClick={() => router.push(`/app/customers/${c.id}`)}>
                    {c.phone}
                  </td>
                  <td className="px-4 py-2.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary }} onClick={() => router.push(`/app/customers/${c.id}`)}>
                    {new Date(c.createdAt).toLocaleDateString('en-ZA')}
                  </td>
                  <td className="px-4 py-2.5" onClick={() => router.push(`/app/customers/${c.id}`)}>
                    {statusBadge(c)}
                  </td>

                  {/* Action menu */}
                  <td className="px-2 py-2.5 relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded transition-colors"
                      style={{ color: colors.textSecondary }}
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === c.id ? null : c.id) }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuOpen === c.id && (
                      <div
                        className="absolute right-2 top-9 z-50 rounded-lg shadow-lg py-1 min-w-[160px]"
                        style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MenuItem icon={<Eye className="w-3.5 h-3.5" />} label="View Profile" onClick={() => { setMenuOpen(null); router.push(`/app/customers/${c.id}`) }} />
                        {!c.blacklisted ? (
                          <MenuItem icon={<ShieldBan className="w-3.5 h-3.5" />} label="Blacklist" danger disabled={!isManager} onClick={() => { setMenuOpen(null); setBlacklistId(c.id) }} />
                        ) : (
                          <MenuItem
                            icon={<ShieldCheck className="w-3.5 h-3.5" />} label="Remove Blacklist" disabled={!isManager}
                            onClick={async () => {
                              setMenuOpen(null)
                              const res = await fetch(`/api/customers/${c.id}/unblacklist`, { method: 'POST' })
                              if (res.ok) { toast.success('Customer unblacklisted'); refreshList() }
                              else toast.error('Failed to unblacklist')
                            }}
                          />
                        )}
                        <MenuItem
                          icon={<UserX className="w-3.5 h-3.5" />}
                          label={c.isActive ? 'Suspend' : 'Reactivate'}
                          disabled={!isManager}
                          onClick={() => handleSuspend(c)}
                        />
                        <div style={{ borderTop: `1px solid ${colors.border}`, margin: '4px 0' }} />
                        <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" danger disabled={!isManager} onClick={() => { setMenuOpen(null); setDeleteId(c.id) }} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {importOpen && <ImportCsvModal onClose={() => setImportOpen(false)} onSuccess={() => { refreshList(); setImportOpen(false) }} />}

      {blacklistId && blacklistTarget && (
        <BlacklistModal customer={blacklistTarget} onClose={() => setBlacklistId(null)} onSuccess={() => { setBlacklistId(null); refreshList() }} />
      )}

      {deleteId && deleteTarget && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Delete Customer</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                Permanently delete <strong style={{ color: colors.textPrimary }}>{deleteTarget.firstName} {deleteTarget.lastName}</strong>? This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleteLoading}>Cancel</Button>
                <button
                  onClick={() => handleDelete(deleteId)}
                  disabled={deleteLoading}
                  className="h-9 px-4 rounded text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: colors.danger }}
                >
                  {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function AccountsPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [activeTab,   setActiveTab]   = useState<Tab>(() =>
    searchParams.get('tab') === 'casuals' ? 'casuals' : 'accounts'
  )
  const [createOpen,  setCreateOpen]  = useState(false)
  const [createType,  setCreateType]  = useState<'account' | 'casual'>('account')

  // Sync tab from URL on navigation
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'casuals') setActiveTab('casuals')
    else if (t === 'accounts') setActiveTab('accounts')
  }, [searchParams])

  // Auto-open create modal from toolbar ?create=1
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      const type = searchParams.get('type') === 'casual' ? 'casual' : 'account'
      setCreateType(type)
      setActiveTab(type === 'casual' ? 'casuals' : 'accounts')
      setCreateOpen(true)
      router.replace('/app/customers')
    }
  }, [searchParams, router])

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    router.replace(`/app/customers?tab=${tab}`, { scroll: false })
  }

  function handleAddCustomer() {
    setCreateType(activeTab === 'casuals' ? 'casual' : 'account')
    setCreateOpen(true)
  }

  const TABS = [
    { value: 'accounts', label: 'Accounts' },
    { value: 'casuals',  label: 'Casuals'  },
  ] as const

  return (
    <PageShell
      title="Accounts"
      subtitle="Manage account customers and casual sellers"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(v) => switchTab(v as Tab)}
    >
      {activeTab === 'accounts' && <AccountsTab onAddCustomer={handleAddCustomer} />}
      {activeTab === 'casuals'  && <CasualsTab  onAddCustomer={handleAddCustomer} />}

      <CreateCustomerModal
        open={createOpen}
        defaultType={createType}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          mutate((key) => typeof key === 'string' && key.includes('/api/customers'), undefined, { revalidate: true })
          setCreateOpen(false)
        }}
      />
    </PageShell>
  )
}
