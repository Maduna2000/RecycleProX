'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { X } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { format } from '@/lib/utils/format'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
}

export default function StockMovementsPage() {
  const [movDirection, setMovDirection] = useState('')
  const [movSource,    setMovSource]    = useState('')
  const [movFrom,      setMovFrom]      = useState('')
  const [movTo,        setMovTo]        = useState('')

  const hasMovFilters = !!(movDirection || movSource || movFrom || movTo)
  function clearMovFilters() {
    setMovDirection(''); setMovSource(''); setMovFrom(''); setMovTo('')
  }

  const movementsQuery = new URLSearchParams({
    ...(movDirection && { direction: movDirection }),
    ...(movSource    && { source: movSource }),
    ...(movFrom      && { from: movFrom }),
    ...(movTo        && { to: movTo }),
    pageSize: '200',
  })

  const { data: movementsData, isLoading: movLoading } = useSWR<{ movements: Movement[]; total: number }>(
    `/api/stock/movements?${movementsQuery}`,
    fetcher,
  )

  const movements = movementsData?.movements ?? []

  const movementColumns: Column<Movement>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (r) => (
        <div>
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
    <PageShell
      title="Stock Movements"
      subtitle={`${movementsData?.total ?? 0} movements recorded`}
    >
      <div className="flex gap-2 flex-wrap items-center shrink-0 mb-3">
        <select
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: colors.textPrimary }}
          value={movDirection}
          onChange={(e) => setMovDirection(e.target.value)}
        >
          <option value="">All Directions</option>
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
        <select
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: colors.textPrimary }}
          value={movSource}
          onChange={(e) => setMovSource(e.target.value)}
        >
          <option value="">All Sources</option>
          <option value="purchase">Purchase</option>
          <option value="sale">Sale</option>
          <option value="manual_adjustment">Manual Adjustment</option>
          <option value="void_reversal">Void Reversal</option>
        </select>
        <input
          type="date"
          value={movFrom}
          onChange={(e) => setMovFrom(e.target.value)}
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: movFrom ? colors.textPrimary : colors.textSecondary }}
          title="From date"
        />
        <input
          type="date"
          value={movTo}
          onChange={(e) => setMovTo(e.target.value)}
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: movTo ? colors.textPrimary : colors.textSecondary }}
          title="To date"
        />
        {hasMovFilters && (
          <button
            onClick={clearMovFilters}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
          >
            <X style={{ width: 9, height: 9 }} /> Clear
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <DataTable
          columns={movementColumns}
          rows={movements}
          rowKey={(r) => r.id}
          loading={movLoading}
          emptyMessage="No movements recorded yet"
          total={movementsData?.total}
          pageSize={200}
        />
      </div>
    </PageShell>
  )
}
