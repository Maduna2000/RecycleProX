'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Dialog } from '@/components/ui/dialog'
import { Search, Pencil, Eye, EyeOff, Trash2, X, Package, ChevronDown, ChevronRight } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateProductSchema, UpdateProductSchema, BulkPriceUpdateSchema, type CreateProductInput, type CreateProductFormInput, type UpdateProductInput } from '@/lib/schemas/product'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { offlineFetcher } from '@/lib/offline/responseCache'
import { productsListFetcher } from '@/lib/offline/fetchers/products'
import { OfflineDataBadge } from '@/components/ui/OfflineDataBadge'
import { useSystemCurrency } from '@/hooks/useSystemCurrency'
import {
  inp,
  Btn, Field, PortalPage, FilterBar,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'


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

type SubCategoryItem = { id: string; name: string; colorHex: string | null; iconName: string | null; sortOrder: number; isActive: boolean; parentId: string | null; _count?: { products: number } }
type CategoryItem    = SubCategoryItem & { children: SubCategoryItem[] }

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
  const { symbol: currSym } = useSystemCurrency()
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
    if (searchParams.get('categories') === '1') {
      setCatManageOpen(true)
      router.replace('/app/products')
    }
    if (searchParams.get('bulk') === '1') {
      setBulkOpen(true)
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
  const { data, isLoading, error } = useSWR<{ products: Product[] }>(swrKey, productsListFetcher)
  const products = data?.products ?? []

  const [page, setPage] = useState(1)
  const PAGE_SIZE  = 30
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pagedProducts = products.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const { data: catData, mutate: mutateCats } = useSWR<{ categories: CategoryItem[] }>('/api/product-categories', offlineFetcher)
  const categories: CategoryItem[] = catData?.categories ?? []
  // Flat list of all category names (parents + children) for lookup helpers
  const allCategoryNames: SubCategoryItem[] = categories.flatMap(c => [c, ...c.children])

  const revalidate = () => mutate(swrKey)

  useEffect(() => { setSelectedKeys(new Set()); setPage(1) }, [swrKey])

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
    { key: 'code', header: 'Code', width: '100px', render: (p) => <span style={{ fontFamily: 'monospace', color: '#6C757D', fontSize: 11 }}>{p.code}</span> },
    { key: 'name', header: 'Name', render: (p) => <span style={{ fontWeight: 600, color: '#212529' }}>{p.name}</span> },
    {
      key: 'category', header: 'Category', width: '130px',
      render: (p) => {
        const cat    = allCategoryNames.find(c => c.name === p.category)
        const catSty = getCategoryStyle(cat?.colorHex, p.category)
        return <span style={{ ...catSty, display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600 }}>{p.category}</span>
      },
    },
    { key: 'unit', header: 'Unit', width: '64px', render: (p) => <span style={{ textTransform: 'uppercase', color: '#6C757D', fontSize: 11 }}>{p.unit}</span> },
    { key: 'buyPrice', header: 'Buy Price', width: '90px', align: 'right', render: (p) => <span style={{ fontFamily: 'monospace', color: colors.action }}>{currSym} {new Decimal(p.defaultBuyPrice).toFixed(2)}</span> },
    { key: 'sellPrice', header: 'Sell Price', width: '90px', align: 'right', render: (p) => <span style={{ fontFamily: 'monospace', color: colors.process }}>{currSym} {new Decimal(p.defaultSellPrice).toFixed(2)}</span> },
    {
      key: 'margin', header: 'Margin', width: '70px', align: 'right',
      render: (p) => { const m = calcMargin(p.defaultBuyPrice, p.defaultSellPrice); return <span style={{ fontFamily: 'monospace', fontWeight: 600, color: m.color }}>{m.pct}</span> },
    },
    {
      key: 'status', header: 'Status', width: '76px',
      render: (p) => (
        <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, ...(p.isActive ? { background: colors.actionBg, color: colors.action } : { background: colors.neutralBg, color: colors.textSecondary }) }}>
          {p.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ]

  const rowActions: RowAction<Product>[] = [
    { label: 'Edit', icon: Pencil, onClick: (p) => setEditTarget(p) },
    { label: 'Deactivate', icon: EyeOff, hidden: (p) => !p.isActive, onClick: handleToggleActive },
    { label: 'Reactivate', icon: Eye, hidden: (p) => p.isActive, onClick: handleToggleActive },
    { label: 'Delete', icon: Trash2, danger: true, onClick: (p) => setDeleteTarget(p) },
  ]

  return (
    // maxWidth matches src/lib/pageWidthCaps.ts, which PageTitleBar reads to
    // cap/border itself to match — keeps the unbounded "Name" column from
    // stretching to fill the whole window. Same width as Stock On Hand.
    <PortalPage title={`Products (${products.length})`} maxWidth={1100} actions={<OfflineDataBadge />}>
        {/* Filter toolbar */}
        <FilterBar>
          <Field label="Search" width={200}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
              <input
                placeholder="Search code or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...inp, paddingLeft: 26 }}
              />
            </div>
          </Field>
          <Field label="Category" width={160}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inp}>
              <option value="">All Categories</option>
              {categories.map((c) => (
                <React.Fragment key={c.id}>
                  <option value={c.name}>{c.name}</option>
                  {c.children.map(s => <option key={s.id} value={s.name}>&nbsp;&nbsp;↳ {s.name}</option>)}
                </React.Fragment>
              ))}
            </select>
          </Field>
          <Field label="Status" width={140}>
            <select value={statusFilter} onChange={(e) => setStatus(e.target.value)} style={inp}>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
              <option value="all">All statuses</option>
            </select>
          </Field>
        </FilterBar>

        {/* Bulk action bar */}
        {isManager && selectedKeys.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: '#EBF3FC', borderBottom: '1px solid #185ABD', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#185ABD' }}>{selectedKeys.size} selected</span>
            <Btn size="sm" icon={X} onClick={() => setSelectedKeys(new Set())}>Clear</Btn>
            <div style={{ flex: 1 }} />
            <Btn size="sm" loading={bulkLoading === 'reactivate'} disabled={bulkLoading !== null} onClick={handleBulkReactivate}>Reactivate</Btn>
            <Btn size="sm" loading={bulkLoading === 'deactivate'} disabled={bulkLoading !== null} onClick={handleBulkDeactivate}>Deactivate</Btn>
            <Btn size="sm" variant="danger" disabled={bulkLoading !== null} onClick={() => setBulkDelOpen(true)}>Delete</Btn>
          </div>
        )}

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, padding: 10 }}>
          <DataTable
            columns={columns}
            rows={pagedProducts}
            rowKey={(p) => p.id}
            rowActions={isManager ? rowActions : undefined}
            selectedKeys={isManager ? selectedKeys : undefined}
            onSelectionChange={isManager ? setSelectedKeys : undefined}
            loading={isLoading}
            error={error}
            emptyMessage="No products found"
            emptyAction={isManager ? { label: 'Add Product', onClick: () => setCreateOpen(true) } : undefined}
            total={products.length}
            page={safePage}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
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
          categoryOrder={allCategoryNames}
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
    </PortalPage>
  )
}

