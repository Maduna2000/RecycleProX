'use client'

import { useState, useRef } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, MoreHorizontal, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { colors, statusStyle } from '@/lib/design-tokens'
import { Btn, HEADER_GRAD, winBevel } from '@/components/rpx'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc' | null

export interface Column<T> {
  key:       string
  header:    string
  width?:    string
  sortable?: boolean
  /** Right-align for money/ID/date columns — tabular figures should never be left-aligned. */
  align?:    'left' | 'right'
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
  columns:            Column<T>[]
  rows:               T[]
  rowKey:             (row: T) => string
  onRowClick?:        (row: T) => void
  selectedKey?:       string | null
  rowActions?:        RowAction<T>[]
  loading?:           boolean
  error?:             string | boolean
  emptyMessage?:      string
  emptyIcon?:         React.ElementType
  emptyAction?:       { label: string; onClick: () => void }
  total?:             number
  page?:              number
  pageSize?:          number
  onPageChange?:      (page: number) => void
  onSort?:            (key: string, dir: SortDir) => void
  sortKey?:           string | null
  sortDir?:           SortDir
  // Multi-select
  selectedKeys?:      Set<string>
  onSelectionChange?: (keys: Set<string>) => void
}

// ─── Status Badge helper ──────────────────────────────────────────────────────
// Thin wrapper around the shared statusStyle() helper (design-tokens.ts) so
// every status pill in the app — however it's rendered — comes from the same
// color map and the same badge shape.

