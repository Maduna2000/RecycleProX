'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, Pencil, TrendingUp, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateProductSchema, UpdateProductSchema, BulkPriceUpdateSchema, type CreateProductInput, type CreateProductFormInput, type UpdateProductInput } from '@/lib/schemas/product'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function calcMargin(buy: string, sell: string): { pct: string; color: string } {
  const b = new Decimal(buy  || '0')
  const s = new Decimal(sell || '0')
  if (b.isZero()) return { pct: '—', color: colors.textSecondary }
  const pct = s.minus(b).dividedBy(b).times(100)
  const formatted = pct.toFixed(1) + '%'
  if (pct.gte(20)) return { pct: formatted, color: colors.action }
  if (pct.gte(10)) return { pct: formatted, color: colors.warning }
  return { pct: formatted, color: colors.danger }
}

const CATEGORIES = [
  { value: 'ferrous', label: 'Ferrous' },
  { value: 'non_ferrous', label: 'Non-Ferrous' },
  { value: 'copper', label: 'Copper' },
  { value: 'aluminium', label: 'Aluminium' },
  { value: 'plastic', label: 'Plastic' },
  { value: 'paper', label: 'Paper' },
  { value: 'e_waste', label: 'E-Waste' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_STYLES: Record<string, { background: string; color: string }> = {
  ferrous:     { background: colors.neutralBg,  color: colors.textSecondary },
  non_ferrous: { background: colors.processBg,  color: colors.process },
  copper:      { background: '#FEF3E8',          color: colors.danger },
  aluminium:   { background: '#F3EBF9',          color: '#7B2D8B' },
  plastic:     { background: colors.warningBg,  color: colors.warning },
  paper:       { background: colors.actionBg,   color: colors.action },
  e_waste:     { background: colors.dangerBg,   color: colors.danger },
  other:       { background: colors.neutralBg,  color: colors.textSecondary },
}

type Product = {
  id: string; code: string; name: string; category: string; unit: string
  defaultBuyPrice: string; defaultSellPrice: string; isActive: boolean; sortOrder: number
}

export default function ProductsPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  // Open Add Product modal from toolbar query param (?add=1)
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setCreateOpen(true)
      router.replace('/app/products')
    }
  }, [searchParams, router])

  const query = new URLSearchParams({
    ...(search && { search }),
    ...(category && { category }),
    active: activeOnly ? 'true' : 'false',
  })

  const { data } = useSWR<{ products: Product[] }>(`/api/products?${query}`, fetcher)
  const products = data?.products ?? []

  // Group by category for display
  const grouped = CATEGORIES.map(({ value, label }) => ({
    category: value,
    label,
    items: products.filter((p) => p.category === value),
  })).filter((g) => g.items.length > 0)

  const revalidate = () => mutate(`/api/products?${query}`)

  return (
    <PageShell title="Products" subtitle={`${products.length} products`}>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center shrink-0 mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} />
          <Input
            placeholder="Search code or name…"
            className="pl-7 h-7 text-xs w-56"
            style={{ borderColor: colors.border }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border rounded px-2 py-1 text-xs bg-white focus:outline-none"
          style={{ borderColor: colors.border, color: colors.textPrimary }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: colors.textSecondary }}>
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="rounded" />
          Active only
        </label>
        {isManager && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setBulkOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border bg-white"
              style={{ borderColor: colors.border, color: colors.textPrimary }}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Bulk Price Update
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-white"
              style={{ background: colors.action }}
            >
              <Plus className="w-3.5 h-3.5" /> Add Product
            </button>
          </div>
        )}
      </div>

      {/* Product tables grouped by category */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-4">
        {grouped.length === 0 ? (
          <div
            className="flex items-center justify-center py-10 rounded-lg text-sm"
            style={{ background: colors.toolbar, border: `1px solid ${colors.border}`, color: colors.textSecondary }}
          >
            No products found
          </div>
        ) : (
          grouped.map(({ category: cat, label, items }) => (
            <div key={cat} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              <div
                className="flex items-center gap-2 px-4 py-2"
                style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.border}` }}
              >
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={CATEGORY_STYLES[cat] ?? { background: colors.neutralBg, color: colors.textSecondary }}
                >
                  {label}
                </span>
                <span className="text-xs" style={{ color: colors.textSecondary }}>{items.length} items</span>
              </div>
              <table className="w-full" style={{ background: colors.surface }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    {['Code', 'Name', 'Unit', 'Buy Price', 'Sell Price', 'Margin %', 'Status', ...(isManager ? [''] : [])].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2"
                        style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: i < items.length - 1 ? `1px solid ${colors.neutralBg}` : 'none' }}>
                      <td className="px-4 py-2.5 font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{p.code}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{p.name}</td>
                      <td className="px-4 py-2.5 uppercase" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{p.unit}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ fontSize: fontSize.sm, color: colors.action }}>R {new Decimal(p.defaultBuyPrice).toFixed(2)}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ fontSize: fontSize.sm, color: colors.process }}>R {new Decimal(p.defaultSellPrice).toFixed(2)}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold" style={{ fontSize: fontSize.sm, color: calcMargin(p.defaultBuyPrice, p.defaultSellPrice).color }}>
                        {calcMargin(p.defaultBuyPrice, p.defaultSellPrice).pct}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={p.isActive
                            ? { background: colors.actionBg, color: colors.action }
                            : { background: colors.neutralBg, color: colors.textSecondary }
                          }
                        >
                          {p.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {isManager && (
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => setEditProduct(p)}
                            className="p-1 rounded"
                            style={{ color: colors.textSecondary }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = colors.neutralBg)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {createOpen && (
        <CreateProductModal
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { revalidate(); setCreateOpen(false) }}
        />
      )}
      {editProduct && (
        <EditProductModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSuccess={() => { revalidate(); setEditProduct(null) }}
        />
      )}
      {bulkOpen && (
        <BulkPriceModal
          products={products}
          onClose={() => setBulkOpen(false)}
          onSuccess={() => { revalidate(); setBulkOpen(false) }}
        />
      )}
    </PageShell>
  )
}

// ─── Create Product Modal ─────────────────────────────────────────────────────
function CreateProductModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<CreateProductFormInput, unknown, CreateProductInput>({
    resolver: zodResolver(CreateProductSchema),
    defaultValues: { unit: 'kg', isActive: true, sortOrder: 0 },
  })

  async function onSubmit(data: CreateProductInput) {
    setLoading(true)
    const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setLoading(false)
    if (res.ok) { toast.success('Product created'); onSuccess() }
    else if (res.status === 409) toast.error('Product code already exists')
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to create product') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Product Code</Label>
              <Input {...register('code')} className="mt-1 uppercase" placeholder="e.g. CU-WIRE" disabled={loading} />
              {errors.code && <p className="text-xs text-red-600 mt-1">{errors.code.message}</p>}
            </div>
            <div>
              <Label>Unit</Label>
              <Select onValueChange={(v) => setValue('unit', v as 'kg' | 'ton' | 'each' | 'litre')} defaultValue="kg">
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="ton">ton</SelectItem>
                  <SelectItem value="each">each</SelectItem>
                  <SelectItem value="litre">litre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Product Name</Label>
            <Input {...register('name')} className="mt-1" placeholder="e.g. Bright Copper Wire" disabled={loading} />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <Label>Category</Label>
            <Select onValueChange={(v) => setValue('category', v as CreateProductInput['category'])}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Buy Price (R)</Label>
              <Input {...register('defaultBuyPrice')} className="mt-1" placeholder="0.00" disabled={loading} />
              {errors.defaultBuyPrice && <p className="text-xs text-red-600 mt-1">{errors.defaultBuyPrice.message}</p>}
            </div>
            <div>
              <Label>Sell Price (R)</Label>
              <Input {...register('defaultSellPrice')} className="mt-1" placeholder="0.00" disabled={loading} />
              {errors.defaultSellPrice && <p className="text-xs text-red-600 mt-1">{errors.defaultSellPrice.message}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" style={{ background: colors.action }} className="hover:opacity-90 text-white" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Create Product'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Product Modal ───────────────────────────────────────────────────────
function EditProductModal({ product, onClose, onSuccess }: { product: Product; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<UpdateProductInput>({
    resolver: zodResolver(UpdateProductSchema),
    defaultValues: {
      name: product.name,
      category: product.category as UpdateProductInput['category'],
      unit: product.unit as UpdateProductInput['unit'],
      defaultBuyPrice: Number(product.defaultBuyPrice).toFixed(2),
      defaultSellPrice: Number(product.defaultSellPrice).toFixed(2),
      isActive: product.isActive,
      sortOrder: product.sortOrder,
    },
  })

  async function onSubmit(data: UpdateProductInput) {
    setLoading(true)
    const res = await fetch(`/api/products/${product.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setLoading(false)
    if (res.ok) { toast.success('Product updated'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to update product') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit Product — {product.code}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <Label>Product Name</Label>
            <Input {...register('name')} className="mt-1" disabled={loading} />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select onValueChange={(v) => setValue('category', v as UpdateProductInput['category'])} defaultValue={product.category}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Select onValueChange={(v) => setValue('unit', v as 'kg' | 'ton' | 'each' | 'litre')} defaultValue={product.unit}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="ton">ton</SelectItem>
                  <SelectItem value="each">each</SelectItem>
                  <SelectItem value="litre">litre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Buy Price (R)</Label>
              <Input {...register('defaultBuyPrice')} className="mt-1" disabled={loading} />
              {errors.defaultBuyPrice && <p className="text-xs text-red-600 mt-1">{errors.defaultBuyPrice.message}</p>}
            </div>
            <div>
              <Label>Sell Price (R)</Label>
              <Input {...register('defaultSellPrice')} className="mt-1" disabled={loading} />
              {errors.defaultSellPrice && <p className="text-xs text-red-600 mt-1">{errors.defaultSellPrice.message}</p>}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" defaultChecked={product.isActive} onChange={(e) => setValue('isActive', e.target.checked)} className="rounded" />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" style={{ background: colors.action }} className="hover:opacity-90 text-white" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Bulk Price Update Modal ──────────────────────────────────────────────────
function BulkPriceModal({ products, onClose, onSuccess }: { products: Product[]; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(false)
  const [reason, setReason] = useState('')
  const [prices, setPrices] = useState<Record<string, { buy: string; sell: string }>>(() =>
    Object.fromEntries(products.map((p) => [p.id, {
      buy: Number(p.defaultBuyPrice).toFixed(2),
      sell: Number(p.defaultSellPrice).toFixed(2),
    }]))
  )

  const changed = products.filter((p) => {
    const orig = { buy: Number(p.defaultBuyPrice).toFixed(2), sell: Number(p.defaultSellPrice).toFixed(2) }
    const curr = prices[p.id]
    return curr && (curr.buy !== orig.buy || curr.sell !== orig.sell)
  })

  async function onConfirm() {
    const parsed = BulkPriceUpdateSchema.safeParse({
      updates: changed.map((p) => ({
        productId: p.id,
        defaultBuyPrice: prices[p.id]!.buy,
        defaultSellPrice: prices[p.id]!.sell,
        reason: reason || undefined,
      })),
    })
    if (!parsed.success) { toast.error('Invalid price values'); return }

    setLoading(true)
    const res = await fetch('/api/products/bulk-price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) })
    setLoading(false)
    if (res.ok) { toast.success(`Updated ${changed.length} product prices`); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to update prices') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{preview ? 'Confirm Price Changes' : 'Bulk Price Update'}</DialogTitle>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-3 mt-2">
            <p className="text-sm" style={{ color: colors.textSecondary }}>Edit buy/sell prices below. Only changed prices will be updated.</p>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  {['Product', 'Buy Price (R)', 'Sell Price (R)'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-2 py-2 uppercase"
                      style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: colors.border }}>
                {products.filter((p) => p.isActive).map((p) => (
                  <tr
                    key={p.id}
                    style={
                      prices[p.id]?.buy !== Number(p.defaultBuyPrice).toFixed(2) ||
                      prices[p.id]?.sell !== Number(p.defaultSellPrice).toFixed(2)
                        ? { background: colors.warningBg }
                        : {}
                    }
                  >
                    <td className="px-2 py-2">
                      <p className="font-medium" style={{ color: colors.textPrimary }}>{p.name}</p>
                      <p className="text-xs font-mono" style={{ color: colors.textMuted }}>{p.code}</p>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        value={prices[p.id]?.buy ?? ''}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, buy: e.target.value } }))}
                        className="w-28 h-8 text-sm font-mono"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        value={prices[p.id]?.sell ?? ''}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, sell: e.target.value } }))}
                        className="w-28 h-8 text-sm font-mono"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <Label>Reason for update <span className="font-normal" style={{ color: colors.textMuted }}>(optional)</span></Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" placeholder="e.g. Market price adjustment" />
            </div>
            <div className="flex justify-between items-center pt-2">
              <p className="text-sm" style={{ color: colors.textSecondary }}>{changed.length} product{changed.length !== 1 ? 's' : ''} changed</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                  type="button"
                  style={{ background: colors.action }}
                  className="hover:opacity-90 text-white"
                  disabled={changed.length === 0}
                  onClick={() => setPreview(true)}
                >
                  Preview Changes
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <p className="text-sm" style={{ color: colors.textSecondary }}>The following {changed.length} price{changed.length !== 1 ? 's' : ''} will be updated:</p>
            <table className="w-full text-sm rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
              <thead style={{ background: colors.neutralBg, borderBottom: `1px solid ${colors.border}` }}>
                <tr>
                  {['Product', 'Old Buy', 'New Buy', 'Old Sell', 'New Sell'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 uppercase"
                      style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: colors.border }}>
                {changed.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium" style={{ color: colors.textPrimary }}>{p.name}</p>
                      <p className="text-xs font-mono" style={{ color: colors.textMuted }}>{p.code}</p>
                    </td>
                    <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>R {Number(p.defaultBuyPrice).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: colors.action }}>R {Number(prices[p.id]?.buy).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>R {Number(p.defaultSellPrice).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: colors.process }}>R {Number(prices[p.id]?.sell).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reason && <p className="text-sm" style={{ color: colors.textSecondary }}>Reason: <span className="font-medium">{reason}</span></p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPreview(false)} disabled={loading}>Back</Button>
              <Button
                type="button"
                style={{ background: colors.action }}
                className="hover:opacity-90 text-white"
                onClick={onConfirm}
                disabled={loading}
              >
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</> : 'Confirm Update'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
