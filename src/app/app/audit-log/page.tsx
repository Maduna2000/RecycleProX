'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight, ShieldAlert, Loader2 } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type AuditEntry = {
  id:          string
  tableName:   string
  recordId:    string
  action:      'INSERT' | 'UPDATE' | 'DELETE' | 'VOID' | 'LOGIN' | 'LOGOUT'
  oldValues:   Record<string, unknown> | null
  newValues:   Record<string, unknown> | null
  changedById: string | null
  ipAddress:   string | null
  createdAt:   string
}

type AuditResponse = {
  items:    AuditEntry[]
  total:    number
  page:     number
  pageSize: number
}

const ACTION_STYLES: Record<AuditEntry['action'], { background: string; color: string }> = {
  INSERT:  { background: '#F0FBF4', color: '#217346' },
  UPDATE:  { background: '#EBF3FC', color: '#185ABD' },
  DELETE:  { background: '#FEF2F2', color: '#C0392B' },
  VOID:    { background: '#FFF8E1', color: '#C9A020' },
  LOGIN:   { background: '#F1F3F4', color: '#6C757D' },
  LOGOUT:  { background: '#F1F3F4', color: '#6C757D' },
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
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: '#6C757D' }}>
        Access restricted to administrators.
      </div>
    )
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Page header */}
      <div className="flex items-center gap-2 shrink-0">
        <ShieldAlert className="w-5 h-5" style={{ color: '#C0392B' }} />
        <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Audit Log</h1>
        {data && (
          <span className="text-sm ml-2" style={{ color: '#6C757D' }}>{data.total.toLocaleString()} entries</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end shrink-0 rounded-lg p-3 bg-white" style={{ border: '1px solid #E0E0E0' }}>
        <div>
          <Label className="text-xs" style={{ color: '#6C757D' }}>Table</Label>
          <Input
            value={table}
            onChange={(e) => { setTable(e.target.value); setPage(1) }}
            placeholder="e.g. Purchase"
            className="mt-1 w-36 h-7 text-xs border-[#E0E0E0]"
          />
        </div>
        <div>
          <Label className="text-xs" style={{ color: '#6C757D' }}>Action</Label>
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="mt-1 h-7 rounded px-2 text-xs w-32 focus:outline-none focus:border-[#185ABD]"
            style={{ border: '1px solid #E0E0E0', color: '#212529', background: '#FFFFFF' }}
          >
            <option value="">All</option>
            {(['INSERT','UPDATE','DELETE','VOID','LOGIN','LOGOUT'] as const).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs" style={{ color: '#6C757D' }}>From</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className="mt-1 w-36 h-7 text-xs border-[#E0E0E0]" />
        </div>
        <div>
          <Label className="text-xs" style={{ color: '#6C757D' }}>To</Label>
          <Input type="date" value={to} max={today} onChange={(e) => { setTo(e.target.value); setPage(1) }} className="mt-1 w-36 h-7 text-xs border-[#E0E0E0]" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg" style={{ border: '1px solid #E0E0E0' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-40" style={{ color: '#6C757D' }}>
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <table className="w-full bg-white">
            <thead style={{ background: '#F8F9FA', borderBottom: '1px solid #E0E0E0' }}>
              <tr>
                {['Time', 'Action', 'Table', 'Record ID', 'User', 'IP', ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-2" style={{ fontSize: 10, fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(!data?.items.length) && (
                <tr><td colSpan={7} className="text-center py-12 text-sm" style={{ color: '#6C757D' }}>No entries found</td></tr>
              )}
              {data?.items.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className="cursor-pointer"
                    style={{ borderBottom: '1px solid #F1F3F4' }}
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8F9FA')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ fontSize: 11, color: '#6C757D' }}>
                      {new Date(entry.createdAt).toLocaleString('en-ZA')}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={ACTION_STYLES[entry.action]}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium" style={{ fontSize: 12, color: '#212529' }}>{entry.tableName}</td>
                    <td className="px-4 py-2.5 font-mono max-w-[120px] truncate" style={{ fontSize: 11, color: '#6C757D' }}>{entry.recordId}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ fontSize: 11, color: '#6C757D' }}>{entry.changedById?.substring(0, 8) ?? '—'}</td>
                    <td className="px-4 py-2.5" style={{ fontSize: 11, color: '#6C757D' }}>{entry.ipAddress ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: '#6C757D' }}>{expanded === entry.id ? '▲' : '▼'}</td>
                  </tr>
                  {expanded === entry.id && (
                    <tr key={`${entry.id}-detail`} style={{ background: '#F8F9FA', borderBottom: '1px solid #F1F3F4' }}>
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="font-semibold mb-1" style={{ color: '#6C757D' }}>Old Values</p>
                            <pre className="rounded p-2 overflow-x-auto max-h-40 bg-white" style={{ border: '1px solid #E0E0E0', color: '#212529' }}>
                              {entry.oldValues ? JSON.stringify(entry.oldValues, null, 2) : 'null'}
                            </pre>
                          </div>
                          <div>
                            <p className="font-semibold mb-1" style={{ color: '#6C757D' }}>New Values</p>
                            <pre className="rounded p-2 overflow-x-auto max-h-40 bg-white" style={{ border: '1px solid #E0E0E0', color: '#212529' }}>
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
        <div className="flex items-center justify-between text-sm shrink-0" style={{ color: '#6C757D' }}>
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="h-7 w-7 flex items-center justify-center rounded transition-colors disabled:opacity-40"
              style={{ border: '1px solid #E0E0E0', color: '#212529', background: '#FFFFFF' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F8F9FA')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="h-7 w-7 flex items-center justify-center rounded transition-colors disabled:opacity-40"
              style={{ border: '1px solid #E0E0E0', color: '#212529', background: '#FFFFFF' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F8F9FA')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
