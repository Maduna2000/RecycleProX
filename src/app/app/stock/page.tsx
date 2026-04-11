'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SlidersHorizontal, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Download, Grid3X3 } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { format } from '@/lib/utils/format'
import Decimal from 'decimal.js'

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
  id: string
  direction: 'in' | 'out'
  quantity: string
  source: string
  sourceId?: string
  notes?: string
  createdAt: string
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

export default function StockPage() {
  const { data: session } = useSession()
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showZero, setShowZero] = useState(true)

  // Stock Grid state
  const today = new Date().toISOString().slice(0, 10)
  const [gridPeriod, setGridPeriod]     = useState<'daily' | 'weekly' | 'mtd'>('mtd')
  const [gridDate, setGridDate]         = useState(today)
  const [gridCategory, setGridCategory] = useState('')
  const [exporting, setExporting]       = useState(false)

  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: stockData } = useSWR<{ stock: StockEntry[] }>('/api/stock/on-hand', fetcher)
  const { data: movementsData } = useSWR<{ movements: Movement[]; total: number }>('/api/stock/movements?pageSize=200', fetcher)

  const gridKey = `/api/stock/grid?period=${gridPeriod}&date=${gridDate}${gridCategory ? `&category=${gridCategory}` : ''}`
  const { data: gridData, isLoading: gridLoading } = useSWR<{ grid: GridRow[] }>(gridKey, fetcher)

  async function handleExport() {
    setExporting(true)
    const exportUrl = `/api/stock/grid/export?period=${gridPeriod}&date=${gridDate}${gridCategory ? `&category=${gridCategory}` : ''}`
    const res = await fetch(exportUrl)
    setExporting(false)
    if (!res.ok) { toast.error('Export failed'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stock-grid-${gridPeriod}-${gridDate}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const allStock = stockData?.stock ?? []
  const stock = allStock.filter((s) => {
    if (!showZero && parseFloat(s.onHand) === 0 && !s.hasMovements) return false
    if (categoryFilter && s.product.category !== categoryFilter) return false
    return true
  })

  const movements = movementsData?.movements ?? []

  // Totals
  const totalProducts = stock.filter((s) => parseFloat(s.onHand) > 0).length
  const lowStock = stock.filter((s) => parseFloat(s.onHand) < 0).length
  const reorderCount = stock.filter((s) => {
    const min = s.product.minStockLevel ? parseFloat(s.product.minStockLevel) : null
    return min !== null && parseFloat(s.onHand) < min
  }).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalProducts} products in stock
            {lowStock > 0 && <span className="text-red-500 ml-2">· {lowStock} negative balance</span>}
            {reorderCount > 0 && <span className="text-orange-500 ml-2">· {reorderCount} below reorder level</span>}
          </p>
        </div>
        {isManager && (
          <Button variant="outline" onClick={() => setAdjustOpen(true)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" /> Manual Adjustment
          </Button>
        )}
      </div>

      <Tabs defaultValue="onhand">
        <TabsList className="mb-4">
          <TabsTrigger value="onhand">Stock On Hand</TabsTrigger>
          <TabsTrigger value="movements">Movement History</TabsTrigger>
          <TabsTrigger value="grid"><Grid3X3 className="w-3.5 h-3.5 mr-1.5 inline" />Stock Grid</TabsTrigger>
        </TabsList>

        {/* ── On-Hand Tab ── */}
        <TabsContent value="onhand">
          <div className="flex gap-3 mb-4">
            <select
              className="border rounded-md px-3 py-2 text-sm bg-white"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showZero}
                onChange={(e) => setShowZero(e.target.checked)}
                className="rounded"
              />
              Show zero stock
            </label>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            {stock.length === 0 ? (
              <div className="p-10 text-center text-gray-400">No stock data — complete some purchases first</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Product', 'Category', 'Total In', 'Total Out', 'On Hand', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stock.map(({ product: p, totalIn, totalOut, onHand }) => {
                    const qty = parseFloat(onHand)
                    const minLevel = p.minStockLevel ? parseFloat(p.minStockLevel) : null
                    const belowReorder = minLevel !== null && qty < minLevel
                    return (
                      <tr key={p.id} className={qty < 0 ? 'bg-red-50' : belowReorder ? 'bg-orange-50' : qty === 0 ? 'opacity-60' : ''}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium text-gray-900">{p.name}</p>
                              <p className="text-xs text-gray-400 font-mono">{p.code}</p>
                            </div>
                            {belowReorder && (
                              <span title={`Below reorder level (min: ${minLevel?.toFixed(3)} ${p.unit})`}>
                                <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[p.category] ?? p.category}</Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-green-700">
                          {Number(totalIn).toFixed(3)} {p.unit}
                        </td>
                        <td className="px-4 py-3 font-mono text-red-600">
                          {Number(totalOut).toFixed(3)} {p.unit}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-mono font-semibold ${qty > 0 ? 'text-gray-900' : qty < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {Number(onHand).toFixed(3)} {p.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {qty > 0
                            ? <TrendingUp className="w-4 h-4 text-green-500" />
                            : qty < 0
                            ? <TrendingDown className="w-4 h-4 text-red-500" />
                            : <Minus className="w-4 h-4 text-gray-300" />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* ── Movements Tab ── */}
        <TabsContent value="movements">
          <div className="bg-white rounded-xl border overflow-hidden">
            {movements.length === 0 ? (
              <div className="p-10 text-center text-gray-400">No movements recorded yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Product', 'Direction', 'Quantity', 'Source', 'Notes', 'Date'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{m.product.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{m.product.code}</p>
                      </td>
                      <td className="px-4 py-3">
                        {m.direction === 'in'
                          ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">IN</Badge>
                          : <Badge className="bg-red-100 text-red-700 hover:bg-red-100">OUT</Badge>}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">
                        {Number(m.quantity).toFixed(3)} {m.product.unit}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{SOURCE_LABELS[m.source] ?? m.source}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{m.notes ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{format.datetime(m.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
        {/* ── Stock Grid Tab ── */}
        <TabsContent value="grid">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div>
              <Label className="text-xs mb-1 block">Period</Label>
              <Select value={gridPeriod} onValueChange={(v) => setGridPeriod(v as 'daily' | 'weekly' | 'mtd')}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="mtd">Month to Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Date</Label>
              <Input type="date" value={gridDate} max={today} onChange={(e) => setGridDate(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Category</Label>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-white h-10"
                value={gridCategory}
                onChange={(e) => setGridCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={exporting} className="ml-auto">
              {exporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exporting...</> : <><Download className="w-4 h-4 mr-2" />Export Excel</>}
            </Button>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden overflow-x-auto">
            {gridLoading ? (
              <div className="flex items-center justify-center p-10 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Building grid...
              </div>
            ) : !gridData?.grid?.length ? (
              <div className="text-center p-10 text-gray-400">No data for selected period</div>
            ) : (
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Product', 'Cat', 'Unit', 'Opening', 'Purchased', 'Sold', 'Adjusted', 'Closing', 'Value (R)'].map((h) => (
                      <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {gridData.grid.map((row) => {
                    const closingNum = new Decimal(row.closingQty)
                    return (
                      <tr key={row.productId} className={closingNum.isNegative() ? 'bg-red-50' : closingNum.isZero() ? 'opacity-60' : ''}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{row.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{row.code}</p>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{CATEGORY_LABELS[row.category] ?? row.category}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{row.unit}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.openingQty}</td>
                        <td className="px-3 py-2 font-mono text-xs text-green-700">{row.purchasedQty}</td>
                        <td className="px-3 py-2 font-mono text-xs text-red-600">{row.soldQty}</td>
                        <td className="px-3 py-2 font-mono text-xs text-blue-600">{row.adjustedQty}</td>
                        <td className={`px-3 py-2 font-mono text-xs font-semibold ${closingNum.isNegative() ? 'text-red-600' : 'text-gray-900'}`}>
                          {row.closingQty}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">R {row.closingValue}</td>
                      </tr>
                    )
                  })}
                  {/* Totals row */}
                  {(() => {
                    const total = gridData.grid.reduce((acc, r) => acc.plus(new Decimal(r.closingValue)), new Decimal(0))
                    return (
                      <tr className="bg-gray-50 font-semibold">
                        <td colSpan={8} className="px-3 py-2 text-right text-xs text-gray-600">Total Closing Value</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-900">R {total.toFixed(2)}</td>
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

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
  products: StockEntry['product'][]
  onClose: () => void
  onSuccess: () => void
}) {
  const [productId, setProductId] = useState('')
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (!productId) { toast.error('Select a product'); return }
    if (!quantity || parseFloat(quantity) <= 0) { toast.error('Enter a valid quantity'); return }
    if (notes.trim().length < 3) { toast.error('Notes required (min 3 characters)'); return }

    setLoading(true)
    const res = await fetch('/api/stock/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, direction, quantity, notes }),
    })
    setLoading(false)

    if (res.ok) { toast.success('Stock adjustment recorded'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to record adjustment') }
  }

  const selectedProduct = products.find((p) => p.id === productId)

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Manual Stock Adjustment</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Product</Label>
            <select
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Select product...</option>
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
              <Label>Quantity {selectedProduct && <span className="text-gray-400 font-normal">({selectedProduct.unit})</span>}</Label>
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
            <Button className="bg-green-600 hover:bg-green-700" onClick={onSubmit} disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Record Adjustment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
