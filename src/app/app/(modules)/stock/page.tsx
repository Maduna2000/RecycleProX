'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { SlidersHorizontal, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Download, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { WinButton } from '@/components/ui/WinButton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from '@/lib/utils/format'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type StockEntry = {
  product: { id: string; code: string; name: string; category: string; unit: string; minStockLevel?: string | null }
  totalIn: string; totalOut: string; onHand: string; hasMovements: boolean
}

type GridRow = {
  productId: string; code: string; name: string; category: string; unit: string
  openingQty: string; purchasedQty: string; soldQty: string; adjustedQty: string
  closingQty: string; closingValue: string; buyPrice: string
}

type Movement = {
  id: string; direction: 'in' | 'out'; quantity: string; source: string
  sourceId?: string; notes?: string; createdAt: string
  product: { id: string; code: string; name: string; unit: string; category: string }
}

const CATEGORY_LABELS: Record<string, string> = {
  ferrous: 'Ferrous', non_ferrous: 'Non-Ferrous', copper: 'Copper',
  aluminium: 'Aluminium', plastic: 'Plastic', paper: 'Paper', e_waste: 'E-Waste', other: 'Other',
}
const SOURCE_LABELS: Record<string, string> = {
  purchase: 'Purchase', sale: 'Sale',
  manual_adjustment: 'Manual Adj.', void_reversal: 'Void Reversal',
}

type PageTab = 'onhand' | 'movements' | 'grid'

