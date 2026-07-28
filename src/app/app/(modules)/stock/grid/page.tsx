'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { CategoryFilterSelect } from '@/components/products/CategoryFilterSelect'
import { colors, fontSize } from '@/lib/design-tokens'
import { inp, BtnMenu, Field, PortalPage, FilterBar } from '@/components/rpx'

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

export default function StockGridPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [gridPeriod,   setGridPeriod]   = useState<'daily' | 'weekly' | 'mtd'>('mtd')
  const [gridDate,     setGridDate]     = useState(today)
  const [gridCategory, setGridCategory] = useState('')
  const [exporting,    setExporting]    = useState(false)
  const [page,         setPage]         = useState(1)

  const gridKey = `/api/stock/grid?period=${gridPeriod}&date=${gridDate}${gridCategory ? `&category=${gridCategory}` : ''}`
  const { data: gridData, isLoading: gridLoading, error: gridError } = useSWR<{ grid: GridRow[] }>(gridKey, fetcher)

  const gridRows   = gridData?.grid ?? []
  const PAGE_SIZE  = 50
  const totalPages = Math.max(1, Math.ceil(gridRows.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pagedGrid  = gridRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  async function handleExport(format: 'xlsx' | 'pdf') {
    setExporting(true)
    const exportUrl = `/api/stock/grid/export?period=${gridPeriod}&date=${gridDate}&format=${format}${gridCategory ? `&category=${gridCategory}` : ''}`
    const res = await fetch(exportUrl)
    setExporting(false)
    if (!res.ok) { toast.error('Export failed'); return }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `stock-grid-${gridPeriod}-${gridDate}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const gridColumns: Column<GridRow>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
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
          {r.category}
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
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.textSecondary }}>{r.openingQty}</span>
      ),
    },
    {
      key: 'purchasedQty',
      header: 'Purchased',
      width: '90px',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.action }}>{r.purchasedQty}</span>
      ),
    },
    {
      key: 'soldQty',
      header: 'Sold',
      width: '80px',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.danger }}>{r.soldQty}</span>
      ),
    },
    {
      key: 'adjustedQty',
      header: 'Adjusted',
      width: '84px',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.process }}>{r.adjustedQty}</span>
      ),
    },
    {
      key: 'closingQty',
      header: 'Closing',
      width: '84px',
      align: 'right',
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
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.textPrimary }}>R {r.closingValue}</span>
      ),
    },
  ]

  return (
    <PortalPage title="Stock Grid">
      <FilterBar>
        <Field label="Period" width={150}>
          <select value={gridPeriod} onChange={(e) => setGridPeriod(e.target.value as 'daily' | 'weekly' | 'mtd')} style={inp}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="mtd">Month to Date</option>
          </select>
        </Field>
        <Field label="Date" width={160}>
          <input type="date" value={gridDate} max={today} onChange={(e) => setGridDate(e.target.value)} style={inp} />
        </Field>
        <Field label="Category" width={160}>
          <CategoryFilterSelect style={inp} value={gridCategory} onChange={setGridCategory} />
        </Field>
        <BtnMenu
          size="sm"
          icon={Download}
          label="Download"
          loading={exporting}
          items={[
            { label: 'Download PDF',   onClick: () => handleExport('pdf')  },
            { label: 'Download Excel', onClick: () => handleExport('xlsx') },
          ]}
        />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6C757D', paddingBottom: 8 }}>
          {gridData?.grid?.length ?? 0} products
        </span>
      </FilterBar>

      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        {gridLoading ? (
          <div className="flex items-center justify-center h-32 gap-2" style={{ color: colors.textSecondary }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Building grid…
          </div>
        ) : (
          <DataTable
            columns={gridColumns}
            rows={pagedGrid}
            rowKey={(r) => r.productId}
            total={gridRows.length}
            page={safePage}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            error={gridError}
            emptyMessage="No data for selected period"
          />
        )}
      </div>
    </PortalPage>
  )
}