// ─── Create Product Modal ─────────────────────────────────────────────────────
function CreateProductModal({ categories, onClose, onSuccess }: { categories: CategoryItem[]; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('')
  const { symbol: currSym } = useSystemCurrency()
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
      <RpxDialogContent maxWidth={560}>
        <RpxDialogHeader title="Add Product" onClose={onClose} />
        <form id="create-product-form" onSubmit={handleSubmit(onSubmit)}>
        <RpxDialogBody>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product Code">
              <input {...register('code')} style={{ ...inp, marginTop: 4, textTransform: 'uppercase' }} placeholder="e.g. CU-WIRE" disabled={loading} />
              {errors.code && <p className="text-xs text-red-600 mt-1">{errors.code.message}</p>}
            </Field>
            <Field label="Unit">
              <select style={{ ...inp, marginTop: 4 }} onChange={(e) => setValue('unit', e.target.value as 'kg' | 'ton' | 'each' | 'litre')} defaultValue="kg">
                <option value="kg">kg</option>
                <option value="ton">ton</option>
                <option value="each">each</option>
                <option value="litre">litre</option>
              </select>
            </Field>
          </div>
          <Field label="Product Name">
            <input {...register('name')} style={{ ...inp, marginTop: 4 }} placeholder="e.g. Bright Copper Wire" disabled={loading} />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </Field>
          <Field label="Category">
            <select
              style={{ ...inp, marginTop: 4 }}
              value={category}
              onChange={(e) => { setCategory(e.target.value); setValue('category', e.target.value) }}
            >
              <option value="" disabled>Select category</option>
              {categories.map((c) => (
                c.children.length === 0 ? (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ) : (
                  <optgroup key={c.id} label={c.name}>
                    {c.children.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </optgroup>
                )
              ))}
            </select>
            {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category.message}</p>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Buy Price (${currSym})`}>
              <input {...register('defaultBuyPrice')} style={{ ...inp, marginTop: 4 }} placeholder="0.00" disabled={loading} />
              {errors.defaultBuyPrice && <p className="text-xs text-red-600 mt-1">{errors.defaultBuyPrice.message}</p>}
            </Field>
            <Field label={`Sell Price (${currSym})`}>
              <input {...register('defaultSellPrice')} style={{ ...inp, marginTop: 4 }} placeholder="0.00" disabled={loading} />
              {errors.defaultSellPrice && <p className="text-xs text-red-600 mt-1">{errors.defaultSellPrice.message}</p>}
            </Field>
          </div>
        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" form="create-product-form" loading={loading}>Create Product</Btn>
        </RpxDialogFooter>
        </form>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Edit Product Modal ───────────────────────────────────────────────────────
function EditProductModal({ product, categories, onClose, onSuccess }: { product: Product; categories: CategoryItem[]; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState(product.category)
  const { symbol: currSym } = useSystemCurrency()
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
      <RpxDialogContent maxWidth={560}>
        <RpxDialogHeader title={`Edit Product — ${product.code}`} onClose={onClose} />
        <form id="edit-product-form" onSubmit={handleSubmit(onSubmit)}>
        <RpxDialogBody>
        <div className="space-y-4">
          <Field label="Product Name">
            <input {...register('name')} style={{ ...inp, marginTop: 4 }} disabled={loading} />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                style={{ ...inp, marginTop: 4 }}
                value={category}
                onChange={(e) => { setCategory(e.target.value); setValue('category', e.target.value) }}
              >
                <option value="" disabled>Select category</option>
                {categories.map((c) => (
                  c.children.length === 0 ? (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ) : (
                    <optgroup key={c.id} label={c.name}>
                      {c.children.map((s) => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </optgroup>
                  )
                ))}
              </select>
            </Field>
            <Field label="Unit">
              <select style={{ ...inp, marginTop: 4 }} onChange={(e) => setValue('unit', e.target.value as 'kg' | 'ton' | 'each' | 'litre')} defaultValue={product.unit}>
                <option value="kg">kg</option>
                <option value="ton">ton</option>
                <option value="each">each</option>
                <option value="litre">litre</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Buy Price (${currSym})`}>
              <input {...register('defaultBuyPrice')} style={{ ...inp, marginTop: 4 }} disabled={loading} />
              {errors.defaultBuyPrice && <p className="text-xs text-red-600 mt-1">{errors.defaultBuyPrice.message}</p>}
            </Field>
            <Field label={`Sell Price (${currSym})`}>
              <input {...register('defaultSellPrice')} style={{ ...inp, marginTop: 4 }} disabled={loading} />
              {errors.defaultSellPrice && <p className="text-xs text-red-600 mt-1">{errors.defaultSellPrice.message}</p>}
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: colors.textSecondary }}>
            <input type="checkbox" defaultChecked={product.isActive} onChange={(e) => setValue('isActive', e.target.checked)} className="rounded" />
            Active
          </label>
        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" form="edit-product-form" loading={loading}>Save Changes</Btn>
        </RpxDialogFooter>
        </form>
      </RpxDialogContent>
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
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Delete Product" onClose={onClose} />
        <RpxDialogBody>
          {inUse ? (
            <div style={{ background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 3, padding: '10px 12px', fontSize: 12, color: colors.process }}>
              Cannot delete <strong>{product.name}</strong> — it is referenced by existing purchases, sales, or stock movements. Use <strong>Deactivate</strong> instead.
            </div>
          ) : (
            <>
              <div style={{ background: colors.warningBg, border: `1px solid ${colors.warning}`, borderRadius: 3, padding: '10px 12px', fontSize: 12, color: '#92610A', marginBottom: 10 }}>
                This will permanently remove <strong>{product.name}</strong> ({product.code}) and its full price history. This cannot be undone.
              </div>
              <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0 }}>
                To hide it from active use without deleting, use <strong>Deactivate</strong> instead.
              </p>
            </>
          )}
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          {!inUse && (
            <Btn variant="danger" onClick={onConfirm} loading={loading}>Delete Product</Btn>
          )}
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Bulk Price Update Modal ──────────────────────────────────────────────────
function BulkPriceModal({ products, categoryOrder, onClose, onSuccess }: {
  products: Product[]; categoryOrder: SubCategoryItem[]; onClose: () => void; onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(false)
  const [reason,  setReason]  = useState('')
  const { symbol: currSym } = useSystemCurrency()
  const [prices, setPrices]   = useState<Record<string, { buy: string; sell: string }>>(() =>
    Object.fromEntries(products.map((p) => [p.id, {
      buy:  Number(p.defaultBuyPrice).toFixed(2),
      sell: Number(p.defaultSellPrice).toFixed(2),
    }]))
  )

  // Group by category, ordered to match the category manager's own sort order
  // (falling back to alphabetical for any category not found there) rather
  // than insertion order, so this matches what the user already expects from
  // elsewhere in the app.
  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const p of products) {
      const key = p.category || 'Uncategorized'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    const orderIndex = new Map(categoryOrder.map((c, i) => [c.name, i]))
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ia = orderIndex.get(a), ib = orderIndex.get(b)
      if (ia !== undefined && ib !== undefined) return ia - ib
      if (ia !== undefined) return -1
      if (ib !== undefined) return 1
      return a.localeCompare(b)
    })
  }, [products, categoryOrder])

  // Collapsed by default — with dozens of categories, an all-expanded list is
  // exactly the unmanageable wall of rows this grouping exists to avoid.
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(
    () => new Set(grouped.map(([cat]) => cat))
  )
  function toggleCat(cat: string) {
    setCollapsedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }
  const allCollapsed = collapsedCats.size >= grouped.length
  function toggleAll() {
    setCollapsedCats(allCollapsed ? new Set() : new Set(grouped.map(([cat]) => cat)))
  }

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
      <RpxDialogContent maxWidth={860} style={{ maxHeight: '85vh' }}>
        <RpxDialogHeader title={preview ? 'Confirm Price Changes' : 'Bulk Price Update'} onClose={onClose} />
        <RpxDialogBody>

        {!preview ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p style={{ fontSize: 12, color: colors.textSecondary }}>Edit buy/sell prices below. Only changed prices will be updated.</p>
              <Btn onClick={toggleAll}>{allCollapsed ? 'Expand All' : 'Collapse All'}</Btn>
            </div>
            <table className="w-full" style={{ fontSize: fontSize.sm, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  {['Product', `Buy Price (${currSym})`, `Sell Price (${currSym})`].map((h) => (
                    <th key={h} className="text-left px-2 py-1.5 uppercase" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              {grouped.map(([cat, items]) => {
                const isCollapsed = collapsedCats.has(cat)
                const catMeta = categoryOrder.find((c) => c.name === cat)
                const catStyle = getCategoryStyle(catMeta?.colorHex, cat)
                const changedInCat = items.filter((p) =>
                  prices[p.id]?.buy  !== Number(p.defaultBuyPrice).toFixed(2) ||
                  prices[p.id]?.sell !== Number(p.defaultSellPrice).toFixed(2)
                ).length
                return (
                  <tbody key={cat}>
                    <tr
                      onClick={() => toggleCat(cat)}
                      style={{ cursor: 'pointer', background: colors.neutralBg, borderBottom: `1px solid ${colors.border}` }}
                    >
                      <td colSpan={3} className="px-2 py-1">
                        <div className="flex items-center gap-2">
                          {isCollapsed ? <ChevronRight style={{ width: 13, height: 13, color: colors.textSecondary }} /> : <ChevronDown style={{ width: 13, height: 13, color: colors.textSecondary }} />}
                          <span style={{ ...catStyle, display: 'inline-flex', padding: '0px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, lineHeight: '16px' }}>{cat}</span>
                          <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{items.length} product{items.length !== 1 ? 's' : ''}</span>
                          {changedInCat > 0 && (
                            <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.warning }}>{changedInCat} changed</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed && items.map((p) => (
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
                        <td className="px-2 py-1">
                          <p style={{ fontWeight: fontWeight.medium, color: colors.textPrimary }}>{p.name}</p>
                          <p className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{p.code}</p>
                        </td>
                        <td className="px-2 py-1">
                          <input value={prices[p.id]?.buy ?? ''} onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, buy: e.target.value } }))} style={{ ...inp, width: 112, fontFamily: 'monospace' }} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={prices[p.id]?.sell ?? ''} onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, sell: e.target.value } }))} style={{ ...inp, width: 112, fontFamily: 'monospace' }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )
              })}
            </table>
            <Field label="Reason for update (optional)">
              <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inp, marginTop: 4 }} placeholder="e.g. Market price adjustment" />
            </Field>
            <div className="flex justify-between items-center pt-2">
              <p style={{ fontSize: 12, color: colors.textSecondary }}>{changed.length} product{changed.length !== 1 ? 's' : ''} changed</p>
              <div className="flex gap-2">
                <Btn onClick={onClose}>Cancel</Btn>
                <Btn variant="primary" disabled={changed.length === 0} onClick={() => setPreview(true)}>
                  Preview Changes
                </Btn>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
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
                    <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>{currSym} {Number(p.defaultBuyPrice).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: colors.action }}>{currSym} {Number(prices[p.id]?.buy).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>{currSym} {Number(p.defaultSellPrice).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: colors.process }}>{currSym} {Number(prices[p.id]?.sell).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reason && <p style={{ fontSize: 12, color: colors.textSecondary }}>Reason: <strong>{reason}</strong></p>}
          </div>
        )}
        </RpxDialogBody>
        <RpxDialogFooter>
          {!preview ? null : (
            <>
              <Btn onClick={() => setPreview(false)} disabled={loading}>Back</Btn>
              <Btn variant="primary" onClick={onConfirm} loading={loading}>Confirm Update</Btn>
            </>
          )}
        </RpxDialogFooter>
      </RpxDialogContent>
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
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Delete Products" onClose={onClose} />
        <RpxDialogBody>
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
            </>
          ) : (
            <>
              <div style={{ background: colors.warningBg, border: `1px solid ${colors.warning}`, borderRadius: 3, padding: '10px 12px', fontSize: 12, color: '#92610A', marginBottom: 10 }}>
                Permanently delete <strong>{targets.length} product{targets.length !== 1 ? 's' : ''}</strong> and their price history? Products in use by existing transactions will be skipped.
              </div>
              <div style={{ maxHeight: 140, overflowY: 'auto', fontSize: 12, color: colors.textSecondary }}>
                {targets.map(p => (
                  <div key={p.id} style={{ padding: '2px 0' }}>• {p.name} <span style={{ fontFamily: 'monospace', fontSize: 11 }}>({p.code})</span></div>
                ))}
              </div>
            </>
          )}
        </RpxDialogBody>
        <RpxDialogFooter>
          {results ? (
            <Btn variant="primary" onClick={onSuccess}>Done</Btn>
          ) : (
            <>
              <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
              <Btn variant="danger" onClick={onConfirm} loading={loading}>Delete {targets.length} Product{targets.length !== 1 ? 's' : ''}</Btn>
            </>
          )}
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Manage Categories Modal ──────────────────────────────────────────────────
const ICON_PRESETS = ['Layers','Zap','Cpu','Package','Archive','FileText','Monitor','Box','Recycle','Truck','Factory','Leaf']