export default function StockPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [activeTab,      setActiveTab]      = useState<PageTab>('onhand')
  const [adjustOpen,     setAdjustOpen]     = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showZero,       setShowZero]       = useState(true)
  const [onHandSearch,   setOnHandSearch]   = useState('')

  // Movements filters
  const [movDirection, setMovDirection] = useState('')
  const [movSource,    setMovSource]    = useState('')
  const [movFrom,      setMovFrom]      = useState('')
  const [movTo,        setMovTo]        = useState('')

  const hasMovFilters = !!(movDirection || movSource || movFrom || movTo)
  function clearMovFilters() {
    setMovDirection(''); setMovSource(''); setMovFrom(''); setMovTo('')
  }

  const today = new Date().toISOString().slice(0, 10)
  const [gridPeriod,   setGridPeriod]   = useState<'daily' | 'weekly' | 'mtd'>('mtd')
  const [gridDate,     setGridDate]     = useState(today)
  const [gridCategory, setGridCategory] = useState('')
  const [exporting,    setExporting]    = useState(false)

  const movementsQuery = new URLSearchParams({
    ...(movDirection && { direction: movDirection }),
    ...(movSource    && { source: movSource }),
    ...(movFrom      && { from: movFrom }),
    ...(movTo        && { to: movTo }),
    pageSize: '200',
  })

  const { data: stockData } = useSWR<{ stock: StockEntry[] }>('/api/stock/on-hand', fetcher)
  const { data: movementsData, isLoading: movLoading } = useSWR<{ movements: Movement[]; total: number }>(
    `/api/stock/movements?${movementsQuery}`,
    fetcher,
  )
  const gridKey = `/api/stock/grid?period=${gridPeriod}&date=${gridDate}${gridCategory ? `&category=${gridCategory}` : ''}`
  const { data: gridData, isLoading: gridLoading } = useSWR<{ grid: GridRow[] }>(
    activeTab === 'grid' ? gridKey : null,
    fetcher,
  )

  const allStock = stockData?.stock ?? []
  const stock = allStock.filter((s) => {
    if (!showZero && parseFloat(s.onHand) === 0 && !s.hasMovements) return false
    if (categoryFilter && s.product.category !== categoryFilter) return false
    if (onHandSearch) {
      const q = onHandSearch.toLowerCase()
      if (!s.product.name.toLowerCase().includes(q) && !s.product.code.toLowerCase().includes(q)) return false
    }
    return true
  })
  const movements = movementsData?.movements ?? []

  const totalProducts = stock.filter((s) => parseFloat(s.onHand) > 0).length
  const lowStock      = stock.filter((s) => parseFloat(s.onHand) < 0).length
  const reorderCount  = stock.filter((s) => {
    const min = s.product.minStockLevel ? parseFloat(s.product.minStockLevel) : null
    return min !== null && parseFloat(s.onHand) < min
  }).length

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

  // ── On-Hand columns ─────────────────────────────────────────────────────────
  const onHandColumns: Column<StockEntry>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (r) => {
        const minLevel    = r.product.minStockLevel ? parseFloat(r.product.minStockLevel) : null
        const belowReorder = minLevel !== null && parseFloat(r.onHand) < minLevel
        return (
          <div className="flex items-center gap-2">
            <div>
              <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
                {r.product.name}
              </p>
              <p className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{r.product.code}</p>
            </div>
            {belowReorder && (
              <span title={`Below reorder level (min: ${minLevel?.toFixed(2)} ${r.product.unit})`}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: colors.warning }} />
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'category',
      header: 'Category',
      width: '120px',
      render: (r) => (
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{ background: colors.neutralBg, color: colors.textSecondary }}
        >
          {CATEGORY_LABELS[r.product.category] ?? r.product.category}
        </span>
      ),
    },
    {
      key: 'totalIn',
      header: 'Total In',
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.action }}>
          {Number(r.totalIn).toFixed(2)} {r.product.unit}
        </span>
      ),
    },
    {
      key: 'totalOut',
      header: 'Total Out',
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.danger }}>
          {Number(r.totalOut).toFixed(2)} {r.product.unit}
        </span>
      ),
    },
    {
      key: 'onHand',
      header: 'On Hand',
      width: '120px',
      render: (r) => {
        const qty = parseFloat(r.onHand)
        return (
          <div className="flex items-center gap-1.5">
            {qty > 0
              ? <TrendingUp  className="w-3.5 h-3.5" style={{ color: colors.action }} />
              : qty < 0
              ? <TrendingDown className="w-3.5 h-3.5" style={{ color: colors.danger }} />
              : <Minus className="w-3.5 h-3.5" style={{ color: '#CCC' }} />}
            <span
              className="font-mono font-semibold text-xs"
              style={{ color: qty > 0 ? colors.textPrimary : qty < 0 ? colors.danger : colors.textSecondary }}
            >
              {Number(r.onHand).toFixed(2)} {r.product.unit}
            </span>
          </div>
        )
      },
    },
  ]

  // ── Movements columns ────────────────────────────────────────────────────────
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

  // ── Stock Grid columns ───────────────────────────────────────────────────────
  const gridColumns: Column<GridRow>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (r) => (
        <div>
          <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{r.name}</p>
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

  const subtitleParts = [
    `${totalProducts} products in stock`,
    lowStock > 0 ? `${lowStock} negative` : null,
    reorderCount > 0 ? `${reorderCount} below reorder` : null,
  ].filter(Boolean).join(' · ')

  const pageTabs = [
    { value: 'onhand',    label: 'Stock On Hand' },
    { value: 'movements', label: 'Movement History' },
    { value: 'grid',      label: 'Stock Grid' },
  ]

  return (
    <PageShell
      title="Stock"
      subtitle={subtitleParts}
      tabs={pageTabs}
      activeTab={activeTab}
      onTabChange={(v) => setActiveTab(v as PageTab)}
    >
      {/* Manager action — Manual Adjustment button */}
      {isManager && (
        <div className="flex justify-end shrink-0 mb-1">
          <WinButton onClick={() => setAdjustOpen(true)}>
            <SlidersHorizontal style={{ width: 9, height: 9 }} /> Manual Adjustment
          </WinButton>
        </div>
      )}

      {/* On Hand tab */}
      {activeTab === 'onhand' && (
        <>
          <div className="flex gap-2 flex-wrap items-center shrink-0 mb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} />
              <input
                value={onHandSearch}
                onChange={(e) => setOnHandSearch(e.target.value)}
                placeholder="Search product..."
                className="pl-7 pr-3 h-7 text-xs rounded border bg-white focus:outline-none w-44 border-[#E0E0E0] focus:border-[#185ABD]"
              />
            </div>
            <select
              className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
              style={{ color: colors.textPrimary }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <label
              className="flex items-center gap-1.5 text-xs cursor-pointer"
              style={{ color: colors.textSecondary }}
            >
              <input
                type="checkbox"
                checked={showZero}
                onChange={(e) => setShowZero(e.target.checked)}
                className="rounded"
              />
              Show zero stock
            </label>
          </div>
          <div className="flex-1 min-h-0">
            <DataTable
              columns={onHandColumns}
              rows={stock}
              rowKey={(r) => r.product.id}
              loading={!stockData}
              emptyMessage="No stock data — complete some purchases first"
            />
          </div>
        </>
      )}

      {/* Movements tab */}
      {activeTab === 'movements' && (
        <>
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
        </>
      )}

      {/* Stock Grid tab */}
      {activeTab === 'grid' && (
        <>
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
        </>
      )}

      {adjustOpen && (
        <AdjustmentModal
          products={allStock.map((s) => s.product)}
          onClose={() => setAdjustOpen(false)}
          onSuccess={() => {
            mutate('/api/stock/on-hand')
            mutate('/api/stock/movements?pageSize=200')
            setAdjustOpen(false)
          }}
        />
      )}
    </PageShell>
  )
}

// ─── Manual Adjustment Modal ──────────────────────────────────────────────────
function AdjustmentModal({
  products,
  onClose,
  onSuccess,
}: {
  products:  StockEntry['product'][]
  onClose:   () => void
  onSuccess: () => void
}) {
  const [productId,  setProductId]  = useState('')
  const [direction,  setDirection]  = useState<'in' | 'out'>('in')
  const [quantity,   setQuantity]   = useState('')
  const [notes,      setNotes]      = useState('')
  const [loading,    setLoading]    = useState(false)

  const selectedProduct = products.find((p) => p.id === productId)

  async function onSubmit() {
    if (!productId)                    { toast.error('Select a product'); return }
    if (!quantity || parseFloat(quantity) <= 0) { toast.error('Enter a valid quantity'); return }
    if (notes.trim().length < 3)       { toast.error('Notes required (min 3 characters)'); return }

    setLoading(true)
    const res = await fetch('/api/stock/adjust', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ productId, direction, quantity, notes }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Stock adjustment recorded'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to record adjustment') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Manual Stock Adjustment</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Product</Label>
            <select
              className="mt-1 w-full border rounded px-3 py-2 text-sm bg-white focus:outline-none"
              style={{ borderColor: colors.border }}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as 'in' | 'out')}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock IN (add)</SelectItem>
                  <SelectItem value="out">Stock OUT (remove)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                Quantity{' '}
                {selectedProduct && (
                  <span className="font-normal" style={{ color: colors.textSecondary }}>
                    ({selectedProduct.unit})
                  </span>
                )}
              </Label>
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.000"
                className="mt-1 font-mono"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <Label>Reason / Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Write-off, inventory count correction"
              className="mt-1"
              disabled={loading}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: '#E0E0E0',
                border: '1px solid #999',
                borderRadius: 2,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#E0E0E0' }}
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={loading}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: '#E0E0E0',
                border: '1px solid #999',
                borderRadius: 2,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#E0E0E0' }}
            >
              {loading ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Record Adjustment'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
