'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { fetcher } from '@/lib/swrFetcher'
import {
  Search, X, RefreshCw, Images, CheckCircle2, EyeOff,
  UserPlus, Eye, Info, LogOut, Package, Plus, Pencil, Trash2,
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { InlineDetailPanel } from '@/components/ui/InlineDetailPanel'
import { PhotoViewerModal } from '@/components/ui/PhotoViewerModal'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Btn, Field, FilterBar, inp } from '@/components/rpx'

// ─── Types ────────────────────────────────────────────────────────────────────

type GateEntry = {
  id:               string
  entryNumber:      string
  purpose:          'sell' | 'buy' | 'visitor' | 'other'
  categoryNames:    string[]
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

export function EntriesTab() {
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
      page: String(pg), pageSize: '30',
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
      key: 'categoryNames', header: 'Category', width: '98px',
      render: (e) => (
        <span className="truncate block" title={e.categoryNames.join(', ')} style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {e.categoryNames.length > 0 ? e.categoryNames.join(', ') : '—'}
        </span>
      ),
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
            <input
              type="checkbox"
              checked={onSiteOnly}
              onChange={e => { setOnSiteOnly(e.target.checked); setPage(1) }}
              style={{ accentColor: colors.primary, cursor: 'pointer', width: 14, height: 14 }}
            />
            On site only
          </label>
        </Field>
        {hasFilters && (
          <Field label={' '}>
            <Btn size="sm" icon={X} onClick={clearFilters}>Reset</Btn>
          </Field>
        )}
        <Field label={' '}>
          <Btn size="sm" icon={RefreshCw} onClick={() => fetchEntries(page)} title="Refresh">Refresh</Btn>
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
          pageSize={30}
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

export function GuardsTab() {
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
    const params = new URLSearchParams({ page: String(pg), limit: '30', ...(debouncedSearch && { search: debouncedSearch }) })
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
            pageSize={30}
            onPageChange={setPage}
          />
        </div>

        <CreateGuardPanel open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { fetchGuards(1); setPage(1) }} />
      </div>
    </div>
  )
}

// ─── Purpose Config Tab ───────────────────────────────────────────────────────

export function ConfigTab() {
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

  const columns: Column<PurposeConfig>[] = [
    {
      key: 'purpose', header: 'Purpose',
      render: (c) => (
        <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
          {PURPOSE_LABELS[c.purpose] ?? c.purpose}
        </span>
      ),
    },
    {
      key: 'requireIdPhoto', header: 'ID Photo', width: '100px',
      render: (c) => (
        <div className="flex justify-center">
          <ToggleSwitch checked={c.requireIdPhoto} disabled={saving === c.purpose} onChange={(v) => handleToggle(c.purpose, 'requireIdPhoto', v)} />
        </div>
      ),
    },
    {
      key: 'requireVehiclePhoto', header: 'Vehicle', width: '100px',
      render: (c) => (
        <div className="flex justify-center">
          <ToggleSwitch checked={c.requireVehiclePhoto} disabled={saving === c.purpose} onChange={(v) => handleToggle(c.purpose, 'requireVehiclePhoto', v)} />
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: 10 }}>
        <div className="flex flex-col gap-4" style={{ paddingBottom: 16 }}>
          <div className="flex items-start gap-3 p-3" style={{ background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 2 }}>
            <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: colors.process }} />
            <div style={{ fontSize: fontSize.xs, color: colors.textPrimary }}>
              <p className="font-medium">Configure Required Photos</p>
              <p style={{ color: colors.textSecondary, marginTop: 2 }}>
                Enable or disable which photos a guard must capture for each entry purpose.
                Both photo types are always available to capture — only the required ones block Continue.
              </p>
            </div>
          </div>

          <div style={{ height: 190 }}>
            <DataTable
              columns={columns}
              rows={configs}
              rowKey={c => c.purpose}
              loading={loading}
              error={error ?? undefined}
              emptyMessage="No purpose configurations found"
            />
          </div>

          <SellCategoriesSection />
        </div>
      </div>
    </div>
  )
}

// ─── Sell Categories (admin-managed picklist for the "sell" purpose) ────────

function SellIcon({ name, size = 14 }: { name: string | null; size?: number }) {
  if (!name) return <Package style={{ width: size, height: size }} />
  const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[name]
  return Icon ? <Icon style={{ width: size, height: size }} /> : <Package style={{ width: size, height: size }} />
}

const ICON_PRESETS = ['Layers', 'Zap', 'Cpu', 'Package', 'Archive', 'FileText', 'Monitor', 'Box', 'Recycle', 'Truck', 'Factory', 'Leaf']

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {ICON_PRESETS.map(name => (
        <button
          key={name}
          type="button"
          title={name}
          onClick={() => onChange(value === name ? '' : name)}
          style={{
            width: 28, height: 28, borderRadius: 4, border: `1px solid ${value === name ? colors.action : colors.border}`,
            background: value === name ? `${colors.action}18` : '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: value === name ? colors.action : colors.textSecondary,
          }}
        >
          <SellIcon name={name} size={14} />
        </button>
      ))}
    </div>
  )
}

type SellOption = {
  id:        string
  label:     string
  colorHex:  string | null
  iconName:  string | null
  sortOrder: number
  isActive:  boolean
}

