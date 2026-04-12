'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { SlidersHorizontal, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Download } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from '@/lib/utils/format'

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

  const today = new Date().toISOString().slice(0, 10)
  const [gridPeriod,   setGridPeriod]   = useState<'daily' | 'weekly' | 'mtd'>('mtd')
  const [gridDate,     setGridDate]     = useState(today)
  const [gridCategory, setGridCategory] = useState('')
  const [exporting,    setExporting]    = useState(false)

  const { data: stockData } = useSWR<{ stock: StockEntry[] }>('/api/stock/on-hand', fetcher)
  const { data: movementsData, isLoading: movLoading } = useSWR<{ movements: Movement[]; total: number }>(
    '/api/stock/movements?pageSize=200',
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
              <p style={{ fontSize: 12, fontWeight: 500, color: '#212529' }}>{r.product.name}</p>
              <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{r.product.code}</p>
            </div>
            {belowReorder && (
              <AlertTriangle
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: '#C9A020' }}
                title={`Below reorder level (min: ${minLevel?.toFixed(3)} ${r.product.unit})`}
              />
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
        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F1F3F4', color: '#6C757D' }}>
          {CATEGORY_LABELS[r.product.category] ?? r.product.category}
        </span>
      ),
    },
    {
      key: 'totalIn',
      header: 'Total In',
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: '#217346' }}>
          {Number(r.totalIn).toFixed(3)} {r.product.unit}
        </span>
      ),
    },
    {
      key: 'totalOut',
      header: 'Total Out',
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: '#C0392B' }}>
          {Number(r.totalOut).toFixed(3)} {r.product.unit}
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
              ? <TrendingUp  className="w-3.5 h-3.5" style={{ color: '#217346' }} />
              : qty < 0
              ? <TrendingDown className="w-3.5 h-3.5" style={{ color: '#C0392B' }} />
              : <Minus className="w-3.5 h-3.5" style={{ color: '#CCC' }} />}
            <span
              className="font-mono font-semibold text-xs"
              style={{ color: qty > 0 ? '#212529' : qty < 0 ? '#C0392B' : '#6C757D' }}
            >
              {Number(r.onHand).toFixed(3)} {r.product.unit}
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
          <p style={{ fontSize: 12, fontWeight: 500, color: '#212529' }}>{r.product.name}</p>
          <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{r.product.code}</p>
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
              ? { background: '#F0FBF4', color: '#217346' }
              : { background: '#FEF2F2', color: '#C0392B' }
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
        <span className="font-mono text-xs" style={{ color: '#212529' }}>
          {Number(r.quantity).toFixed(3)} {r.product.unit}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      width: '120px',
      render: (r) => (
        <span className="px-2 py-0.5 rounded border text-xs" style={{ borderColor: '#E0E0E0', color: '#6C757D' }}>
          {SOURCE_LABELS[r.source] ?? r.source}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (r) => (
        <span className="truncate block max-w-[180px] text-xs" style={{ color: '#6C757D' }}>{r.notes ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      width: '140px',
      render: (r) => <span style={{ fontSize: 11, color: '#6C757D' }}>{format.datetime(r.createdAt)}</span>,
    },
  ]

  // ── Stock Grid columns ───────────────────────────────────────────────────────
  const gridColumns: Column<GridRow>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (r) => (
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#212529' }}>{r.name}</p>
          <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{r.code}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Cat',
      width: '100px',
      render: (r) => <span style={{ fontSize: 11, color: '#6C757D' }}>{CATEGORY_LABELS[r.category] ?? r.category}</span>,
    },
    {
      key: 'unit',
      header: 'Unit',
      width: '56px',
      render: (r) => <span style={{ fontSize: 11, color: '#6C757D' }}>{r.unit}</span>,
    },
    {
      key: 'openingQty',
      header: 'Opening',
      width: '88px',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#6C757D' }}>{r.openingQty}</span>,
    },
    {
      key: 'purchasedQty',
      header: 'Purchased',
      width: '90px',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#217346' }}>{r.purchasedQty}</span>,
    },
    {
      key: 'soldQty',
      header: 'Sold',
      width: '80px',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#C0392B' }}>{r.soldQty}</span>,
    },
    {
      key: 'adjustedQty',
      header: 'Adjusted',
      width: '84px',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#185ABD' }}>{r.adjustedQty}</span>,
    },
    {
      key: 'closingQty',
      header: 'Closing',
      width: '84px',
      render: (r) => {
        const isNeg = new Decimal(r.closingQty).isNegative()
        return (
          <span className="font-mono text-xs font-semibold" style={{ color: isNeg ? '#C0392B' : '#212529' }}>
            {r.closingQty}
          </span>
        )
      },
    },
    {
      key: 'closingValue',
      header: 'Value (R)',
      width: '96px',
      render: (r) => <span className="font-mono text-xs" style={{ color: '#212529' }}>R {r.closingValue}</span>,
    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Page header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Stock</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>
            {totalProducts} products in stock
            {lowStock > 0 && <span style={{ color: '#C0392B' }}> · {lowStock} negative</span>}
            {reorderCount > 0 && <span style={{ color: '#C9A020' }}> · {reorderCount} below reorder</span>}
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setAdjustOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border border-[#E0E0E0] bg-white"
            style={{ color: '#212529' }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Manual Adjustment
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-[#E0E0E0] shrink-0">
        {([['onhand', 'Stock On Hand'], ['movements', 'Movement History'], ['grid', 'Stock Grid']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === id ? '#185ABD' : 'transparent',
              color:       activeTab === id ? '#185ABD' : '#6C757D',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* On Hand tab */}
      {activeTab === 'onhand' && (
        <>
          <div className="flex gap-2 items-center shrink-0">
            <select
              className="border border-[#E0E0E0] rounded px-2 py-1 text-xs bg-white focus:outline-none"
              style={{ color: '#212529' }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: '#6C757D' }}>
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
      )}

      {/* Stock Grid tab */}
      {activeTab === 'grid' && (
        <>
          <div className="flex flex-wrap gap-3 items-end shrink-0">
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#6C757D' }}>Period</p>
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
              <p className="text-xs font-medium mb-1" style={{ color: '#6C757D' }}>Date</p>
              <Input type="date" value={gridDate} max={today} onChange={(e) => setGridDate(e.target.value)} className="w-40 h-8 text-xs" />
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#6C757D' }}>Category</p>
              <select
                className="border border-[#E0E0E0] rounded px-2 h-8 text-xs bg-white focus:outline-none"
                style={{ color: '#212529' }}
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
              className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border border-[#E0E0E0] bg-white disabled:opacity-50"
              style={{ color: '#212529' }}
            >
              {exporting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting…</>
                : <><Download className="w-3.5 h-3.5" /> Export Excel</>}
            </button>
          </div>

          <div className="flex-1 min-h-0">
            {gridLoading ? (
              <div className="flex items-center justify-center h-32 gap-2" style={{ color: '#6C757D' }}>
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
    </div>
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
              className="mt-1 w-full border border-[#E0E0E0] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#185ABD]"
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
                  <span className="font-normal" style={{ color: '#6C757D' }}>({selectedProduct.unit})</span>
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
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button style={{ background: '#217346' }} className="hover:opacity-90" onClick={onSubmit} disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Record Adjustment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
