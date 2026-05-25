'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, ModalTitleBar, ModalBtn } from '@/components/ui/dialog'
import { Search, Pencil, TrendingUp, Plus, Eye, EyeOff, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateProductSchema, UpdateProductSchema, BulkPriceUpdateSchema, type CreateProductInput, type CreateProductFormInput, type UpdateProductInput } from '@/lib/schemas/product'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import { PageShell } from '@/components/layout/PageShell'
import { DataTable, StatusBadge } from '@/components/ui/DataTable'
import type { Column, RowAction } from '@/components/ui/DataTable'
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
  { value: 'ferrous',     label: 'Ferrous' },
  { value: 'non_ferrous', label: 'Non-Ferrous' },
  { value: 'copper',      label: 'Copper' },
  { value: 'aluminium',   label: 'Aluminium' },
  { value: 'plastic',     label: 'Plastic' },
  { value: 'paper',       label: 'Paper' },
  { value: 'e_waste',     label: 'E-Waste' },
  { value: 'other',       label: 'Other' },
]

const CATEGORY_STYLES: Record<string, { background: string; color: string }> = {
  ferrous:     { background: colors.neutralBg,  color: colors.textSecondary },
  non_ferrous: { background: colors.processBg,  color: colors.process },
  copper:      { background: '#FEF3E8',          color: '#C05621' },
  aluminium:   { background: '#F3EBF9',          color: '#7B2D8B' },
  plastic:     { background: colors.warningBg,  color: colors.warning },
  paper:       { background: colors.actionBg,   color: colors.action },
  e_waste:     { background: colors.dangerBg,   color: colors.danger },
  other:       { background: colors.neutralBg,  color: colors.textSecondary },
}

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

type Product = {
  id: string; code: string; name: string; category: string; unit: string
  defaultBuyPrice: string; defaultSellPrice: string; isActive: boolean; sortOrder: number
}