export function StatusBadge({ status }: { status: string }) {
  const { badge, label } = statusStyle(status.toLowerCase())
  return <span style={badge}>{label}</span>
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
  const [open,       setOpen]       = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const visible = actions.filter((a) => !a.hidden?.(row))
  if (visible.length === 0) return null

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const estimatedMenuH = visible.length * 32 + 8
      setOpenUpward(rect.bottom + estimatedMenuH > window.innerHeight - 8)
    }
    setOpen((o) => !o)
  }

  return (
    <div className="relative flex justify-end">
      <button
        ref={btnRef}
        className="p-1 rounded-sm hover:bg-[#D6E8FF] text-[#6C757D] hover:text-[#00205B] transition-colors"
        onClick={handleToggle}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute right-0 w-44 bg-white py-0.5 z-20',
              openUpward ? 'bottom-full mb-0.5' : 'top-full mt-0.5',
            )}
            style={{
              borderRadius: 2,
              // A real little pop-out window (same raised bevel as
              // dialogs), with a hard offset shadow instead of Tailwind's
              // blurry shadow-xl — classic Win32 context-menu depth cue.
              boxShadow: '2px 2px 6px rgba(0,0,0,0.3)',
              ...winBevel(),
            }}
          >
            {visible.map((action, i) => (
              <button
                key={i}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors',
                  action.danger
                    ? 'text-[#C0392B] hover:bg-red-50'
                    : 'text-[#212529] hover:bg-[#D6E8FF]',
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
  error,
  emptyMessage = 'No records found',
  emptyIcon: EmptyIcon,
  emptyAction,
  total,
  page = 1,
  pageSize = 30,
  onPageChange,
  onSort,
  sortKey,
  sortDir,
  selectedKeys,
  onSelectionChange,
}: DataTableProps<T>) {

  function handleSort(key: string) {
    if (!onSort) return
    if (sortKey === key) {
      onSort(key, sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc')
    } else {
      onSort(key, 'asc')
    }
  }

  const multiSelect  = !!onSelectionChange
  const allSelected  = multiSelect && rows.length > 0 && rows.every(r => selectedKeys?.has(rowKey(r)))
  const someSelected = multiSelect && rows.some(r => selectedKeys?.has(rowKey(r)))

  const totalPages  = total ? Math.ceil(total / pageSize) : 1
  const showing     = total ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : `${rows.length} records`
  const hasActions  = rowActions && rowActions.length > 0
  const totalCols   = columns.length + (hasActions ? 1 : 0) + (multiSelect ? 1 : 0)

  function colBorder(isLast: boolean): string {
    return isLast ? 'none' : '1px solid #D0D0D0'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table wrapper — square corners, sunken well (same hard-edge bevel
          as buttons/title bars, inverted: dark top/left, light bottom/right)
          so the grid reads as recessed into the page, the way a real Win32
          data grid (e.g. MT4's Market Watch/Trade tables) is built. */}
      <div className="flex-1 overflow-auto bg-white" style={{ borderRadius: 0, ...winBevel(true) }}>
        <table className="w-full text-sm border-collapse">
          {/* Header */}
          <thead className="sticky top-0 z-10">
            <tr style={{
              background: HEADER_GRAD,
              borderBottom: '2px solid #B0B0B0',
              // Crisp (zero-blur) inset highlight/shadow pair instead of
              // GLOSS_BEVEL's soft blur — a <tr> under border-collapse
              // can't reliably take a real `border`, so this is the
              // hard-edge-safe equivalent for this one spot.
              boxShadow: 'inset 0 1px 0 #FFFFFF, inset 0 -1px 0 #B0B0B0',
            }}>
              {multiSelect && (
                <th style={{ width: 36, height: 30, padding: '0 10px', borderRight: '1px solid #D0D0D0' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={(e) => {
                      onSelectionChange!(e.target.checked ? new Set(rows.map(r => rowKey(r))) : new Set())
                    }}
                    style={{ cursor: 'pointer', accentColor: '#1B3A6B' }}
                  />
                </th>
              )}
              {columns.map((col, colIdx) => {
                const isLastData = colIdx === columns.length - 1 && !hasActions
                return (
                  <th
                    key={col.key}
                    className={cn(
                      'px-3',
                      col.sortable && 'cursor-pointer select-none hover:bg-[#D6E8FF]/60',
                    )}
                    style={{
                      fontSize:      10,
                      fontWeight:    700,
                      letterSpacing: '0.05em',
                      color:         '#6C757D',
                      textTransform: 'uppercase',
                      height:        30,
                      width:         col.width,
                      textAlign:     col.align === 'right' ? 'right' : 'left',
                      borderRight:   colBorder(isLastData),
                    }}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span className={cn('flex items-center gap-1', col.align === 'right' && 'justify-end')}>
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
                )
              })}
              {hasActions && (
                <th className="w-10" style={{ height: 30, borderRight: 'none' }} />
              )}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {error ? (
              <tr>
                <td colSpan={totalCols} className="py-12 text-center">
                  <p className="text-sm" style={{ color: colors.danger }}>
                    {typeof error === 'string' ? error : 'Failed to load data. Please try again.'}
                  </p>
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td colSpan={totalCols} className="py-12 text-center text-[#6C757D]">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    {EmptyIcon && (
                      <EmptyIcon className="w-12 h-12" style={{ color: '#B0B0B0' }} />
                    )}
                    <p className="text-sm" style={{ color: colors.textSecondary }}>{emptyMessage}</p>
                    {emptyAction && (
                      <Btn variant="secondary" style={{ marginTop: 8 }} onClick={emptyAction.onClick}>
                        {emptyAction.label}
                      </Btn>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const key          = rowKey(row)
                const isSelected   = selectedKey === key
                const isChecked    = selectedKeys?.has(key) ?? false
                const isEven       = idx % 2 === 1

                return (
                  <tr
                    key={key}
                    className={cn('transition-colors', onRowClick && 'cursor-pointer')}
                    style={{
                      background: isSelected || isChecked
                        ? '#C8D9F0'
                        : isEven ? '#F5F5F5' : '#FFFFFF',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !isChecked)
                        (e.currentTarget as HTMLTableRowElement).style.background = colors.rowHover
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && !isChecked)
                        (e.currentTarget as HTMLTableRowElement).style.background = isEven ? '#F5F5F5' : '#FFFFFF'
                    }}
                    onClick={() => onRowClick?.(row)}
                  >
                    {multiSelect && (
                      <td
                        className="border-b border-[#E0E0E0]"
                        style={{ width: 36, height: 30, padding: '0 10px', borderRight: '1px solid #D0D0D0' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = new Set(selectedKeys)
                            if (e.target.checked) next.add(key)
                            else next.delete(key)
                            onSelectionChange!(next)
                          }}
                          style={{ cursor: 'pointer', accentColor: '#1B3A6B' }}
                        />
                      </td>
                    )}
                    {columns.map((col, colIdx) => {
                      const isLastData = colIdx === columns.length - 1 && !hasActions
                      return (
                        <td
                          key={col.key}
                          className="border-b border-[#E0E0E0]"
                          style={{
                            height:      30,
                            padding:     '4px 10px',
                            fontSize:    12,
                            color:       isSelected || isChecked ? '#00205B' : '#212529',
                            textAlign:   col.align === 'right' ? 'right' : 'left',
                            borderRight: colBorder(isLastData),
                          }}
                        >
                          {col.render(row, idx)}
                        </td>
                      )
                    })}
                    {hasActions && (
                      <td
                        className="px-2 border-b border-[#E0E0E0]"
                        style={{ height: 30, borderRight: 'none' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ActionsDropdown row={row} actions={rowActions!} />
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
        <div className="flex items-center justify-between pt-2.5 shrink-0">
          <span className="text-[11px] text-[#6C757D]">{showing}</span>
          <div className="flex items-center gap-0.5">
            <button
              className="px-2 h-6 rounded-sm hover:bg-[#E8E8E8] disabled:opacity-40 disabled:cursor-not-allowed text-[11px] transition-colors"
              style={winBevel()}
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1
              const isCurrent = p === page
              return (
                <button
                  key={p}
                  className={cn(
                    'w-6 h-6 rounded-sm text-[11px] transition-colors',
                    isCurrent ? 'bg-[#1B3A6B] text-white' : 'hover:bg-[#E8E8E8] text-[#212529]',
                  )}
                  style={winBevel(isCurrent)}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </button>
              )
            })}
            <button
              className="px-2 h-6 rounded-sm hover:bg-[#E8E8E8] disabled:opacity-40 disabled:cursor-not-allowed text-[11px] transition-colors"
              style={winBevel()}
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