function CatIcon({ name, size = 14 }: { name: string | null; size?: number }) {
  if (!name) return <Package style={{ width: size, height: size }} />
  const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[name]
  return Icon ? <Icon style={{ width: size, height: size }} /> : <Package style={{ width: size, height: size }} />
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {ICON_PRESETS.map(name => (
        <button
          key={name}
          type="button"
          title={name}
          onClick={() => onChange(value === name ? '' : name)}
          style={{
            width: 28, height: 28, borderRadius: 4, border: `1px solid ${value === name ? colors.action : colors.border}`,
            background: value === name ? `${colors.action}18` : '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: value === name ? colors.action : colors.textSecondary,
          }}
        >
          <CatIcon name={name} size={14} />
        </button>
      ))}
    </div>
  )
}

function ManageCategoriesModal({ categories, onClose, onSuccess }: {
  categories: CategoryItem[]; onClose: () => void; onSuccess: () => void
}) {
  const [newName,      setNewName]      = useState('')
  const [newColor,     setNewColor]     = useState('#607D8B')
  const [newIcon,      setNewIcon]      = useState('')
  const [newParentId,  setNewParentId]  = useState<string>('')
  const [adding,       setAdding]       = useState(false)
  const [editId,       setEditId]       = useState<string | null>(null)
  const [editName,     setEditName]     = useState('')
  const [editColor,    setEditColor]    = useState('')
  const [editIcon,     setEditIcon]     = useState('')
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState<string | null>(null)
  const [renameConfirm, setRenameConfirm] = useState<{
    id: string; oldName: string; newName: string; color: string; icon: string; count: number
  } | null>(null)

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    const res = await fetch('/api/product-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), colorHex: newColor, iconName: newIcon || null, parentId: newParentId || null }),
    })
    setAdding(false)
    if (res.ok) { toast.success('Category added'); setNewName(''); setNewIcon(''); setNewParentId(''); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to add category') }
  }

  function startEdit(cat: SubCategoryItem) {
    setEditId(cat.id)
    setEditName(cat.name)
    setEditColor(cat.colorHex ?? '#607D8B')
    setEditIcon(cat.iconName ?? '')
    setRenameConfirm(null)
  }

  async function handleSaveEdit(id: string) {
    const allCats = categories.flatMap(c => [c, ...c.children])
    const cat = allCats.find(c => c.id === id)
    if (!cat) return

    if (editName.trim() !== cat.name) {
      // Preview: check how many products would be affected
      setSaving(true)
      const res = await fetch(`/api/product-categories/${id}?preview=1`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      setSaving(false)
      const j = await res.json() as { affectedProducts?: number; oldName?: string; error?: string }
      if (!res.ok) { toast.error(j.error ?? 'Failed'); return }
      if ((j.affectedProducts ?? 0) > 0) {
        setRenameConfirm({ id, oldName: cat.name, newName: editName.trim(), color: editColor, icon: editIcon, count: j.affectedProducts! })
        return
      }
    }
    await doSaveEdit(id, editName.trim(), editColor, editIcon)
  }

  async function doSaveEdit(id: string, name: string, colorHex: string, iconName: string) {
    setSaving(true)
    const res = await fetch(`/api/product-categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, colorHex, iconName: iconName || null }),
    })
    setSaving(false)
    if (res.ok) { toast.success('Category updated'); setEditId(null); setRenameConfirm(null); onSuccess() }
    else { const j = await res.json(); toast.error((j as { error?: string }).error ?? 'Failed to update category') }
  }

  async function handleDeactivate(cat: SubCategoryItem) {
    setDeleting(cat.id)
    const res = await fetch(`/api/product-categories/${cat.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    setDeleting(null)
    if (res.ok) { toast.success(`"${cat.name}" deactivated`); onSuccess() }
    else { const j = await res.json(); toast.error((j as { error?: string }).error ?? 'Failed to deactivate') }
  }

  async function handleDelete(cat: SubCategoryItem) {
    setDeleting(cat.id)
    const res = await fetch(`/api/product-categories/${cat.id}`, { method: 'DELETE' })
    setDeleting(null)
    if (res.ok) { toast.success('Category deleted'); onSuccess() }
    else { const j = await res.json(); toast.error((j as { error?: string }).error ?? 'Failed to delete category') }
  }

  function renderCatRow(cat: SubCategoryItem, isChild = false) {
    const hasChildren = !isChild && (cat as CategoryItem).children?.length > 0
    return (
      <div key={cat.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
        {editId === cat.id ? (
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {renameConfirm?.id === cat.id ? (
              <div style={{ background: '#FFF8E1', border: `1px solid ${colors.warning}`, borderRadius: 3, padding: '8px 10px', fontSize: 12 }}>
                <p style={{ fontWeight: 600, color: '#92610A', marginBottom: 4 }}>
                  Rename &quot;{renameConfirm.oldName}&quot; → &quot;{renameConfirm.newName}&quot;?
                </p>
                <p style={{ color: '#6C757D' }}>
                  This will update <strong>{renameConfirm.count} product{renameConfirm.count !== 1 ? 's' : ''}</strong> to use the new name.
                </p>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                  <Btn size="sm" onClick={() => setRenameConfirm(null)} disabled={saving}>Cancel</Btn>
                  <Btn size="sm" variant="primary" loading={saving}
                    onClick={() => doSaveEdit(renameConfirm.id, renameConfirm.newName, renameConfirm.color, renameConfirm.icon)}>
                    Confirm Rename
                  </Btn>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)}
                    style={{ width: 26, height: 26, borderRadius: 3, border: `1px solid ${colors.border}`, cursor: 'pointer', padding: 1 }} />
                  <input value={editName} onChange={(e) => setEditName(e.target.value)}
                    style={{ flex: 1, height: 26, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '0 6px', fontSize: 12, outline: 'none' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveEdit(cat.id); if (e.key === 'Escape') setEditId(null) }}
                    autoFocus />
                </div>
                <IconPicker value={editIcon} onChange={setEditIcon} />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                  <Btn size="sm" variant="primary" onClick={() => void handleSaveEdit(cat.id)} loading={saving} disabled={!editName.trim()}>Save</Btn>
                  <Btn size="sm" onClick={() => { setEditId(null); setRenameConfirm(null) }} disabled={saving}>Cancel</Btn>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isChild ? '5px 10px 5px 22px' : '6px 10px' }}>
            {isChild && <span style={{ fontSize: 9, color: colors.textSecondary, marginRight: -4 }}>↳</span>}
            <span style={{ width: 12, height: 12, borderRadius: 2, background: cat.colorHex ?? '#607D8B', display: 'inline-block', flexShrink: 0 }} />
            {cat.iconName && <CatIcon name={cat.iconName} size={12} />}
            <span style={{ flex: 1, fontSize: 12, fontWeight: isChild ? 400 : 600, color: colors.textPrimary }}>{cat.name}</span>
            {cat._count && <span style={{ fontSize: 10, color: colors.textSecondary }}>{cat._count.products}p</span>}
            <Btn size="sm" style={{ padding: '2px 8px' }} onClick={() => startEdit(cat)}>Edit</Btn>
            {hasChildren ? (
              <span style={{ fontSize: 10, color: colors.textSecondary, padding: '2px 4px' }} title="Delete sub-categories first">Has subs</span>
            ) : (
              <>
                <Btn size="sm" style={{ padding: '2px 8px', color: colors.warning }} loading={deleting === cat.id} onClick={() => void handleDeactivate(cat)}>Deactivate</Btn>
                <Btn size="sm" variant="danger" style={{ padding: '2px 8px' }} loading={deleting === cat.id} onClick={() => void handleDelete(cat)}>Delete</Btn>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={480} style={{ maxHeight: '85vh' }}>
        <RpxDialogHeader title="Manage Categories" onClose={onClose} />
        <RpxDialogBody>
        <div className="space-y-3">
          <div style={{ maxHeight: 320, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 3 }}>
            {categories.length === 0 ? (
              <p style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: colors.textSecondary }}>No categories yet</p>
            ) : categories.map((cat) => (
              <React.Fragment key={cat.id}>
                {renderCatRow(cat, false)}
                {cat.children.map(sub => renderCatRow(sub, true))}
              </React.Fragment>
            ))}
          </div>

          <div style={{ background: colors.neutralBg, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '10px 12px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Category</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: colors.textSecondary, whiteSpace: 'nowrap' }}>Parent:</label>
              <select
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                style={{ flex: 1, height: 26, padding: '0 6px', fontSize: 11, border: `1px solid ${colors.border}`, borderRadius: 3, background: '#fff', color: colors.textPrimary, outline: 'none' }}
              >
                <option value="">None (top-level)</option>
                {categories.filter(c => !c.parentId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                style={{ width: 32, height: 28, borderRadius: 3, border: `1px solid ${colors.border}`, cursor: 'pointer', padding: 2 }} />
              <input placeholder="Category name…" value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
                style={{ flex: 1, height: 28, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '0 8px', fontSize: 12, outline: 'none', background: '#fff' }} />
              <Btn size="sm" variant="primary" onClick={() => void handleAdd()} loading={adding} disabled={!newName.trim()}>Add</Btn>
            </div>
            <IconPicker value={newIcon} onChange={setNewIcon} />
          </div>
        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose}>Close</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
