'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

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
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

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

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: colors.textSecondary }}>
        Access restricted to administrators.
      </div>
    )
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0
  const subtitle = data ? `${data.total.toLocaleString()} entries` : 'System activity trail'

  return (
    <PageShell title="Audit Log" subtitle={subtitle}>
      <div className="flex flex-col flex-1 min-h-0 gap-3">

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end shrink-0 rounded-lg p-3 bg-white" style={{ border: `1px solid ${colors.border}` }}>
          <div>
            <Label className="text-xs" style={{ color: colors.textSecondary }}>Table</Label>
            <Input
              value={table}
              onChange={(e) => { setTable(e.target.value); setPage(1) }}
              placeholder="e.g. Purchase"
              className="mt-1 w-36 h-7 text-xs border-[#E0E0E0]"
            />
          </div>
          <div>
            <Label className="text-xs" style={{ color: colors.textSecondary }}>Action</Label>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1) }}
              className="mt-1 h-7 rounded px-2 text-xs w-32 focus:outline-none focus:border-[#185ABD]"
              style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary, background: colors.surface }}
            >
              <option value="">All</option>
              {(['INSERT','UPDATE','DELETE','VOID','LOGIN','LOGOUT'] as const).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs" style={{ color: colors.textSecondary }}>From</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className="mt-1 w-36 h-7 text-xs border-[#E0E0E0]" />
          </div>
          <div>
            <Label className="text-xs" style={{ color: colors.textSecondary }}>To</Label>
            <Input type="date" value={to} max={today} onChange={(e) => { setTo(e.target.value); setPage(1) }} className="mt-1 w-36 h-7 text-xs border-[#E0E0E0]" />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg" style={{ border: `1px solid ${colors.border}` }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-40" style={{ color: colors.textSecondary }}>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="w-full bg-white">
              <thead style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.border}` }}>
                <tr>
                  {['Time', 'Action', 'Table', 'Record ID', 'User', 'IP', ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-2" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(!data?.items.length) && (
                  <tr><td colSpan={7} className="text-center py-12 text-sm" style={{ color: colors.textSecondary }}>No entries found</td></tr>
                )}
                {data?.items.map((entry) => (
                  <>
                    <tr
                      key={entry.id}
                      className="cursor-pointer"
                      style={{ borderBottom: `1px solid ${colors.neutralBg}` }}
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                        {new Date(entry.createdAt).toLocaleString('en-ZA')}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold" style={ACTION_STYLES[entry.action]}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{entry.tableName}</td>
                      <td className="px-4 py-2.5 font-mono max-w-[120px] truncate" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{entry.recordId}</td>
                      <td className="px-4 py-2.5" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>
                        {entry.changedByName ?? (entry.changedById ? entry.changedById.substring(0, 8) + '…' : '—')}
                      </td>
                      <td className="px-4 py-2.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{entry.ipAddress ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: colors.textSecondary }}>{expanded === entry.id ? '▲' : '▼'}</td>
                    </tr>
                    {expanded === entry.id && (
                      <tr key={`${entry.id}-detail`} style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.neutralBg}` }}>
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
          <div className="flex items-center justify-between text-sm shrink-0" style={{ color: colors.textSecondary }}>
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="h-7 w-7 flex items-center justify-center rounded transition-colors disabled:opacity-40"
                style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary, background: colors.surface }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
                onMouseLeave={(e) => (e.currentTarget.style.background = colors.surface)}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="h-7 w-7 flex items-center justify-center rounded transition-colors disabled:opacity-40"
                style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary, background: colors.surface }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.toolbar)}
                onMouseLeave={(e) => (e.currentTarget.style.background = colors.surface)}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
