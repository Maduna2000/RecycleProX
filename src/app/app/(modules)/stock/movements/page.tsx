'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { X } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { format } from '@/lib/utils/format'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { inp, Btn, Field, PortalPage, FilterBar } from '@/components/rpx'
import { fetcher } from '@/lib/swrFetcher'


type Movement = {
  id: string
  direction: 'in' | 'out'
  quantity: string
  source: string
  sourceId?: string
  notes?: string
  createdAt: string
  product: { id: string; code: string; name: string; unit: string; category: string }
}

const SOURCE_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  sale: 'Sale',
  manual_adjustment: 'Manual Adj.',
  void_reversal: 'Void Reversal',
  stocktake_adjustment: 'Stocktake Adj.',
}

const MOVEMENTS_PAGE_SIZE = 50

export default function StockMovementsPage() {
  const [movDirection, setMovDirection] = useState('')
  const [movSource,    setMovSource]    = useState('')
  const [movFrom,      setMovFrom]      = useState('')
  const [movTo,        setMovTo]        = useState('')
  const [movPage,      setMovPage]      = useState(1)

  const hasMovFilters = !!(movDirection || movSource || movFrom || movTo)
  function clearMovFilters() {
    setMovDirection(''); setMovSource(''); setMovFrom(''); setMovTo(''); setMovPage(1)
  }

  // Reset to page 1 whenever a filter changes, so the table never gets
  // stuck showing an empty page past the end of a newly-narrowed result set.
  useEffect(() => { setMovPage(1) }, [movDirection, movSource, movFrom, movTo])

  const movementsQuery = new URLSearchParams({
    ...(movDirection && { direction: movDirection }),
    ...(movSource    && { source: movSource }),
    ...(movFrom      && { from: movFrom }),
    ...(movTo        && { to: movTo }),
    page:     String(movPage),
    pageSize: String(MOVEMENTS_PAGE_SIZE),
  })

  const { data: movementsData, isLoading: movLoading, error: movError } = useSWR<{ movements: Movement[]; total: number }>(
    `/api/stock/movements?${movementsQuery}`,
    fetcher,
  )

  const movements = movementsData?.movements ?? []

  const movementColumns: Column<Movement>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
            {r.product.name}
          </p>
          <p className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{r.product.code}</p>
        </div>
      ),
    },
    {
      key: 'direction',
      header: 'Dir',
      width: '60px',
      render: (r) => (
        <span
          className="px-2 py-0.5 rounded text-xs font-bold"
          style={
            r.direction === 'in'
              ? { background: colors.actionBg, color: colors.action }
              : { background: colors.dangerBg, color: colors.danger }
          }
        >
          {r.direction.toUpperCase()}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantity',
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.textPrimary }}>
          {Number(r.quantity).toFixed(2)} {r.product.unit}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      width: '120px',
      render: (r) => (
        <span
          className="px-2 py-0.5 rounded border text-xs"
          style={{ borderColor: colors.border, color: colors.textSecondary }}
        >
          {SOURCE_LABELS[r.source] ?? r.source}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (r) => (
        <span className="truncate block max-w-[180px] text-xs" style={{ color: colors.textSecondary }}>
          {r.notes ?? '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      width: '140px',
      render: (r) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{format.datetime(r.createdAt)}</span>
      ),
    },
  ]

  return (
    // maxWidth matches src/lib/pageWidthCaps.ts, which PageTitleBar reads to
    // cap/border itself to match — keeps the unbounded Product/Notes columns
    // from stretching to fill the whole window.
    <PortalPage title="Stock Movements" maxWidth={950}>
      <FilterBar>
        <Field label="Direction" width={130}>
          <select value={movDirection} onChange={(e) => setMovDirection(e.target.value)} style={inp}>
            <option value="">All Directions</option>
            <option value="in">In</option>
            <option value="out">Out</option>
          </select>
        </Field>
        <Field label="Source" width={170}>
          <select value={movSource} onChange={(e) => setMovSource(e.target.value)} style={inp}>
            <option value="">All Sources</option>
            <option value="purchase">Purchase</option>
            <option value="sale">Sale</option>
            <option value="manual_adjustment">Manual Adjustment</option>
            <option value="void_reversal">Void Reversal</option>
            <option value="stocktake_adjustment">Stocktake Adjustment</option>
          </select>
        </Field>
        <Field label="From" width={145}>
          <input type="date" value={movFrom} onChange={(e) => setMovFrom(e.target.value)} style={inp} />
        </Field>
        <Field label="To" width={145}>
          <input type="date" value={movTo} onChange={(e) => setMovTo(e.target.value)} style={inp} />
        </Field>
        {hasMovFilters && (
          <Btn size="sm" icon={X} onClick={clearMovFilters}>Clear</Btn>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6C757D', paddingBottom: 8 }}>
          {movementsData?.total ?? 0} movements recorded
        </span>
      </FilterBar>
      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={movementColumns}
          rows={movements}
          rowKey={(r) => r.id}
          loading={movLoading}
          error={movError}
          emptyMessage="No movements recorded yet"
          total={movementsData?.total}
          page={movPage}
          pageSize={MOVEMENTS_PAGE_SIZE}
          onPageChange={setMovPage}
        />
      </div>
    </PortalPage>
  )
}
