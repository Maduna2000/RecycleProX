'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, MoreHorizontal, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc' | null

export interface Column<T> {
  key:       string
  header:    string
  width?:    string
  sortable?: boolean
  render:    (row: T, index: number) => React.ReactNode
}

export interface RowAction<T> {
  label:   string
  icon?:   React.ElementType
  danger?: boolean
  hidden?: (row: T) => boolean
  onClick: (row: T) => void
}

export interface DataTableProps<T> {
  columns:       Column<T>[]
  rows:          T[]
  rowKey:        (row: T) => string
  onRowClick?:   (row: T) => void
  selectedKey?:  string | null
  rowActions?:   RowAction<T>[]
  loading?:      boolean
  emptyMessage?: string
  emptyAction?:  { label: string; onClick: () => void }
  total?:        number
  page?:         number
  pageSize?:     number
  onPageChange?: (page: number) => void
  onSort?:       (key: string, dir: SortDir) => void
  sortKey?:      string | null
  sortDir?:      SortDir
}

// ─── Status Badge helper ──────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    completed: 'bg-green-100 text-green-700',
    done:      'bg-green-100 text-green-700',
    approved:  'bg-green-100 text-green-700',
    settled:   'bg-green-100 text-green-700',
    pending:   'bg-amber-100 text-amber-700',
    open:      'bg-amber-100 text-amber-700',
    submitted: 'bg-blue-100 text-blue-700',
    voided:    'bg-red-100 text-red-700',
    void:      'bg-red-100 text-red-700',
    inactive:  'bg-gray-100 text-gray-600',
    blacklisted: 'bg-red-100 text-red-700',
  }
  const cls = colours[status.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`} style={{ borderRadius: 6 }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

const AVATAR_COLOURS = [
  'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
]

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  const colIdx   = name.charCodeAt(0) % AVATAR_COLOURS.length
  return (
    <div
      className={`rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${AVATAR_COLOURS[colIdx]}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
}

// ─── Row Actions Dropdown ─────────────────────────────────────────────────────

function ActionsDropdown<T>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
  const [open, setOpen] = useState(false)
  const visible = actions.filter((a) => !a.hidden?.(row))
  if (visible.length === 0) return null

  return (
    <div className="relative flex justify-end">
      <button
        className="p-1 rounded hover:bg-[#F1F3F4] text-[#6C757D] hover:text-[#212529] transition-colors"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-0.5 w-40 bg-white rounded-lg shadow-xl border border-[#E0E0E0] py-1 z-20">
            {visible.map((action, i) => (
              <button
                key={i}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                  action.danger
                    ? 'text-[#C0392B] hover:bg-red-50'
                    : 'text-[#212529] hover:bg-[#F1F3F4]',
                )}
                onClick={(e) => { e.stopPropagation(); setOpen(false); action.onClick(row) }}
              >
                {action.icon && <action.icon className="w-3.5 h-3.5" />}
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── DataTable ────────────────────────────────────────────────────────────────

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  rowActions,
  loading,
  emptyMessage = 'No records found',
  emptyAction,
  total,
  page = 1,
  pageSize = 50,
  onPageChange,
  onSort,
  sortKey,
  sortDir,
}: DataTableProps<T>) {

  function handleSort(key: string) {
    if (!onSort) return
    if (sortKey === key) {
      onSort(key, sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc')
    } else {
      onSort(key, 'asc')
    }
  }

  const totalPages = total ? Math.ceil(total / pageSize) : 1
  const showing    = total ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : `${rows.length} records`

  return (
    <div className="flex flex-col h-full">
      {/* Table wrapper */}
      <div className="flex-1 overflow-auto rounded-lg border border-[#E0E0E0] bg-white">
        <table className="w-full text-sm border-collapse">
          {/* Header */}
          <thead className="sticky top-0 z-10">
            <tr style={{ background: '#F8F9FA' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'text-left px-4 border-b border-[#E0E0E0]',
                    col.sortable && 'cursor-pointer select-none hover:bg-[#EBF3FC]',
                  )}
                  style={{
                    fontSize:      12,
                    fontWeight:    600,
                    letterSpacing: '0.05em',
                    color:         '#6C757D',
                    textTransform: 'uppercase',
                    height:        40,
                    width:         col.width,
                  }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      sortKey === col.key
                        ? sortDir === 'asc'
                          ? <ChevronUp className="w-3 h-3" />
                          : sortDir === 'desc'
                            ? <ChevronDown className="w-3 h-3" />
                            : <ChevronsUpDown className="w-3 h-3 opacity-40" />
                        : <ChevronsUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </span>
                </th>
              ))}
              {rowActions && rowActions.length > 0 && (
                <th className="w-12 border-b border-[#E0E0E0]" />
              )}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)} className="py-16 text-center text-[#6C757D]">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)} className="py-16 text-center">
                  <p className="text-sm text-[#6C757D]">{emptyMessage}</p>
                  {emptyAction && (
                    <button
                      className="mt-3 text-xs text-[#185ABD] hover:underline"
                      onClick={emptyAction.onClick}
                    >
                      {emptyAction.label}
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const key      = rowKey(row)
                const isSelected = selectedKey === key
                const isEven   = idx % 2 === 1

                return (
                  <tr
                    key={key}
                    className={cn(
                      'transition-colors',
                      onRowClick && 'cursor-pointer',
                      isSelected
                        ? 'bg-[#EBF3FC]'
                        : isEven
                          ? 'bg-[#F8F9FA] hover:bg-[#EBF3FC]'
                          : 'bg-white hover:bg-[#EBF3FC]',
                    )}
                    style={isSelected ? { borderLeft: '3px solid #185ABD' } : { borderLeft: '3px solid transparent' }}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="px-4 border-b border-[#E0E0E0]"
                        style={{ height: 40, fontSize: 13, color: '#212529' }}
                      >
                        {col.render(row, idx)}
                      </td>
                    ))}
                    {rowActions && rowActions.length > 0 && (
                      <td
                        className="px-2 border-b border-[#E0E0E0]"
                        style={{ height: 40 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ActionsDropdown row={row} actions={rowActions} />
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(total !== undefined && onPageChange) && (
        <div className="flex items-center justify-between pt-3 shrink-0">
          <span className="text-xs text-[#6C757D]">{showing}</span>
          <div className="flex items-center gap-1">
            <button
              className="p-1 rounded border border-[#E0E0E0] hover:bg-[#F1F3F4] disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1
              return (
                <button
                  key={p}
                  className={cn(
                    'w-7 h-7 rounded text-xs transition-colors',
                    p === page
                      ? 'bg-[#185ABD] text-white'
                      : 'border border-[#E0E0E0] hover:bg-[#F1F3F4] text-[#212529]',
                  )}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </button>
              )
            })}
            <button
              className="p-1 rounded border border-[#E0E0E0] hover:bg-[#F1F3F4] disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
