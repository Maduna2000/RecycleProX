'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type GridRow = {
  productId: string
  code: string
  name: string
  category: string
  unit: string
  openingQty: string
  purchasedQty: string
  soldQty: string
  adjustedQty: string
  closingQty: string
  closingValue: string
  buyPrice: string
}

const CATEGORY_LABELS: Record<string, string> = {
  ferrous: 'Ferrous',
  non_ferrous: 'Non-Ferrous',
  copper: 'Copper',
  aluminium: 'Aluminium',
  plastic: 'Plastic',
  paper: 'Paper',
  e_waste: 'E-Waste',
  other: 'Other',
}

export default function StockGridPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [gridPeriod,   setGridPeriod]   = useState<'daily' | 'weekly' | 'mtd'>('mtd')
  const [gridDate,     setGridDate]     = useState(today)
  const [gridCategory, setGridCategory] = useState('')
  const [exporting,    setExporting]    = useState(false)

  const gridKey = `/api/stock/grid?period=${gridPeriod}&date=${gridDate}${gridCategory ? `&category=${gridCategory}` : ''}`
  const { data: gridData, isLoading: gridLoading } = useSWR<{ grid: GridRow[] }>(gridKey, fetcher)

  async function handleExport() {
    setExporting(true)
    const exportUrl = `/api/stock/grid/export?period=${gridPeriod}&date=${gridDate}${gridCategory ? `&category=${gridCategory}` : ''}`
    const res = await fetch(exportUrl)
    setExporting(false)
    if (!res.ok) { toast.error('Export failed'); return }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `stock-grid-${gridPeriod}-${gridDate}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const gridColumns: Column<GridRow>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (r) => (
        <div>
          <p style={{ fontSize: fontSize.sm, fontWeight: 500, color: colors.textPrimary }}>{r.name}</p>
          <p className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{r.code}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Cat',
      width: '100px',
      render: (r) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {CATEGORY_LABELS[r.category] ?? r.category}
        </span>
      ),
    },
    {
      key: 'unit',
      header: 'Unit',
      width: '56px',
      render: (r) => <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{r.unit}</span>,
    },
    {
      key: 'openingQty',
      header: 'Opening',
      width: '88px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.textSecondary }}>{r.openingQty}</span>
      ),
    },
    {
      key: 'purchasedQty',
      header: 'Purchased',
      width: '90px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.action }}>{r.purchasedQty}</span>
      ),
    },
    {
      key: 'soldQty',
      header: 'Sold',
      width: '80px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.danger }}>{r.soldQty}</span>
      ),
    },
    {
      key: 'adjustedQty',
      header: 'Adjusted',
      width: '84px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.process }}>{r.adjustedQty}</span>
      ),
    },
    {
      key: 'closingQty',
      header: 'Closing',
      width: '84px',
      render: (r) => {
        const isNeg = new Decimal(r.closingQty).isNegative()
        return (
          <span
            className="font-mono text-xs font-semibold"
            style={{ color: isNeg ? colors.danger : colors.textPrimary }}
          >
            {r.closingQty}
          </span>
        )
      },
    },
    {
      key: 'closingValue',
      header: 'Value (R)',
      width: '96px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.textPrimary }}>R {r.closingValue}</span>
      ),
    },
  ]

  return (
    <PageShell
      title="Stock Grid"
      subtitle={`${gridData?.grid?.length ?? 0} products`}
    >
      <div className="flex flex-wrap gap-3 items-end shrink-0 mb-3">
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Period</p>
          <Select value={gridPeriod} onValueChange={(v) => setGridPeriod(v as 'daily' | 'weekly' | 'mtd')}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="mtd">Month to Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Date</p>
          <Input
            type="date"
            value={gridDate}
            max={today}
            onChange={(e) => setGridDate(e.target.value)}
            className="w-40 h-8 text-xs"
          />
        </div>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Category</p>
          <select
            className="border rounded px-2 h-8 text-xs bg-white focus:outline-none"
            style={{ color: colors.textPrimary, borderColor: colors.border }}
            value={gridCategory}
            onChange={(e) => setGridCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            padding: '1px 6px',
            background: '#E0E0E0',
            border: '1px solid #999',
            borderRadius: 2,
            cursor: exporting ? 'not-allowed' : 'pointer',
            opacity: exporting ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
          onMouseEnter={(e) => { if (!exporting) e.currentTarget.style.background = '#D0D0D0' }}
          onMouseLeave={(e) => { if (!exporting) e.currentTarget.style.background = '#E0E0E0' }}
        >
          {exporting
            ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> Exporting…</>
            : <><Download style={{ width: 9, height: 9 }} /> Export Excel</>}
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {gridLoading ? (
          <div className="flex items-center justify-center h-32 gap-2" style={{ color: colors.textSecondary }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Building grid…
          </div>
        ) : (
          <DataTable
            columns={gridColumns}
            rows={gridData?.grid ?? []}
            rowKey={(r) => r.productId}
            emptyMessage="No data for selected period"
          />
        )}
      </div>
    </PageShell>
  )
}