export default function ProductsPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const [search,        setSearch]       = useState('')
  const [category,      setCategory]     = useState('')
  const [statusFilter,  setStatus]       = useState('active')
  const [createOpen,    setCreateOpen]   = useState(false)
  const [editTarget,    setEditTarget]   = useState<Product | null>(null)
  const [deleteTarget,  setDeleteTarget] = useState<Product | null>(null)
  const [bulkOpen,      setBulkOpen]     = useState(false)
  const [selectedKeys,  setSelectedKeys] = useState<Set<string>>(new Set())
  const [bulkDelOpen,   setBulkDelOpen]  = useState(false)
  const [bulkLoading,   setBulkLoading]  = useState<'deactivate' | 'reactivate' | null>(null)

  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setCreateOpen(true)
      router.replace('/app/products')
    }
  }, [searchParams, router])

  const activeParam = statusFilter === 'active' ? 'true' : statusFilter === 'inactive' ? 'false' : undefined
  const query = new URLSearchParams({
    ...(search && { search }),
    ...(category && { category }),
    ...(activeParam !== undefined && { active: activeParam }),
  })

  const swrKey = `/api/products?${query}`
  const { data, isLoading } = useSWR<{ products: Product[] }>(swrKey, fetcher)
  const products = data?.products ?? []

  const revalidate = () => mutate(swrKey)

  // Clear selection when filters change
  useEffect(() => { setSelectedKeys(new Set()) }, [swrKey])

  async function handleBulkDeactivate() {
    setBulkLoading('deactivate')
    await Promise.all([...selectedKeys].map(id =>
      fetch(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: false }) })
    ))
    toast.success(`${selectedKeys.size} product${selectedKeys.size !== 1 ? 's' : ''} deactivated`)
    setSelectedKeys(new Set())
    revalidate()
    setBulkLoading(null)
  }

  async function handleBulkReactivate() {
    setBulkLoading('reactivate')
    await Promise.all([...selectedKeys].map(id =>
      fetch(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }) })
    ))
    toast.success(`${selectedKeys.size} product${selectedKeys.size !== 1 ? 's' : ''} reactivated`)
    setSelectedKeys(new Set())
    revalidate()
    setBulkLoading(null)
  }

  async function handleToggleActive(p: Product) {
    const res = await fetch(`/api/products/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    })
    if (res.ok) {
      toast.success(p.isActive ? 'Product deactivated' : 'Product reactivated')
      revalidate()
    } else {
      toast.error('Failed to update product')
    }
  }

  const columns: Column<Product>[] = [
    {
      key: 'code',
      header: 'Code',
      width: '130px',
      render: (row) => (
        <span className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
          {row.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
          {row.name}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '130px',
      render: (row) => {
        const style = CATEGORY_STYLES[row.category] ?? { background: colors.neutralBg, color: colors.textSecondary }
        return (
          <span style={{ ...style, display: 'inline-flex', padding: '2px 8px', borderRadius: 4, fontSize: fontSize.xs, fontWeight: fontWeight.medium }}>
            {CATEGORY_LABELS[row.category] ?? row.category}
          </span>
        )
      },
    },
    {
      key: 'unit',
      header: 'Unit',
      width: '70px',
      render: (row) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase' }}>
          {row.unit}
        </span>
      ),
    },
    {
      key: 'defaultBuyPrice',
      header: 'Buy Price',
      width: '100px',
      sortable: true,
      render: (row) => (
        <span className="font-mono" style={{ fontSize: fontSize.sm, color: colors.action }}>
          R {new Decimal(row.defaultBuyPrice).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'defaultSellPrice',
      header: 'Sell Price',
      width: '100px',
      sortable: true,
      render: (row) => (
        <span className="font-mono" style={{ fontSize: fontSize.sm, color: colors.process }}>
          R {new Decimal(row.defaultSellPrice).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'margin',
      header: 'Margin',
      width: '80px',
      render: (row) => {
        const m = calcMargin(row.defaultBuyPrice, row.defaultSellPrice)
        return <span className="font-mono font-semibold" style={{ fontSize: fontSize.sm, color: m.color }}>{m.pct}</span>
      },
    },
    {
      key: 'isActive',
      header: 'Status',
      width: '90px',
      render: (row) => <StatusBadge status={row.isActive ? 'active' : 'inactive'} />,
    },
  ]

  const rowActions: RowAction<Product>[] = [
    {
      label: 'Edit',
      icon: Pencil,
      hidden: () => !isManager,
      onClick: (row) => setEditTarget(row),
    },
    {
      label: 'Deactivate',
      icon: EyeOff,
      hidden: (row) => !isManager || !row.isActive,
      onClick: (row) => handleToggleActive(row),
    },
    {
      label: 'Reactivate',
      icon: Eye,
      hidden: (row) => !isManager || row.isActive,
      onClick: (row) => handleToggleActive(row),
    },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      hidden: () => !isManager,
      onClick: (row) => setDeleteTarget(row),
    },
  ]

  return (
    <PageShell title="Products" subtitle={`${products.length} products`}>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center shrink-0 mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} />
          <input
            placeholder="Search code or name…"
            className="pl-7 pr-3 h-7 text-xs rounded border bg-white focus:outline-none w-56"
            style={{ borderColor: colors.border, color: colors.textPrimary }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none"
          style={{ borderColor: colors.border, color: colors.textPrimary }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none"
          style={{ borderColor: colors.border, color: colors.textPrimary }}
          value={statusFilter}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All statuses</option>
        </select>
        {isManager && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setBulkOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 2, background: '#fff', border: `1px solid ${colors.border}`, color: colors.textPrimary, cursor: 'pointer' }}
            >
              <TrendingUp style={{ width: 13, height: 13 }} /> Bulk Price Update
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 2, background: colors.action, border: 'none', color: '#fff', cursor: 'pointer' }}
            >
              <Plus style={{ width: 13, height: 13 }} /> Add Product
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {isManager && selectedKeys.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', marginBottom: 6, background: '#EBF3FC', border: '1px solid #185ABD', borderRadius: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#185ABD' }}>{selectedKeys.size} selected</span>
          <button
            onClick={() => setSelectedKeys(new Set())}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#6C757D', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
          >
            <X style={{ width: 11, height: 11 }} /> Clear
          </button>
          <div style={{ flex: 1 }} />
          <ModalBtn onClick={handleBulkReactivate} loading={bulkLoading === 'reactivate'} disabled={bulkLoading !== null}>
            Reactivate
          </ModalBtn>
          <ModalBtn onClick={handleBulkDeactivate} loading={bulkLoading === 'deactivate'} disabled={bulkLoading !== null}>
            Deactivate
          </ModalBtn>
          <ModalBtn variant="danger" onClick={() => setBulkDelOpen(true)} disabled={bulkLoading !== null}>
            Delete
          </ModalBtn>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns}
          rows={products}
          rowKey={(r) => r.id}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="No products found"
          emptyAction={isManager ? { label: '+ Add Product', onClick: () => setCreateOpen(true) } : undefined}
          selectedKeys={isManager ? selectedKeys : undefined}
          onSelectionChange={isManager ? setSelectedKeys : undefined}
        />
      </div>

      {createOpen && (
        <CreateProductModal
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { revalidate(); setCreateOpen(false) }}
        />
      )}
      {editTarget && (
        <EditProductModal
          product={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { revalidate(); setEditTarget(null) }}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          product={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => { revalidate(); setDeleteTarget(null) }}
        />
      )}
      {bulkOpen && (
        <BulkPriceModal
          products={products.filter(p => p.isActive)}
          onClose={() => setBulkOpen(false)}
          onSuccess={() => { revalidate(); setBulkOpen(false) }}
        />
      )}
      {bulkDelOpen && (
        <BulkDeleteModal
          ids={[...selectedKeys]}
          products={products}
          onClose={() => setBulkDelOpen(false)}
          onSuccess={() => { revalidate(); setSelectedKeys(new Set()); setBulkDelOpen(false) }}
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
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <ModalTitleBar title="Add Product" onClose={onClose} />
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
            <ModalBtn onClick={onClose} disabled={loading}>Cancel</ModalBtn>
            <ModalBtn type="submit" variant="primary" loading={loading}>Create Product</ModalBtn>
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
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <ModalTitleBar title={`Edit Product — ${product.code}`} onClose={onClose} />
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
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: colors.textSecondary }}>
            <input type="checkbox" defaultChecked={product.isActive} onChange={(e) => setValue('isActive', e.target.checked)} className="rounded" />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <ModalBtn onClick={onClose} disabled={loading}>Cancel</ModalBtn>
            <ModalBtn type="submit" variant="primary" loading={loading}>Save Changes</ModalBtn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────
function ConfirmDeleteModal({ product, onClose, onSuccess }: { product: Product; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [inUse, setInUse]     = useState(false)

  async function onConfirm() {
    setLoading(true)
    const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
    setLoading(false)
    if (res.ok) { toast.success('Product deleted'); onSuccess() }
    else if (res.status === 409) { setInUse(true) }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to delete product') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <ModalTitleBar title="Delete Product" onClose={onClose} />
        <div className="space-y-4 mt-2">
          {inUse ? (
            <div style={{ background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 3, padding: '10px 12px', fontSize: 12, color: colors.process }}>
              Cannot delete <strong>{product.name}</strong> — it is referenced by existing purchases, sales, or stock movements. Use <strong>Deactivate</strong> instead.
            </div>
          ) : (
            <>
              <div style={{ background: colors.warningBg, border: `1px solid ${colors.warning}`, borderRadius: 3, padding: '10px 12px', fontSize: 12, color: '#92610A' }}>
                This will permanently remove <strong>{product.name}</strong> ({product.code}) and its full price history. This cannot be undone.
              </div>
              <p style={{ fontSize: 12, color: colors.textSecondary }}>
                To hide it from active use without deleting, use <strong>Deactivate</strong> instead.
              </p>
            </>
          )}
          <div className="flex justify-end gap-2">
            <ModalBtn onClick={onClose} disabled={loading}>Cancel</ModalBtn>
            {!inUse && (
              <ModalBtn variant="danger" onClick={onConfirm} disabled={loading} loading={loading}>
                Delete Product
              </ModalBtn>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Bulk Price Update Modal ──────────────────────────────────────────────────
function BulkPriceModal({ products, onClose, onSuccess }: { products: Product[]; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(false)
  const [reason,  setReason]  = useState('')
  const [prices, setPrices]   = useState<Record<string, { buy: string; sell: string }>>(() =>
    Object.fromEntries(products.map((p) => [p.id, {
      buy:  Number(p.defaultBuyPrice).toFixed(2),
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
        productId:        p.id,
        defaultBuyPrice:  prices[p.id]!.buy,
        defaultSellPrice: prices[p.id]!.sell,
        reason:           reason || undefined,
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
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto" showCloseButton={false}>
        <ModalTitleBar title={preview ? 'Confirm Price Changes' : 'Bulk Price Update'} onClose={onClose} />

        {!preview ? (
          <div className="space-y-3 mt-2">
            <p style={{ fontSize: 12, color: colors.textSecondary }}>Edit buy/sell prices below. Only changed prices will be updated.</p>
            <table className="w-full" style={{ fontSize: fontSize.sm }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  {['Product', 'Buy Price (R)', 'Sell Price (R)'].map((h) => (
                    <th key={h} className="text-left px-2 py-2 uppercase" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: `1px solid ${colors.border}`,
                      background:
                        prices[p.id]?.buy  !== Number(p.defaultBuyPrice).toFixed(2) ||
                        prices[p.id]?.sell !== Number(p.defaultSellPrice).toFixed(2)
                          ? colors.warningBg : undefined,
                    }}
                  >
                    <td className="px-2 py-2">
                      <p style={{ fontWeight: fontWeight.medium, color: colors.textPrimary }}>{p.name}</p>
                      <p className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{p.code}</p>
                    </td>
                    <td className="px-2 py-2">
                      <Input value={prices[p.id]?.buy ?? ''} onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, buy: e.target.value } }))} className="w-28 h-8 text-sm font-mono" />
                    </td>
                    <td className="px-2 py-2">
                      <Input value={prices[p.id]?.sell ?? ''} onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, sell: e.target.value } }))} className="w-28 h-8 text-sm font-mono" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <Label>Reason for update <span style={{ fontWeight: 400, color: colors.textMuted }}>(optional)</span></Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" placeholder="e.g. Market price adjustment" />
            </div>
            <div className="flex justify-between items-center pt-2">
              <p style={{ fontSize: 12, color: colors.textSecondary }}>{changed.length} product{changed.length !== 1 ? 's' : ''} changed</p>
              <div className="flex gap-2">
                <ModalBtn onClick={onClose}>Cancel</ModalBtn>
                <ModalBtn variant="primary" disabled={changed.length === 0} onClick={() => setPreview(true)}>
                  Preview Changes
                </ModalBtn>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <p style={{ fontSize: 12, color: colors.textSecondary }}>The following {changed.length} price{changed.length !== 1 ? 's' : ''} will be updated:</p>
            <table className="w-full" style={{ fontSize: fontSize.sm, border: `1px solid ${colors.border}`, borderRadius: 3 }}>
              <thead style={{ background: colors.neutralBg, borderBottom: `1px solid ${colors.border}` }}>
                <tr>
                  {['Product', 'Old Buy', 'New Buy', 'Old Sell', 'New Sell'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 uppercase" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {changed.map((p) => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td className="px-3 py-2">
                      <p style={{ fontWeight: fontWeight.medium, color: colors.textPrimary }}>{p.name}</p>
                      <p className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{p.code}</p>
                    </td>
                    <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>R {Number(p.defaultBuyPrice).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: colors.action }}>R {Number(prices[p.id]?.buy).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>R {Number(p.defaultSellPrice).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: colors.process }}>R {Number(prices[p.id]?.sell).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reason && <p style={{ fontSize: 12, color: colors.textSecondary }}>Reason: <strong>{reason}</strong></p>}
            <div className="flex justify-end gap-2 pt-2">
              <ModalBtn onClick={() => setPreview(false)} disabled={loading}>Back</ModalBtn>
              <ModalBtn variant="primary" onClick={onConfirm} loading={loading}>Confirm Update</ModalBtn>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Bulk Delete Modal ────────────────────────────────────────────────────────
function BulkDeleteModal({ ids, products, onClose, onSuccess }: {
  ids: string[]; products: Product[]; onClose: () => void; onSuccess: () => void
}) {
  const [loading,  setLoading]  = useState(false)
  const [results,  setResults]  = useState<{ name: string; ok: boolean }[] | null>(null)

  const targets = products.filter(p => ids.includes(p.id))

  async function onConfirm() {
    setLoading(true)
    const settled = await Promise.allSettled(
      targets.map(p => fetch(`/api/products/${p.id}`, { method: 'DELETE' }).then(r => ({ name: p.name, ok: r.ok })))
    )
    setLoading(false)
    const res = settled.map(s => s.status === 'fulfilled' ? s.value : { name: '?', ok: false })
    const failed = res.filter(r => !r.ok)
    if (failed.length === 0) {
      toast.success(`${res.length} product${res.length !== 1 ? 's' : ''} deleted`)
      onSuccess()
    } else {
      setResults(res)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <ModalTitleBar title="Delete Products" onClose={onClose} />
        <div className="space-y-4 mt-2">
          {results ? (
            <>
              <p style={{ fontSize: 12, color: colors.textSecondary }}>Some products could not be deleted (they are in use):</p>
              <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 12 }}>
                {results.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', color: r.ok ? colors.action : colors.danger }}>
                    <span>{r.ok ? '✓' : '✗'}</span>
                    <span>{r.name}</span>
                    {!r.ok && <span style={{ color: colors.textSecondary }}>— in use, deactivate instead</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <ModalBtn variant="primary" onClick={onSuccess}>Done</ModalBtn>
              </div>
            </>
          ) : (
            <>
              <div style={{ background: colors.warningBg, border: `1px solid ${colors.warning}`, borderRadius: 3, padding: '10px 12px', fontSize: 12, color: '#92610A' }}>
                Permanently delete <strong>{targets.length} product{targets.length !== 1 ? 's' : ''}</strong> and their price history? Products in use by existing transactions will be skipped.
              </div>
              <div style={{ maxHeight: 140, overflowY: 'auto', fontSize: 12, color: colors.textSecondary }}>
                {targets.map(p => (
                  <div key={p.id} style={{ padding: '2px 0' }}>• {p.name} <span style={{ fontFamily: 'monospace', fontSize: 11 }}>({p.code})</span></div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <ModalBtn onClick={onClose} disabled={loading}>Cancel</ModalBtn>
                <ModalBtn variant="danger" onClick={onConfirm} loading={loading}>Delete {targets.length} Product{targets.length !== 1 ? 's' : ''}</ModalBtn>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