function SellCategoriesSection() {
  const [options,  setOptions]  = useState<SellOption[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('#607D8B')
  const [newIcon,  setNewIcon]  = useState('')
  const [adding,   setAdding]   = useState(false)

  const [editId,    setEditId]    = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editIcon,  setEditIcon]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState<string | null>(null)

  const fetchOptions = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetcher('/api/gate/sell-options?all=1')
      setOptions(data.options ?? [])
    } catch {
      setError('Failed to load sell categories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchOptions() }, [fetchOptions])

  async function handleAdd() {
    if (!newLabel.trim()) return
    setAdding(true)
    const res = await fetch('/api/gate/sell-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim(), colorHex: newColor, iconName: newIcon || null }),
    })
    setAdding(false)
    if (res.ok) { toast.success('Category added'); setNewLabel(''); setNewIcon(''); fetchOptions() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to add category') }
  }

  function startEdit(opt: SellOption) {
    setEditId(opt.id)
    setEditLabel(opt.label)
    setEditColor(opt.colorHex ?? '#607D8B')
    setEditIcon(opt.iconName ?? '')
  }

  async function handleSaveEdit(id: string) {
    setSaving(true)
    const res = await fetch(`/api/gate/sell-options/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editLabel.trim(), colorHex: editColor, iconName: editIcon || null }),
    })
    setSaving(false)
    if (res.ok) { toast.success('Category updated'); setEditId(null); fetchOptions() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to update category') }
  }

  async function handleToggleActive(opt: SellOption) {
    const res = await fetch(`/api/gate/sell-options/${opt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !opt.isActive }),
    })
    if (res.ok) {
      setOptions(prev => prev.map(o => o.id === opt.id ? { ...o, isActive: !opt.isActive } : o))
    } else {
      const j = await res.json(); toast.error(j.error ?? 'Failed to update category')
    }
  }

  async function handleDelete(opt: SellOption) {
    setDeleting(opt.id)
    const res = await fetch(`/api/gate/sell-options/${opt.id}`, { method: 'DELETE' })
    setDeleting(null)
    if (res.ok) { toast.success('Category deleted'); fetchOptions() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to delete category') }
  }

  return (
    <div className="shrink-0">
      <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: 4 }}>Sell Categories</p>
      <p style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: 8 }}>
        These are the options a guard picks from when someone enters to sell — configured independently of the Products catalogue. A guard can select more than one.
      </p>

      <div style={{ maxHeight: 320, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 3, background: '#fff' }}>
        {loading ? (
          <p style={{ padding: 16, textAlign: 'center', fontSize: fontSize.xs, color: colors.textSecondary }}>Loading…</p>
        ) : error ? (
          <p style={{ padding: 16, textAlign: 'center', fontSize: fontSize.xs, color: colors.danger }}>{error}</p>
        ) : options.length === 0 ? (
          <p style={{ padding: 16, textAlign: 'center', fontSize: fontSize.xs, color: colors.textSecondary }}>No sell categories yet</p>
        ) : options.map((opt) => (
          <div key={opt.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
            {editId === opt.id ? (
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)}
                    style={{ width: 26, height: 26, borderRadius: 3, border: `1px solid ${colors.border}`, cursor: 'pointer', padding: 1 }} />
                  <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                    style={{ flex: 1, height: 26, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '0 6px', fontSize: 12, outline: 'none' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveEdit(opt.id); if (e.key === 'Escape') setEditId(null) }}
                    autoFocus />
                </div>
                <IconPicker value={editIcon} onChange={setEditIcon} />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                  <Btn size="sm" variant="primary" onClick={() => void handleSaveEdit(opt.id)} loading={saving} disabled={!editLabel.trim()}>Save</Btn>
                  <Btn size="sm" onClick={() => setEditId(null)} disabled={saving}>Cancel</Btn>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: opt.colorHex ?? '#607D8B', display: 'inline-block', flexShrink: 0 }} />
                {opt.iconName && <SellIcon name={opt.iconName} size={12} />}
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: opt.isActive ? colors.textPrimary : colors.textMuted }}>{opt.label}</span>
                <ToggleSwitch checked={opt.isActive} disabled={deleting === opt.id} onChange={() => void handleToggleActive(opt)} />
                <button onClick={() => startEdit(opt)} title="Edit" style={{ padding: 4, color: colors.textSecondary, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => void handleDelete(opt)} title="Delete" disabled={deleting === opt.id} style={{ padding: 4, color: colors.danger, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ background: colors.neutralBg, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '10px 12px', marginTop: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Sell Category</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
            style={{ width: 32, height: 28, borderRadius: 3, border: `1px solid ${colors.border}`, cursor: 'pointer', padding: 2 }} />
          <input placeholder="Category name…" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
            style={{ flex: 1, height: 28, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '0 8px', fontSize: 12, outline: 'none', background: '#fff' }} />
          <Btn size="sm" variant="primary" icon={Plus} onClick={() => void handleAdd()} loading={adding} disabled={!newLabel.trim()}>Add</Btn>
        </div>
        <IconPicker value={newIcon} onChange={setNewIcon} />
      </div>
    </div>
  )
}
