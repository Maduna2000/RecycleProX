'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CategoryFilterSelect, useProductCategories } from '@/components/products/CategoryFilterSelect'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import {
  inp, Btn, Field, PortalPage, FilterBar,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type StockEntry = {
  product: { id: string; code: string; name: string; category: string; unit: string; minStockLevel?: string | null }
  totalIn: string
  totalOut: string
  onHand: string
  hasMovements: boolean
  /** Present when a period filter is active: balance before the period started. */
  opening?: string
}

const PERIOD_OPTIONS = [
  { value: '',       label: 'All Time' },
  { value: 'daily',  label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'mtd',    label: 'Month' },
  { value: 'yearly', label: 'Year' },
] as const

const PERIOD_HINTS: Record<string, string> = {
  daily:  'movements on the selected day',
  weekly: 'movements in the Mon–Sun week containing the selected day',
  mtd:    'movements from the 1st of the month to the selected day',
  yearly: 'movements from 1 January to the selected day',
}

export default function StockPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const today = new Date().toISOString().split('T')[0]!

  const [adjustOpen,       setAdjustOpen]       = useState(false)
  const [categoryFilter,   setCategoryFilter]   = useState('')
  const [showZero,         setShowZero]         = useState(true)
  const [onHandSearch,     setOnHandSearch]     = useState('')
  const [period,           setPeriod]           = useState('')
  const [periodDate,       setPeriodDate]       = useState(today)
  const [belowReorderOnly, setBelowReorderOnly] = useState(false)

  // Check for ?adjust=1 query parameter to auto-open modal
  useEffect(() => {
    if (searchParams.get('adjust') === '1' && isManager) {
      setAdjustOpen(true)
      // Remove the query parameter from URL
      router.replace('/app/stock', { scroll: false })
    }
  }, [searchParams, isManager, router])

  // All Time = live levels; a period scopes In/Out to that window with an
  // opening balance carried in
  const stockKey = `/api/stock/on-hand${period ? `?period=${period}&date=${periodDate}` : ''}`
  const { data: stockData } = useSWR<{ stock: StockEntry[] }>(stockKey, fetcher)
  const { expandCategory } = useProductCategories()

  const allStock = stockData?.stock ?? []
  // A parent category selection covers its sub-categories too
  const categoryNames = categoryFilter ? expandCategory(categoryFilter) : null
  const stock = allStock.filter((s) => {
    if (!showZero && parseFloat(s.onHand) === 0 && !s.hasMovements) return false
    if (categoryNames && !categoryNames.has(s.product.category)) return false
    if (belowReorderOnly) {
      const min = s.product.minStockLevel ? parseFloat(s.product.minStockLevel) : null
      if (min === null || parseFloat(s.onHand) >= min) return false
    }
    if (onHandSearch) {
      const q = onHandSearch.toLowerCase()
      if (!s.product.name.toLowerCase().includes(q) && !s.product.code.toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalProducts = stock.filter((s) => parseFloat(s.onHand) > 0).length
  const lowStock      = stock.filter((s) => parseFloat(s.onHand) < 0).length
  const reorderCount  = stock.filter((s) => {
    const min = s.product.minStockLevel ? parseFloat(s.product.minStockLevel) : null
    return min !== null && parseFloat(s.onHand) < min
  }).length

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
          {r.product.category}
        </span>
      ),
    },
    // Opening balance column only makes sense with a period window
    ...(period ? [{
      key: 'opening',
      header: 'Opening',
      width: '110px',
      render: (r: StockEntry) => (
        <span className="font-mono text-xs" style={{ color: colors.textSecondary }}>
          {Number(r.opening ?? 0).toFixed(2)} {r.product.unit}
        </span>
      ),
    } satisfies Column<StockEntry>] : []),
    {
      key: 'totalIn',
      header: period ? 'In' : 'Total In',
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.action }}>
          {Number(r.totalIn).toFixed(2)} {r.product.unit}
        </span>
      ),
    },
    {
      key: 'totalOut',
      header: period ? 'Out' : 'Total Out',
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

  const subtitleParts = [
    `${totalProducts} products in stock`,
    lowStock > 0 ? `${lowStock} negative` : null,
    reorderCount > 0 ? `${reorderCount} below reorder` : null,
  ].filter(Boolean).join(' · ')

  return (
    <PortalPage
      title="Stock On Hand"
      actions={isManager ? <Btn variant="primary" size="sm" onClick={() => setAdjustOpen(true)}>Manual Adjustment</Btn> : undefined}
    >
      <FilterBar>
        <Field label="Search" width={180}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
            <input
              value={onHandSearch}
              onChange={(e) => setOnHandSearch(e.target.value)}
              placeholder="Search product..."
              style={{ ...inp, paddingLeft: 26 }}
            />
          </div>
        </Field>
        <Field label="Category" width={160}>
          <CategoryFilterSelect
            style={inp}
            value={categoryFilter}
            onChange={setCategoryFilter}
          />
        </Field>
        <Field label="Period" width={130}>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={inp}
            title="Track stock by day, week, month, or year"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>
        {period && (
          <Field label="Anchor Date" width={150}>
            <input
              type="date"
              value={periodDate}
              max={today}
              onChange={(e) => setPeriodDate(e.target.value || today)}
              style={inp}
              title="Anchor date for the selected period"
            />
          </Field>
        )}
        <label
          className="flex items-center gap-1.5 text-xs cursor-pointer"
          style={{ color: colors.textSecondary, paddingBottom: 8 }}
        >
          <input
            type="checkbox"
            checked={showZero}
            onChange={(e) => setShowZero(e.target.checked)}
            className="rounded"
          />
          Show zero stock
        </label>
        <label
          className="flex items-center gap-1.5 text-xs cursor-pointer"
          style={{ color: colors.textSecondary, paddingBottom: 8 }}
        >
          <input
            type="checkbox"
            checked={belowReorderOnly}
            onChange={(e) => setBelowReorderOnly(e.target.checked)}
            className="rounded"
          />
          Below reorder only
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6C757D', paddingBottom: 8 }}>{subtitleParts}</span>
      </FilterBar>
      {period && (
        <p style={{ margin: '8px 14px 0', fontSize: 11, color: colors.warning }}>
          Tracking {PERIOD_HINTS[period]} ({periodDate}) — On Hand = Opening + In − Out.
        </p>
      )}
      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={onHandColumns}
          rows={stock}
          rowKey={(r) => r.product.id}
          loading={!stockData}
          emptyMessage="No stock data — complete some purchases first"
        />
      </div>

      {adjustOpen && (
        <AdjustmentModal
          products={allStock.map((s) => s.product)}
          onClose={() => setAdjustOpen(false)}
          onSuccess={() => {
            mutate(stockKey)
            mutate('/api/stock/movements?pageSize=200')
            setAdjustOpen(false)
          }}
        />
      )}
    </PortalPage>
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
      <RpxDialogContent maxWidth={480}>
        <RpxDialogHeader title="Manual Stock Adjustment" onClose={onClose} />
        <RpxDialogBody>
        <div className="space-y-4">
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

        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" loading={loading} onClick={onSubmit}>
            Record Adjustment
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
