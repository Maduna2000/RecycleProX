'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  Search, X, RefreshCw, Images, CheckCircle2, EyeOff,
  UserPlus, Eye, Loader2, ShieldCheck, Info, LogOut,
} from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { InlineDetailPanel } from '@/components/ui/InlineDetailPanel'
import { PhotoViewerModal } from '@/components/ui/PhotoViewerModal'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Btn, Field, FilterBar, PortalPage, inp } from '@/components/rpx'

// ─── Types ────────────────────────────────────────────────────────────────────

type GateEntry = {
  id:               string
  entryNumber:      string
  purpose:          'sell' | 'buy' | 'visitor' | 'other'
  categoryName:     string | null
  vehicleReg:       string | null
  visitorFirstName: string
  visitorLastName:  string
  visitorIdNumber:  string
  createdAt:        string
  exitedAt:         string | null
  customer:         { id: string; firstName: string; lastName: string; customerType: string } | null
  operator:         { id: string; fullName: string }
  exitedBy:         { id: string; fullName: string } | null
}

type EntryDetail = GateEntry & {
  idPhotoUrl:      string | null
  vehiclePhotoUrl: string | null
  facePhotoUrl:    string | null
}

type Guard = {
  id:          string
  fullName:    string
  username:    string
  isActive:    boolean
  lastLoginAt: string | null
  createdAt:   string
}

type PurposeConfig = {
  purpose:             'sell' | 'buy' | 'visitor' | 'other'
  requireIdPhoto:      boolean
  requireVehiclePhoto: boolean
  requireFacePhoto:    boolean
}

const PURPOSE_LABELS: Record<string, string> = { sell: 'To Sell', buy: 'To Buy', visitor: 'Visitor', other: 'Other' }

const TABS = [
  { value: 'entries', label: 'Entries' },
  { value: 'guards',  label: 'Guards' },
  { value: 'config',  label: 'Purpose Config' },
] as const

const fetcher = (url: string) => fetch(url).then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json() })

