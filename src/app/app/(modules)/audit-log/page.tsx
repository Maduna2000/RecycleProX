'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight, layout } from '@/lib/design-tokens'

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
  const subtitle   = data ? `${data.total.toLocaleString()} entries` : 'System activity trail'
  const hasFilters = !!(table || action || from)

  const fromIdx = (page - 1) * PAGE_SIZE + 1
  const toIdx   = Math.min(page * PAGE_SIZE, data?.total ?? 0)
  const showing  = data?.total
    ? `Showing ${fromIdx}–${toIdx} of ${data.total.toLocaleString()}`
    : ''

  function clearFilters() { setTable(''); setAction(''); setFrom(''); setTo(today); setPage(1) }

  return (
    <PageShell title="Audit Log" subtitle={subtitle}>
      <div className="flex flex-col flex-1 min-h-0 gap-3">

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            value={table}
            onChange={(e) => { setTable(e.target.value); setPage(1) }}
            placeholder="Table name…"
            className="h-7 px-2 text-xs border rounded bg-white focus:outline-none"
            style={{ borderColor: colors.border, borderRadius: layout.inputRadius, width: 140 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = colors.borderFocus)}
            onBlur={(e)  => (e.currentTarget.style.borderColor = colors.border)}
          />
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="h-7 px-2 text-xs border rounded bg-white focus:outline-none"
            style={{ borderColor: colors.border, borderRadius: layout.inputRadius, color: colors.textPrimary }}
          >
            <option value="">All Actions</option>
            {(['INSERT','UPDATE','DELETE','VOID','LOGIN','LOGOUT'] as const).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1) }}
            className="h-7 px-2 text-xs border rounded bg-white focus:outline-none"
            style={{ borderColor: colors.border, borderRadius: layout.inputRadius }}
          />
          <input
            type="date"
            value={to}
            max={today}
            onChange={(e) => { setTo(e.target.value); setPage(1) }}
            className="h-7 px-2 text-xs border rounded bg-white focus:outline-none"
            style={{ borderColor: colors.border, borderRadius: layout.inputRadius }}
          />
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="h-7 px-2.5 text-xs flex items-center gap-1 border rounded hover:bg-[#F1F3F4]"
              style={{ borderColor: colors.border, color: colors.textSecondary, borderRadius: layout.btnRadius }}
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-white" style={{ border: '1px solid #B0B0B0', borderRadius: 0 }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-40" style={{ color: colors.textSecondary }}>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="w-full bg-white border-collapse">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #E8E8E8 100%)', borderBottom: '2px solid #B0B0B0' }}>
                  {['Time', 'Action', 'Table', 'Record ID', 'User', 'IP', ''].map((h, i) => (
                    <th
                      key={i}
                      className="text-left px-3"
                      style={{ fontSize: 11, fontWeight: fontWeight.semibold, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', height: 32 }}
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
                      style={{ background: idx % 2 === 1 ? '#F5F5F5' : '#FFFFFF', borderBottom: '1px solid #E0E0E0' }}
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#D6E8FF')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? '#F5F5F5' : '#FFFFFF')}
                    >
                      <td className="px-3" style={{ height: 32, fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {new Date(entry.createdAt).toLocaleString('en-ZA')}
                      </td>
                      <td className="px-3" style={{ height: 32 }}>
                        <span
                          style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '2px 8px', borderRadius: layout.btnRadius,
                            fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                            ...ACTION_STYLES[entry.action],
                          }}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-3" style={{ height: 32, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{entry.tableName}</td>
                      <td className="px-3" style={{ height: 32, fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.recordId}</td>
                      <td className="px-3" style={{ height: 32, fontSize: fontSize.sm, color: colors.textPrimary }}>
                        {entry.changedByName ?? (entry.changedById ? entry.changedById.substring(0, 8) + '…' : '—')}
                      </td>
                      <td className="px-3" style={{ height: 32, fontSize: fontSize.xs, color: colors.textSecondary }}>{entry.ipAddress ?? '—'}</td>
                      <td className="px-3 text-xs" style={{ height: 32, color: colors.textSecondary }}>{expanded === entry.id ? '▲' : '▼'}</td>
                    </tr>
                    {expanded === entry.id && (
                      <tr key={`${entry.id}-detail`} style={{ background: colors.bg, borderBottom: '1px solid #E0E0E0', borderLeft: `3px solid ${colors.process}` }}>
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
            <div className="flex items-center gap-0.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-2 h-6 rounded-sm border hover:bg-[#E8E8E8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ borderColor: '#B0B0B0' }}
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-2 h-6 rounded-sm border hover:bg-[#E8E8E8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ borderColor: '#B0B0B0' }}
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
