'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, Loader2, Upload, Download, CheckCircle2, AlertCircle, ShieldBan, ShieldCheck, UserX, Trash2, UserCheck, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { PageShell } from '@/components/layout/PageShell'
import { DataTable, StatusBadge, Column, RowAction } from '@/components/ui/DataTable'
import { colors, fontSize, layout } from '@/lib/design-tokens'

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
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [search, setSearch]               = useState('')
  const [letter, setLetter]               = useState<string | null>(null)
  const [showBlacklisted, setShowBlacklisted] = useState('')
  const [dealerCategory, setDealerCategory]   = useState('')
  const [primaryFunction, setPrimaryFunction] = useState('')
  const [importOpen, setImportOpen]       = useState(false)
  const [blacklistId, setBlacklistId]     = useState<string | null>(null)
  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [promoteId, setPromoteId]         = useState<string | null>(null)

  const params = new URLSearchParams({ type: 'casual', limit: '200' })
  if (search) params.set('search', search)
  if (showBlacklisted) params.set('blacklisted', showBlacklisted)
  if (dealerCategory) params.set('dealerCategory', dealerCategory)
  if (primaryFunction) params.set('primaryFunction', primaryFunction)
  const { data, isLoading } = useSWR<{ customers: Customer[]; total: number }>(
    `/api/customers?${params}`,
    fetcher,
  )

  const customers = (data?.customers ?? []).filter((c) =>
    letter ? c.lastName.toUpperCase().startsWith(letter) : true,
  )

  const count = data?.total ?? 0
  const subtitle = `${count} casual seller${count !== 1 ? 's' : ''} on record`

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
    <PageShell title="Casuals" subtitle={subtitle}>
      <div className="flex flex-col flex-1 min-h-0 gap-3">

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: colors.textMuted }} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setLetter(null) }}
              placeholder="Search by name or ID number…"
              className="pl-7 h-7 text-xs border rounded bg-white focus:outline-none"
              style={{ borderColor: colors.border, borderRadius: layout.inputRadius, width: 240 }}
              onFocus={(e) => (e.currentTarget.style.borderColor = colors.borderFocus)}
              onBlur={(e)  => (e.currentTarget.style.borderColor = colors.border)}
            />
          </div>

          <select
            className="h-7 rounded px-2 text-xs bg-white focus:outline-none border"
            style={{ color: colors.textPrimary, borderColor: colors.border }}
            value={showBlacklisted}
            onChange={(e) => setShowBlacklisted(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="false">Active Only</option>
            <option value="true">Blacklisted Only</option>
          </select>

          <select
            className="h-7 rounded px-2 text-xs bg-white focus:outline-none border"
            style={{ color: colors.textPrimary, borderColor: colors.border }}
            value={dealerCategory}
            onChange={(e) => setDealerCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            <option value="casual">Casual</option>
            <option value="dealer_1">Dealer 1</option>
            <option value="dealer_2">Dealer 2</option>
            <option value="dealer_3">Dealer 3</option>
          </select>

          <select
            className="h-7 rounded px-2 text-xs bg-white focus:outline-none border"
            style={{ color: colors.textPrimary, borderColor: colors.border }}
            value={primaryFunction}
            onChange={(e) => setPrimaryFunction(e.target.value)}
          >
            <option value="">All Functions</option>
            <option value="supplier">Supplier</option>
            <option value="customer">Customer</option>
            <option value="both">Both</option>
          </select>

          <span className="text-xs" style={{ color: colors.textSecondary }}>
            {customers.length} casual{customers.length !== 1 ? 's' : ''}
          </span>

          {isManager && (
            <div className="ml-auto">
              <button
                onClick={() => setImportOpen(true)}
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  background: '#E0E0E0',
                  border: '1px solid #999',
                  borderRadius: 2,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  color: '#212529',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
              >
                <Upload style={{ width: 9, height: 9 }} /> Import CSV
              </button>
            </div>
          )}
        </div>

        {/* A–Z quick filter */}
        <div className="flex flex-wrap gap-1 shrink-0">
          <button
            onClick={() => setLetter(null)}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: letter === null ? '#C0C0C0' : '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: 'pointer',
              color: '#212529',
              fontWeight: letter === null ? 600 : 400,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = letter === null ? '#C0C0C0' : '#E0E0E0' }}
          >
            All
          </button>
          {ALPHA.map((l) => (
            <button
              key={l}
              onClick={() => { setLetter(l === letter ? null : l); setSearch('') }}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: letter === l ? '#C0C0C0' : '#E0E0E0',
                border: '1px solid #999',
                borderRadius: 2,
                cursor: 'pointer',
                color: '#212529',
                fontWeight: letter === l ? 600 : 400,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = letter === l ? '#C0C0C0' : '#E0E0E0' }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* DataTable */}
        <div className="flex-1 min-h-0">
          <DataTable
            columns={columns}
            rows={customers}
            rowKey={(r) => r.id}
            rowActions={rowActions}
            loading={isLoading}
            emptyMessage={letter
              ? `No casual customers with surname starting with "${letter}"`
              : 'No casual customers found'}
          />
        </div>

        {importOpen && (
          <ImportCsvModal
            onClose={() => setImportOpen(false)}
            onSuccess={() => { refreshList(); setImportOpen(false) }}
          />
        )}

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
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Delete Customer</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Are you sure you want to permanently delete <strong style={{ color: colors.textPrimary }}>{deleteTarget.firstName} {deleteTarget.lastName}</strong>?
                  This action cannot be undone and will remove all associated records.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleteLoading}>Cancel</Button>
                  <button
                    onClick={() => handleDelete(deleteId)}
                    disabled={deleteLoading}
                    className="h-9 px-4 rounded text-sm font-medium text-white transition-colors disabled:opacity-50"
                    style={{ background: colors.danger }}
                  >
                    {deleteLoading ? <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" />Deleting…</span> : 'Delete'}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </PageShell>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Blacklist Customer</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            Blacklisting <strong style={{ color: colors.textPrimary }}>{customer.firstName} {customer.lastName}</strong> will prevent them from transacting.
          </p>
          <div>
            <label className="text-xs font-medium" style={{ color: colors.textSecondary }}>Reason (min 10 characters)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for blacklisting…"
              className="mt-1 border-[#E0E0E0]"
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <button
              onClick={handleSubmit}
              disabled={loading || reason.length < 10}
              className="h-9 px-4 rounded text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: colors.danger }}
            >
              {loading ? <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" />Blacklisting…</span> : 'Blacklist'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Promote to Account Modal ─────────────────────────────────────────────────
type PriceGroup = { id: string; name: string }

function PromoteToAccountModal({ customerId, customerName, onClose, onSuccess }: {
  customerId: string; customerName: string; onClose: () => void; onSuccess: () => void
}) {
  const { data: pgData } = useSWR<{ priceGroups: PriceGroup[] }>('/api/price-groups', fetcher)
  const priceGroups = pgData?.priceGroups ?? []

  const [dealerCategory,  setDealerCategory]  = useState('dealer_1')
  const [priceGroupId,    setPriceGroupId]    = useState('')
  const [primaryFunction, setPrimaryFunction] = useState('supplier')
  const [loading,         setLoading]         = useState(false)

  async function handlePromote() {
    setLoading(true)
    const res = await fetch(`/api/customers/${customerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerType: 'account',
        dealerCategory,
        primaryFunction,
        ...(priceGroupId && { priceGroupId }),
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Promote to Account</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            Promoting <strong style={{ color: colors.textPrimary }}>{customerName}</strong> to an account customer. An account code will be auto-assigned.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: colors.textSecondary }}>Dealer Category</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm bg-white focus:outline-none"
                style={{ borderColor: colors.border, color: colors.textPrimary }}
                value={dealerCategory}
                onChange={(e) => setDealerCategory(e.target.value)}
              >
                <option value="casual">Casual</option>
                <option value="dealer_1">Dealer 1</option>
                <option value="dealer_2">Dealer 2</option>
                <option value="dealer_3">Dealer 3</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: colors.textSecondary }}>Price Group (optional)</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm bg-white focus:outline-none"
                style={{ borderColor: colors.border, color: colors.textPrimary }}
                value={priceGroupId}
                onChange={(e) => setPriceGroupId(e.target.value)}
              >
                <option value="">— None —</option>
                {priceGroups.map((pg) => (
                  <option key={pg.id} value={pg.id}>{pg.name}</option>
                ))}
              </select>
            </div>

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

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <button
              onClick={handlePromote}
              disabled={loading}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: '#E0E0E0',
                border: '1px solid #999',
                borderRadius: 2,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                color: '#212529',
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#E0E0E0' }}
            >
              {loading ? <Loader2 style={{ width: 9, height: 9 }} className="animate-spin" /> : 'Promote →'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Import CSV Modal ──────────────────────────────────────────────────────────

type ImportResult = { imported: number; skipped: number; errors: { row: number; reason: string }[] }

function ImportCsvModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')

  function downloadTemplate() {
    const headers = 'idNumber,firstName,lastName,phone,dateOfBirth,gender,nationality,physicalAddress'
    const example = 'EZ12345678,John,Dlamini,76123456,1980-01-01,male,Swazi,123 Main St Mbabane'
    const blob = new Blob([headers + '\n' + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'casual-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0]
    if (!file) { toast.error('Please select a CSV file'); return }
    setLoading(true)
    setResult(null)
    const form = new FormData()
    form.append('csv', file)
    const res = await fetch('/api/casual/import', { method: 'POST', body: form })
    setLoading(false)
    const j = await res.json() as ImportResult & { error?: string }
    if (res.ok || res.status === 422) {
      setResult(j)
      if (j.imported > 0) {
        toast.success(`Imported ${j.imported} new customer${j.imported !== 1 ? 's' : ''}`)
        onSuccess()
      }
    } else {
      toast.error(j.error ?? 'Import failed')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Import Casual Customers from CSV</DialogTitle></DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Upload a CSV file with customer details. Existing customers (matched by ID number) will be updated.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-1 text-xs shrink-0 ml-3 hover:underline"
              style={{ color: colors.process }}
            >
              <Download className="w-3.5 h-3.5" /> Template
            </button>
          </div>

          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
            style={{ borderColor: colors.border }}
            onClick={() => fileRef.current?.click()}
            onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: colors.textSecondary }} />
            <p className="text-sm" style={{ color: colors.textSecondary }}>{fileName || 'Click to select a .csv file'}</p>
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Max 5 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
            />
          </div>

          {result && (
            <div className="rounded-lg p-4 space-y-2" style={{ border: `1px solid ${colors.border}` }}>
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: colors.action }}>
                <CheckCircle2 className="w-4 h-4" />
                <span>{result.imported} new customers imported · {result.skipped} updated</span>
              </div>
              {result.errors.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-sm mb-1" style={{ color: colors.danger }}>
                    <AlertCircle className="w-4 h-4" />
                    <span>{result.errors.length} row error{result.errors.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {result.errors.map((e) => (
                      <p key={e.row} className="text-xs font-mono" style={{ color: colors.danger }}>Row {e.row}: {e.reason}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Close</Button>
            <button
              onClick={handleImport}
              disabled={loading || !fileName}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: '#E0E0E0',
                border: '1px solid #999',
                borderRadius: 2,
                cursor: (loading || !fileName) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                color: '#212529',
                opacity: (loading || !fileName) ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!loading && fileName) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!loading && fileName) e.currentTarget.style.background = '#E0E0E0' }}
            >
              {loading ? <><Loader2 style={{ width: 9, height: 9 }} className="animate-spin" />Importing…</> : 'Import'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
