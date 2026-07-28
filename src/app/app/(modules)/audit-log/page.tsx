'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, ChevronDown, Loader2, X } from 'lucide-react'
import { colors, fontSize, fontWeight, badgeStyle } from '@/lib/design-tokens'
import { inp, Btn, Field, PortalPage, FilterBar, TH, HEADER_GRAD } from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type AuditEntry = {
  id:             string
  tableName:      string
  recordId:       string
  action:         'INSERT' | 'UPDATE' | 'DELETE' | 'VOID' | 'LOGIN' | 'LOGOUT'
  oldValues:      Record<string, unknown> | null
  newValues:      Record<string, unknown> | null
  changedById:    string | null
  changedByName:  string | null
  ipAddress:      string | null
  createdAt:      string
}

type AuditResponse = {
  items:    AuditEntry[]
  total:    number
  page:     number
  pageSize: number
}

const ACTION_STYLES: Record<AuditEntry['action'], { background: string; color: string }> = {
  INSERT:  { background: colors.actionBg,  color: colors.action },
  UPDATE:  { background: colors.processBg, color: colors.process },
  DELETE:  { background: colors.dangerBg,  color: colors.danger },
  VOID:    { background: colors.warningBg, color: colors.warning },
  LOGIN:   { background: colors.neutralBg, color: colors.textSecondary },
  LOGOUT:  { background: colors.neutralBg, color: colors.textSecondary },
}

const PAGE_SIZE = 50

export default function AuditLogPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const exportFired = useRef(false)

  const today = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const [table,    setTable]    = useState('')
  const [action,   setAction]   = useState('')
  const [from,     setFrom]     = useState('')
  const [to,       setTo]       = useState(today)
  const [page,     setPage]     = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const qs = new URLSearchParams({
    page:     String(page),
    pageSize: String(PAGE_SIZE),
    ...(table  && { table }),
    ...(action && { action }),
    ...(from   && { from }),
    ...(to     && { to }),
  }).toString()

  const { data, isLoading } = useSWR<AuditResponse>(
    isAdmin ? `/api/audit-log?${qs}` : null,
    fetcher
  )

  async function handleToolbarExport() {
    const toastId = toast.loading('Exporting audit log…')
    try {
      const exportQs = new URLSearchParams({
        ...(table  && { table }),
        ...(action && { action }),
        ...(from   && { from }),
        ...(to     && { to }),
      })
      const res = await fetch(`/api/audit-log/export?${exportQs}`)
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Export failed') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${today}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded', { id: toastId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export', { id: toastId })
    } finally {
      exportFired.current = false
    }
  }

  // Toolbar Export deep-link (?export=1)
  useEffect(() => {
    if (searchParams.get('export') === '1' && isAdmin && !exportFired.current) {
      exportFired.current = true
      router.replace('/app/audit-log', { scroll: false })
      void handleToolbarExport()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isAdmin, router])

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: colors.textSecondary }}>
        Access restricted to administrators.
      </div>
    )
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0
  const hasFilters = !!(table || action || from)

  const fromIdx = (page - 1) * PAGE_SIZE + 1
  const toIdx   = Math.min(page * PAGE_SIZE, data?.total ?? 0)
  const showing  = data?.total
    ? `Showing ${fromIdx}–${toIdx} of ${data.total.toLocaleString()}`
    : ''

  function clearFilters() { setTable(''); setAction(''); setFrom(''); setTo(today); setPage(1) }

  return (
    <PortalPage title="Audit Log">
      <FilterBar>
        <Field label="Table" width={150}>
          <input
            value={table}
            onChange={(e) => { setTable(e.target.value); setPage(1) }}
            placeholder="Table name…"
            style={inp}
          />
        </Field>
        <Field label="Action" width={130}>
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            style={inp}
          >
            <option value="">All Actions</option>
            {(['INSERT','UPDATE','DELETE','VOID','LOGIN','LOGOUT'] as const).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="From" width={145}>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1) }}
            style={inp}
          />
        </Field>
        <Field label="To" width={145}>
          <input
            type="date"
            value={to}
            max={today}
            onChange={(e) => { setTo(e.target.value); setPage(1) }}
            style={inp}
          />
        </Field>
        {hasFilters && (
          <Btn size="sm" icon={X} onClick={clearFilters}>Clear</Btn>
        )}
      </FilterBar>

      <div className="flex flex-col flex-1 min-h-0 gap-3" style={{ padding: 10 }}>
        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-white" style={{ border: '1px solid #B0B0B0', borderRadius: 3 }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-40" style={{ color: colors.textSecondary }}>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="w-full bg-white border-collapse">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
                  {['Time', 'Action', 'Table', 'Record ID', 'User', 'IP', ''].map((h, i) => (
                    <th
                      key={i}
                      style={TH}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(!data?.items.length) && (
                  <tr><td colSpan={7} className="text-center py-12 text-sm" style={{ color: colors.textSecondary }}>No entries found</td></tr>
                )}
                {data?.items.map((entry, idx) => (
                  <>
                    <tr
                      key={entry.id}
                      className="cursor-pointer"
                      style={{ background: idx % 2 === 1 ? colors.neutralBg : colors.surface, borderBottom: `1px solid ${colors.border}` }}
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.rowHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? colors.neutralBg : colors.surface)}
                    >
                      <td className="px-3" style={{ height: 30, fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {new Date(entry.createdAt).toLocaleString('en-ZA')}
                      </td>
                      <td className="px-3" style={{ height: 30 }}>
                        <span style={badgeStyle(ACTION_STYLES[entry.action].color, ACTION_STYLES[entry.action].background)}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-3" style={{ height: 30, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{entry.tableName}</td>
                      <td className="px-3" style={{ height: 30, fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.recordId}</td>
                      <td className="px-3" style={{ height: 30, fontSize: fontSize.sm, color: colors.textPrimary }}>
                        {entry.changedByName ?? (entry.changedById ? entry.changedById.substring(0, 8) + '…' : '—')}
                      </td>
                      <td className="px-3" style={{ height: 30, fontSize: fontSize.xs, color: colors.textSecondary }}>{entry.ipAddress ?? '—'}</td>
                      <td className="px-3" style={{ height: 30, color: colors.textSecondary }}>
                        {expanded === entry.id
                          ? <ChevronDown style={{ width: 12, height: 12 }} />
                          : <ChevronRight style={{ width: 12, height: 12 }} />}
                      </td>
                    </tr>
                    {expanded === entry.id && (
                      <tr key={`${entry.id}-detail`} style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}`, borderLeft: `3px solid ${colors.process}` }}>
                        <td colSpan={7} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="font-semibold mb-1" style={{ color: colors.textSecondary }}>Old Values</p>
                              <pre className="rounded p-2 overflow-x-auto max-h-40 bg-white" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                {entry.oldValues ? JSON.stringify(entry.oldValues, null, 2) : 'null'}
                              </pre>
                            </div>
                            <div>
                              <p className="font-semibold mb-1" style={{ color: colors.textSecondary }}>New Values</p>
                              <pre className="rounded p-2 overflow-x-auto max-h-40 bg-white" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                {entry.newValues ? JSON.stringify(entry.newValues, null, 2) : 'null'}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-0.5 shrink-0">
            <span style={{ fontSize: 11, color: colors.textSecondary }}>{showing}</span>
            <div className="flex items-center gap-1">
              <Btn size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(p => p - 1)} />
              <Btn size="sm" icon={ChevronRight} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} />
            </div>
          </div>
        )}
      </div>
    </PortalPage>
  )
}
