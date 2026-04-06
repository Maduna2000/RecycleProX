'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { format } from '@/lib/utils/format'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Product = { id: string; code: string; name: string; unit: string; category: string }
type StocktakeEntry = {
  id: string
  productId: string
  product: Product
  systemQty: string
  countedQty: string
  variance: string
}
type Stocktake = {
  id: string
  refNumber: string
  status: 'open' | 'completed'
  notes: string | null
  completedAt: string | null
  createdAt: string
  createdBy: { fullName: string }
  entries: StocktakeEntry[]
}

const CATEGORY_LABELS: Record<string, string> = {
  ferrous: 'Ferrous', non_ferrous: 'Non-Ferrous', copper: 'Copper',
  aluminium: 'Aluminium', plastic: 'Plastic', paper: 'Paper', e_waste: 'E-Waste', other: 'Other',
}

export default function StocktakeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: stocktake, isLoading } = useSWR<Stocktake>(
    isManager ? `/api/stocktake/${id}` : null,
    fetcher
  )
  const { data: productsData } = useSWR<{ products: Product[] }>(
    isManager ? '/api/products?active=true' : null,
    fetcher
  )

  const [productId, setProductId] = useState('')
  const [countedQty, setCountedQty] = useState('')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)

  if (!isManager) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Access restricted to managers and administrators.
      </div>
    )
  }

  async function handleAddEntry() {
    if (!productId) { toast.error('Select a product'); return }
    if (!countedQty || parseFloat(countedQty) < 0) { toast.error('Enter a valid quantity (0 or more)'); return }
    setSaving(true)
    const res = await fetch(`/api/stocktake/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, countedQty }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('Entry saved')
      mutate(`/api/stocktake/${id}`)
      setProductId('')
      setCountedQty('')
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to save entry')
    }
  }

  async function handleComplete() {
    if (!confirm('Mark this stocktake as completed? This cannot be undone.')) return
    setCompleting(true)
    const res = await fetch(`/api/stocktake/${id}`, { method: 'POST' })
    setCompleting(false)
    if (res.ok) {
      toast.success('Stocktake completed')
      mutate(`/api/stocktake/${id}`)
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to complete')
    }
  }

  const products = productsData?.products ?? []
  const entries = stocktake?.entries ?? []
  const isOpen = stocktake?.status === 'open'

  // Products not yet counted
  const countedIds = new Set(entries.map((e) => e.productId))
  const remainingProducts = products.filter((p) => !countedIds.has(p.id))

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!stocktake) {
    return <div className="p-10 text-center text-gray-400">Stocktake not found</div>
  }

  const variances = entries.filter((e) => new Decimal(e.variance).abs().gt(0))

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{stocktake.refNumber}</h1>
            {isOpen
              ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Open</Badge>
              : <Badge variant="secondary">Completed</Badge>}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Created by {stocktake.createdBy.fullName} · {format.datetime(stocktake.createdAt)}
            {stocktake.completedAt && ` · Completed ${format.datetime(stocktake.completedAt)}`}
          </p>
          {stocktake.notes && <p className="text-sm text-gray-600 mt-1">{stocktake.notes}</p>}
        </div>
        {isOpen && (
          <Button
            onClick={handleComplete}
            disabled={completing || entries.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {completing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Completing...</> : <><CheckCircle className="w-4 h-4 mr-2" />Complete Stocktake</>}
          </Button>
        )}
      </div>

      {/* Summary */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{entries.length}</p>
            <p className="text-xs text-gray-500 mt-1">Products Counted</p>
          </div>
          <div className={`rounded-xl border p-4 text-center ${variances.length > 0 ? 'bg-orange-50' : 'bg-white'}`}>
            <p className={`text-2xl font-bold ${variances.length > 0 ? 'text-orange-700' : 'text-gray-900'}`}>{variances.length}</p>
            <p className="text-xs text-gray-500 mt-1">Variances Found</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{remainingProducts.length}</p>
            <p className="text-xs text-gray-500 mt-1">Products Remaining</p>
          </div>
        </div>
      )}

      {/* Add entry form */}
      {isOpen && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Add Count Entry</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="sm:col-span-2">
              <Label>Product</Label>
              <Select value={productId} onValueChange={(v) => setProductId(v ?? '')}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className={countedIds.has(p.id) ? 'text-gray-400' : ''}>
                        {p.name} ({p.code}){countedIds.has(p.id) ? ' ✓' : ''}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Counted Qty {productId && products.find(p => p.id === productId) && <span className="text-gray-400 font-normal">({products.find(p => p.id === productId)?.unit})</span>}</Label>
              <Input
                value={countedQty}
                onChange={(e) => setCountedQty(e.target.value)}
                placeholder="0.000"
                className="mt-1 font-mono"
                disabled={saving}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleAddEntry} disabled={saving} className="bg-green-600 hover:bg-green-700">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Entry'}
            </Button>
          </div>
        </div>
      )}

      {/* Entries table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900">Count Entries ({entries.length})</h2>
        </div>
        {entries.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No entries yet — start counting products above</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Product', 'Category', 'System Qty', 'Counted Qty', 'Variance', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => {
                const variance = new Decimal(e.variance)
                const hasVariance = variance.abs().gt(0)
                return (
                  <tr key={e.id} className={hasVariance ? 'bg-orange-50' : ''}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{e.product.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{e.product.code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[e.product.category] ?? e.product.category}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">
                      {Number(e.systemQty).toFixed(3)} {e.product.unit}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">
                      {Number(e.countedQty).toFixed(3)} {e.product.unit}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-mono font-semibold ${variance.gt(0) ? 'text-green-700' : variance.lt(0) ? 'text-red-700' : 'text-gray-400'}`}>
                        {variance.gt(0) ? '+' : ''}{Number(e.variance).toFixed(3)} {e.product.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {hasVariance && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
 