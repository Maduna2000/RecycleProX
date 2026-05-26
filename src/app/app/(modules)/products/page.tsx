'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, ModalTitleBar, ModalBtn } from '@/components/ui/dialog'
import { Search, Pencil, TrendingUp, Plus, Eye, EyeOff, Trash2, X, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateProductSchema, UpdateProductSchema, BulkPriceUpdateSchema, CreateCategorySchema, UpdateCategorySchema, type CreateProductInput, type CreateProductFormInput, type UpdateProductInput, type CreateCategoryInput, type UpdateCategoryInput } from '@/lib/schemas/product'
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

type CategoryItem = { id: string; name: string; colorHex: string | null; sortOrder: number; isActive: boolean }

const FALLBACK_COLORS = ['#0066CC','#CC6600','#009966','#9933CC','#CC3300','#006699','#996600','#008080']

function getCategoryStyle(hex: string | null | undefined, name: string): { background: string; color: string } {
  const h = hex ?? FALLBACK_COLORS[Math.abs((name.charCodeAt(0) ?? 0)) % FALLBACK_COLORS.length]!
  return { background: `${h}22`, color: h }
}

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
  const [catManageOpen, setCatManageOpen] = useState(false)

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

  const { data: catData, mutate: mutateCats } = useSWR<{ categories: CategoryItem[] }>('/api/product-categories', fetcher)
  const categories: CategoryItem[] = catData?.categories ?? []

  const revalidate = () => mutate(swrKey)

  // Clear selection when filters change
  useEffect(() => { setSelectedKeys(new Set()) }, [swrKey])

  async function handleBulkDeactivate() {
    setBulkLoading('deactivate')
    await Promise.all(Array.from(selectedKeys).map(id =>
      fetch(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: false }) })
    ))
    toast.success(`${selectedKeys.size} product${selectedKeys.size !== 1 ? 's' : ''} deactivated`)
    setSelectedKeys(new Set())
    revalidate()
    setBulkLoading(null)
  }

  async function handleBulkReactivate() {
    setBulkLoading('reactivate')
    await Promise.all(Array.from(selectedKeys).map(id =>
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
        const cat = categories.find(c => c.name === row.category)
        const style = getCategoryStyle(cat?.colorHex, row.category)
        return (
          <span style={{ ...style, display: 'inline-flex', padding: '2px 8px', borderRadius: 4, fontSize: fontSize.xs, fontWeight: fontWeight.medium }}>
            {row.category}
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
          {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
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
              onClick={() => setCatManageOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 2, background: '#fff', border: `1px solid ${colors.border}`, color: colors.textPrimary, cursor: 'pointer' }}
            >
              <Settings2 style={{ width: 13, height: 13 }} /> Categories
            </button>
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
          categories={categories}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { revalidate(); setCreateOpen(false) }}
        />
      )}
      {editTarget && (
        <EditProductModal
          product={editTarget}
          categories={categories}
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
      {catManageOpen && (
        <ManageCategoriesModal
          categories={categories}
          onClose={() => setCatManageOpen(false)}
          onSuccess={() => mutateCats()}
        />
      )}
      {bulkDelOpen && (
        <BulkDeleteModal
          ids={Array.from(selectedKeys)}
          products={products}
          onClose={() => setBulkDelOpen(false)}
          onSuccess={() => { revalidate(); setSelectedKeys(new Set()); setBulkDelOpen(false) }}
        />
      )}
    </PageShell>
  )
}

// ─── Create Product Modal ─────────────────────────────────────────────────────
function CreateProductModal({ categories, onClose, onSuccess }: { categories: CategoryItem[]; onClose: () => void; onSuccess: () => void }) {
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
            <Select onValueChange={(v) => setValue('category', v as string)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
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
function EditProductModal({ product, categories, onClose, onSuccess }: { product: Product; categories: CategoryItem[]; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<UpdateProductInput>({
    resolver: zodResolver(UpdateProductSchema),
    defaultValues: {
      name: product.name,
      category: product.category,
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
              <Select onValueChange={(v) => setValue('category', v as string)} defaultValue={product.category}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
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

// ─── Manage Categories Modal ──────────────────────────────────────────────────
function ManageCategoriesModal({ categories, onClose, onSuccess }: {
  categories: CategoryItem[]; onClose: () => void; onSuccess: () => void
}) {
  const [newName,    setNewName]    = useState('')
  const [newColor,   setNewColor]   = useState('#607D8B')
  const [adding,     setAdding]     = useState(false)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [editName,   setEditName]   = useState('')
  const [editColor,  setEditColor]  = useState('')
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState<string | null>(null)

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    const res = await fetch('/api/product-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), colorHex: newColor }),
    })
    setAdding(false)
    if (res.ok) { toast.success('Category added'); setNewName(''); onSuccess() }
    else if (res.status === 409) toast.error('Category name already exists')
    else toast.error('Failed to add category')
  }

  function startEdit(cat: CategoryItem) {
    setEditId(cat.id)
    setEditName(cat.name)
    setEditColor(cat.colorHex ?? '#607D8B')
  }

  async function handleSaveEdit(id: string) {
    setSaving(true)
    const res = await fetch(`/api/product-categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), colorHex: editColor }),
    })
    setSaving(false)
    if (res.ok) { toast.success('Category updated'); setEditId(null); onSuccess() }
    else if (res.status === 409) toast.error('Category name already exists')
    else toast.error('Failed to update category')
  }

  async function handleDelete(cat: CategoryItem) {
    setDeleting(cat.id)
    const res = await fetch(`/api/product-categories/${cat.id}`, { method: 'DELETE' })
    setDeleting(null)
    if (res.ok) { toast.success('Category deleted'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to delete category') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <ModalTitleBar title="Manage Categories" onClose={onClose} />
        <div className="space-y-3 mt-2">
          {/* Category list */}
          <div style={{ maxHeight: 280, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 3 }}>
            {categories.length === 0 ? (
              <p style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: colors.textSecondary }}>No categories yet</p>
            ) : categories.map((cat) => (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${colors.border}` }}>
                {editId === cat.id ? (
                  <>
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      style={{ width: 26, height: 26, borderRadius: 3, border: `1px solid ${colors.border}`, cursor: 'pointer', padding: 1 }}
                    />
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ flex: 1, height: 26, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '0 6px', fontSize: 12, outline: 'none' }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(cat.id); if (e.key === 'Escape') setEditId(null) }}
                      autoFocus
                    />
                    <ModalBtn variant="primary" onClick={() => handleSaveEdit(cat.id)} loading={saving} disabled={!editName.trim()}>Save</ModalBtn>
                    <ModalBtn onClick={() => setEditId(null)} disabled={saving}>Cancel</ModalBtn>
                  </>
                ) : (
                  <>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: cat.colorHex ?? '#607D8B', display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: colors.textPrimary }}>{cat.name}</span>
                    <button
                      onClick={() => startEdit(cat)}
                      style={{ fontSize: 11, color: colors.process, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      disabled={deleting === cat.id}
                      style={{ fontSize: 11, color: colors.danger, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', opacity: deleting === cat.id ? 0.5 : 1 }}
                    >
                      {deleting === cat.id ? '…' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new category */}
          <div style={{ background: colors.neutralBg, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '10px 12px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Category</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                style={{ width: 32, height: 28, borderRadius: 3, border: `1px solid ${colors.border}`, cursor: 'pointer', padding: 2 }}
              />
              <input
                placeholder="Category name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                style={{ flex: 1, height: 28, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '0 8px', fontSize: 12, outline: 'none', background: '#fff' }}
              />
              <ModalBtn variant="primary" onClick={handleAdd} loading={adding} disabled={!newName.trim()}>Add</ModalBtn>
            </div>
          </div>

          <div className="flex justify-end">
            <ModalBtn onClick={onClose}>Close</ModalBtn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