function useDebounce<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function formatCompactDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Elapsed time from check-in to check-out — or to now, while still on site. */
function formatDuration(createdAt: string, exitedAt: string | null): string {
  const start = new Date(createdAt).getTime()
  const end = exitedAt ? new Date(exitedAt).getTime() : Date.now()
  const totalMinutes = Math.max(0, Math.round((end - start) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`
}


// ─── Create Guard Panel ───────────────────────────────────────────────────────

function CreateGuardPanel({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) { setFullName(''); setUsername(''); setPassword(''); setError(null); setFieldErrs({}) }
  }, [open])

  async function handleCreate() {
    setError(null); setFieldErrs({})
    if (!fullName.trim()) { setFieldErrs(p => ({ ...p, fullName: 'Required' })); return }
    if (username.length < 3) { setFieldErrs(p => ({ ...p, username: 'Min 3 characters' })); return }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setFieldErrs(p => ({ ...p, username: 'Letters, numbers and _ only' })); return }
    if (password.length < 8) { setFieldErrs(p => ({ ...p, password: 'Min 8 characters' })); return }

    setLoading(true)
    try {
      const res = await fetch('/api/gate/guards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.issues) {
          const errs: Record<string, string> = {}
          for (const i of data.issues) errs[i.path[0]] = i.message
          setFieldErrs(errs)
        } else {
          setError(data.error ?? 'Failed to create guard')
        }
        return
      }
      onCreated()
      onClose()
    } catch {
      setError('Failed to create guard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <InlineDetailPanel open={open} onClose={onClose} title="Create Security Guard" height={340}>
      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSecondary, display: 'block', marginBottom: 3 }}>Full Name *</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} className="w-full border px-3 py-1.5 focus:outline-none focus:border-[#185ABD]" style={{ fontSize: fontSize.sm, borderColor: fieldErrs.fullName ? colors.danger : '#E0E0E0', borderRadius: 2 }} placeholder="John Doe" />
            {fieldErrs.fullName && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{fieldErrs.fullName}</p>}
          </div>
          <div>
            <label style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSecondary, display: 'block', marginBottom: 3 }}>Username *</label>
            <input value={username} onChange={e => setUsername(e.target.value)} className="w-full border px-3 py-1.5 focus:outline-none focus:border-[#185ABD]" style={{ fontSize: fontSize.sm, borderColor: fieldErrs.username ? colors.danger : '#E0E0E0', borderRadius: 2 }} placeholder="john_gate" />
            {fieldErrs.username && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{fieldErrs.username}</p>}
          </div>
        </div>
        <div>
          <label style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSecondary, display: 'block', marginBottom: 3 }}>Password *</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="w-full border px-3 py-1.5 pr-9 focus:outline-none focus:border-[#185ABD]" style={{ fontSize: fontSize.sm, borderColor: fieldErrs.password ? colors.danger : '#E0E0E0', borderRadius: 2 }} placeholder="Min 8 characters" />
            <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6C757D] hover:text-[#212529]">
              {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          {fieldErrs.password && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{fieldErrs.password}</p>}
        </div>
        {error && <p style={{ fontSize: fontSize.xs, color: colors.danger }}>{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" variant="primary" onClick={handleCreate} loading={loading}>Create Guard</Btn>
        </div>
      </div>
    </InlineDetailPanel>
  )
}

// ─── Entries Tab ──────────────────────────────────────────────────────────────

function EntriesTab() {
  const [search, setSearch] = useState('')
  const [purpose, setPurpose] = useState('')
  const [onSiteOnly, setOnSiteOnly] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const [entries, setEntries] = useState<GateEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [photoEntry, setPhotoEntry] = useState<EntryDetail | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)

  const debouncedSearch = useDebounce(search, 300)
  const abortRef = useRef<AbortController | null>(null)

  const hasFilters = !!(search || purpose || onSiteOnly || dateFrom || dateTo)

  function clearFilters() {
    setSearch(''); setPurpose(''); setOnSiteOnly(false); setDateFrom(''); setDateTo(''); setPage(1)
  }

  const fetchEntries = useCallback(async (pg: number) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const params = new URLSearchParams({
      page: String(pg), pageSize: '50',
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(purpose          && { purpose }),
      ...(onSiteOnly       && { onSiteOnly: 'true' }),
      ...(dateFrom         && { dateFrom }),
      ...(dateTo           && { dateTo }),
    })

    setLoading(true); setError(null)
    try {
      const data = await fetcher(`/api/gate/entries?${params}`)
      setEntries(data.entries ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Failed to load entries')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, purpose, onSiteOnly, dateFrom, dateTo])

  const prevFiltersRef = useRef({ debouncedSearch, purpose, onSiteOnly, dateFrom, dateTo })
  useEffect(() => {
    const prev = prevFiltersRef.current
    const changed = prev.debouncedSearch !== debouncedSearch || prev.purpose !== purpose ||
      prev.onSiteOnly !== onSiteOnly || prev.dateFrom !== dateFrom || prev.dateTo !== dateTo
    prevFiltersRef.current = { debouncedSearch, purpose, onSiteOnly, dateFrom, dateTo }
    if (changed) { setPage(1); fetchEntries(1) } else { fetchEntries(page) }
  }, [fetchEntries, page, debouncedSearch, purpose, onSiteOnly, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function openPhotos(entry: GateEntry) {
    setPhotoLoading(true)
    try {
      const detail: EntryDetail = await fetcher(`/api/gate/entries/${entry.id}`)
      setPhotoEntry(detail)
    } catch {
      toast.error('Failed to load photos')
    } finally {
      setPhotoLoading(false)
    }
  }

  const [checkingOutId, setCheckingOutId] = useState<string | null>(null)

  async function handleCheckout(entry: GateEntry) {
    setCheckingOutId(entry.id)
    try {
      const res = await fetch(`/api/gate/entries/${entry.id}/checkout`, { method: 'PATCH' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed to check out') }
      const updated: GateEntry = await res.json()
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to check out')
    } finally {
      setCheckingOutId(null)
    }
  }

  const columns: Column<GateEntry>[] = [
    {
      key: 'entryNumber', header: 'Entry #', width: '128px',
      render: (e) => <span style={{ fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.process }}>{e.entryNumber}</span>,
    },
    {
      key: 'createdAt', header: 'Check In', width: '98px',
      render: (e) => <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{formatCompactDateTime(e.createdAt)}</span>,
    },
    {
      key: 'exitedAt', header: 'Check Out', width: '98px',
      render: (e) => e.exitedAt
        ? <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{formatCompactDateTime(e.exitedAt)}</span>
        : <StatusBadge status="on site" />,
    },
    {
      key: 'duration', header: 'Duration', width: '78px',
      render: (e) => (
        <span style={{ fontSize: fontSize.xs, color: e.exitedAt ? colors.textSecondary : colors.process, fontWeight: e.exitedAt ? fontWeight.regular : fontWeight.medium }}>
          {formatDuration(e.createdAt, e.exitedAt)}
        </span>
      ),
    },
    {
      key: 'visitor', header: 'Visitor', width: '148px',
      render: (e) => {
        const name = `${e.visitorFirstName} ${e.visitorLastName}`
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate" title={name} style={{ fontSize: fontSize.xs }}>{name}</span>
            {e.customer && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: colors.processBg, color: colors.process }}>
                Customer
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'purpose', header: 'Purpose', width: '72px',
      render: (e) => <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{PURPOSE_LABELS[e.purpose] ?? e.purpose}</span>,
    },
    {
      key: 'categoryName', header: 'Category', width: '98px',
      render: (e) => <span className="truncate block" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{e.categoryName ?? '—'}</span>,
    },
    {
      key: 'vehicleReg', header: 'Vehicle Reg', width: '88px',
      render: (e) => <span style={{ fontFamily: 'monospace', fontSize: fontSize.xs }}>{e.vehicleReg ?? '—'}</span>,
    },
    {
      key: 'operator', header: 'Guard', width: '104px',
      render: (e) => <span className="truncate block" title={e.operator.fullName} style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{e.operator.fullName}</span>,
    },
  ]

  const rowActions: RowAction<GateEntry>[] = [
    { label: 'View Photos', icon: Images, onClick: openPhotos },
    {
      label:  'Check Out',
      icon:   LogOut,
      hidden: (e) => !!e.exitedAt || checkingOutId === e.id,
      onClick: handleCheckout,
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <FilterBar>
        <Field label="Search" width={230}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search entry #, name, vehicle reg…"
              style={{ ...inp, paddingLeft: 26 }}
            />
          </div>
        </Field>
        <Field label="Purpose" width={130}>
          <select style={inp} value={purpose} onChange={e => { setPurpose(e.target.value); setPage(1) }}>
            <option value="">All Purposes</option>
            <option value="sell">To Sell</option>
            <option value="buy">To Buy</option>
            <option value="visitor">Visitor</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="From" width={140}>
          <input type="date" style={inp} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
        </Field>
        <Field label="To" width={140}>
          <input type="date" style={inp} value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
        </Field>
        <Field label={' '}>
          <label className="flex items-center gap-1.5" style={{ height: 30, fontSize: 12, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={onSiteOnly} onChange={e => { setOnSiteOnly(e.target.checked); setPage(1) }} />
            On site only
          </label>
        </Field>
        {hasFilters && (
          <Field label={' '}>
            <Btn size="sm" icon={X} onClick={clearFilters}>Reset</Btn>
          </Field>
        )}
        <Field label={' '}>
          <Btn size="sm" icon={RefreshCw} onClick={() => fetchEntries(page)} title="Refresh" />
        </Field>
        <span style={{ fontSize: 11, color: '#6C757D', marginLeft: 'auto', paddingBottom: 8 }}>
          {total} entr{total !== 1 ? 'ies' : 'y'}
        </span>
      </FilterBar>

      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={columns}
          rows={entries}
          rowKey={e => e.id}
          rowActions={rowActions}
          loading={loading || photoLoading}
          error={error ?? undefined}
          emptyMessage="No gate entries found"
          total={total}
          page={page}
          pageSize={50}
          onPageChange={setPage}
        />
      </div>

      {photoEntry && (
        <PhotoViewerModal
          title={`Photos — ${photoEntry.entryNumber}`}
          subtitle={`${photoEntry.visitorFirstName} ${photoEntry.visitorLastName}`}
          photos={[
            { label: 'ID Document',  url: photoEntry.idPhotoUrl },
            { label: 'Vehicle',      url: photoEntry.vehiclePhotoUrl },
            { label: 'Visitor Face', url: photoEntry.facePhotoUrl },
          ].filter((p): p is { label: string; url: string } => !!p.url)}
          onClose={() => setPhotoEntry(null)}
        />
      )}
    </div>
  )
}

// ─── Guards Tab ───────────────────────────────────────────────────────────────

function GuardsTab() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const [guards, setGuards] = useState<Guard[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const fetchGuards = useCallback(async (pg: number) => {
    const params = new URLSearchParams({ page: String(pg), limit: '50', ...(debouncedSearch && { search: debouncedSearch }) })
    setLoading(true); setError(null)
    try {
      const data = await fetcher(`/api/gate/guards?${params}`)
      setGuards(data.users ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setError('Failed to load guards')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  useEffect(() => { fetchGuards(page) }, [fetchGuards, page])
  useEffect(() => { setPage(1); fetchGuards(1) }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAction(g: Guard, action: 'deactivate' | 'reactivate') {
    setActionLoading(g.id)
    try {
      const res = await fetch(`/api/gate/guards/${g.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      const updated: Guard = await res.json()
      setGuards(prev => prev.map(x => x.id === updated.id ? updated : x))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const columns: Column<Guard>[] = [
    { key: 'fullName', header: 'Full Name', width: '200px', render: (g) => <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{g.fullName}</span> },
    { key: 'username', header: 'Username', width: '150px', render: (g) => <span style={{ fontSize: fontSize.xs, fontFamily: 'monospace', color: colors.textSecondary }}>{g.username}</span> },
    { key: 'isActive', header: 'Status', width: '90px', render: (g) => <StatusBadge status={g.isActive ? 'active' : 'inactive'} /> },
    { key: 'lastLoginAt', header: 'Last Login', width: '140px', render: (g) => <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{g.lastLoginAt ? new Date(g.lastLoginAt).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}</span> },
    { key: 'createdAt', header: 'Created', width: '120px', render: (g) => <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{new Date(g.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}</span> },
  ]

  const rowActions: RowAction<Guard>[] = isAdmin ? [
    { label: 'Deactivate', icon: EyeOff, danger: true, hidden: (g) => !g.isActive || actionLoading === g.id, onClick: (g) => handleAction(g, 'deactivate') },
    { label: 'Reactivate', icon: CheckCircle2, hidden: (g) => g.isActive || actionLoading === g.id, onClick: (g) => handleAction(g, 'reactivate') },
  ] : []

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <FilterBar>
        <Field label="Search" width={230}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or username…"
              style={{ ...inp, paddingLeft: 26 }}
            />
          </div>
        </Field>
        <span style={{ marginLeft: 'auto', paddingBottom: 8 }}>
          <Btn size="sm" variant="primary" icon={UserPlus} onClick={() => setShowCreate(true)}>Create Guard</Btn>
        </span>
      </FilterBar>

      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0" style={{ padding: 10 }}>
          <DataTable
            columns={columns}
            rows={guards}
            rowKey={g => g.id}
            rowActions={rowActions}
            loading={loading}
            error={error ?? undefined}
            emptyMessage="No security guards found — create one to get started"
            total={total}
            page={page}
            pageSize={50}
            onPageChange={setPage}
          />
        </div>

        <CreateGuardPanel open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { fetchGuards(1); setPage(1) }} />
      </div>
    </div>
  )
}

// ─── Purpose Config Tab ───────────────────────────────────────────────────────

function ConfigTab() {
  const [configs, setConfigs] = useState<PurposeConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const fetchConfigs = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetcher('/api/gate/purpose-config')
      setConfigs(data.configs ?? [])
    } catch {
      setError('Failed to load purpose configuration')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])

  async function handleToggle(purpose: string, field: keyof Omit<PurposeConfig, 'purpose' | 'requireFacePhoto'>, value: boolean) {
    const config = configs.find(c => c.purpose === purpose)
    if (!config) return

    setConfigs(prev => prev.map(c => c.purpose === purpose ? { ...c, [field]: value } : c))
    setSaving(purpose)
    try {
      const body = {
        requireIdPhoto:      field === 'requireIdPhoto'      ? value : config.requireIdPhoto,
        requireVehiclePhoto: field === 'requireVehiclePhoto' ? value : config.requireVehiclePhoto,
        requireFacePhoto:    false,
      }
      const res = await fetch(`/api/gate/purpose-config/${purpose}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to save')
    } catch {
      fetchConfigs()
      toast.error('Failed to save configuration')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.process }} /></div>
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p style={{ fontSize: fontSize.sm, color: colors.danger }}>{error}</p>
        <button onClick={fetchConfigs} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border" style={{ borderColor: colors.border, borderRadius: 2 }}>
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 p-3" style={{ background: colors.processBg, border: `1px solid ${colors.process}20`, borderRadius: 2 }}>
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: colors.process }} />
        <div style={{ fontSize: fontSize.xs, color: colors.textPrimary }}>
          <p className="font-medium">Configure Required Photos</p>
          <p style={{ color: colors.textSecondary, marginTop: 2 }}>
            Enable or disable which photos a guard must capture for each entry purpose.
            Both photo types are always available to capture — only the required ones block Continue.
          </p>
        </div>
      </div>

      <div className="bg-white border" style={{ borderColor: colors.border, borderRadius: 2 }}>
        <div className="grid items-center px-4 py-2 border-b" style={{ gridTemplateColumns: '1fr 100px 100px', borderColor: colors.border, background: colors.bg }}>
          <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Purpose</span>
          <span className="text-center" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ID Photo</span>
          <span className="text-center" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vehicle</span>
        </div>

        {configs.map((config) => (
          <div key={config.purpose} className="grid items-center px-4 py-2.5 border-b last:border-b-0" style={{ gridTemplateColumns: '1fr 100px 100px', borderColor: colors.border, background: saving === config.purpose ? colors.bg : 'transparent' }}>
            <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{PURPOSE_LABELS[config.purpose] ?? config.purpose}</span>
            <div className="flex justify-center">
              <ToggleSwitch checked={config.requireIdPhoto} disabled={saving === config.purpose} onChange={(v) => handleToggle(config.purpose, 'requireIdPhoto', v)} />
            </div>
            <div className="flex justify-center">
              <ToggleSwitch checked={config.requireVehiclePhoto} disabled={saving === config.purpose} onChange={(v) => handleToggle(config.purpose, 'requireVehiclePhoto', v)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ToggleSwitch({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: checked ? colors.action : colors.border }}
      role="switch"
      aria-checked={checked}
    >
      <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform" style={{ transform: checked ? 'translateX(18px)' : 'translateX(3px)' }} />
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function GateManagementInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const initial = tabParam === 'guards' ? 'guards' : tabParam === 'config' ? 'config' : 'entries'
  const [activeTab, setActiveTab] = useState(initial)

  function changeTab(value: string) {
    setActiveTab(value)
    const query = value === 'guards' ? '?tab=guards' : value === 'config' ? '?tab=config' : ''
    router.replace(`/app/gate${query}`, { scroll: false })
  }

  return (
    <PortalPage
      tabs={[...TABS]}
      active={activeTab}
      onChange={changeTab}
      actions={
        <Btn size="sm" icon={ShieldCheck} href="/gate" target="_blank">
          Open Guard Station
        </Btn>
      }
    >
      {activeTab === 'entries' && <EntriesTab />}
      {activeTab === 'guards'  && <GuardsTab />}
      {activeTab === 'config'  && <ConfigTab />}
    </PortalPage>
  )
}

export default function GateManagementPage() {
  return (
    <Suspense>
      <GateManagementInner />
    </Suspense>
  )
}
