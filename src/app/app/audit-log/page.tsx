'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

const ACTION_COLORS: Record<AuditEntry['action'], string> = {
  INSERT:  'bg-green-100 text-green-700',
  UPDATE:  'bg-blue-100 text-blue-700',
  DELETE:  'bg-red-100 text-red-700',
  VOID:    'bg-orange-100 text-orange-700',
  LOGIN:   'bg-gray-100 text-gray-600',
  LOGOUT:  'bg-gray-100 text-gray-500',
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

  // Build query string from filters
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
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Access restricted to administrators.
      </div>
    )
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  function applyFilters() {
    setPage(1)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-red-600" />
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        {data && (
          <span className="text-sm text-gray-400 ml-2">{data.total.toLocaleString()} entries</span>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Table</Label>
          <Input
            value={table}
            onChange={(e) => setTable(e.target.value)}
            placeholder="e.g. Purchase"
            className="mt-1 w-36 h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Action</Label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="mt-1 h-8 rounded-md border border-input bg-background px-2 text-sm w-32"
          >
            <option value="">All</option>
            {(['INSERT','UPDATE','DELETE','VOID','LOGIN','LOGOUT'] as const).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-36 h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="mt-1 w-36 h-8 text-sm" />
        </div>
        <Button size="sm" onClick={applyFilters}>Filter</Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Table</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Record ID</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">No entries found</td></tr>
              )}
              {data?.items.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  >
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap font-mono text-xs">
                      {new Date(entry.createdAt).toLocaleString('en-ZA')}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ACTION_COLORS[entry.action]}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 font-medium">{entry.tableName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400 max-w-[120px] truncate">{entry.recordId}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{entry.changedById?.substring(0, 8) ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{entry.ipAddress ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-300 text-xs">{expanded === entry.id ? '▲' : '▼'}</td>
                  </tr>
                  {expanded === entry.id && (
                    <tr key={`${entry.id}-detail`} className="bg-gray-50 border-b">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="font-semibold text-gray-500 mb-1">Old Values</p>
                            <pre className="bg-white border rounded p-2 text-gray-700 overflow-x-auto max-h-40">
                              {entry.oldValues ? JSON.stringify(entry.oldValues, null, 2) : 'null'}
                            </pre>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-500 mb-1">New Values</p>
                            <pre className="bg-white border rounded p-2 text-gray-700 overflow-x-auto max-h-40">
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
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
