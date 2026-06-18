'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, ModalTitleBar, ModalBtn } from '@/components/ui/dialog'
import { WinButton } from '@/components/ui/WinButton'
import { Search, Pencil, TrendingUp, Plus, Eye, EyeOff, Trash2, X, Settings2, Package, Loader2, MoreVertical } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateProductSchema, UpdateProductSchema, BulkPriceUpdateSchema, type CreateProductInput, type CreateProductFormInput, type UpdateProductInput } from '@/lib/schemas/product'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
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

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 8px', height: 28,
  fontSize: 10, fontWeight: 700, color: colors.textSecondary,
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '0 8px', fontSize: 12 }

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
  const [menuOpenId,    setMenuOpenId]   = useState<string | null>(null)

  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setCreateOpen(true)
      router.replace('/app/products')
    }
  }, [searchParams, router])

  useEffect(() => {
    if (!menuOpenId) return
    const close = () => setMenuOpenId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpenId])

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
  // Flat list of all category names (parents + children) for lookup helpers
  const allCategoryNames: SubCategoryItem[] = categories.flatMap(c => [c, ...c.children])

  const revalidate = () => mutate(swrKey)

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

  const allSelected = products.length > 0 && selectedKeys.size === products.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1B3A6B' }}>Products</span>
          <span style={{ fontSize: 11, color: '#6C757D' }}>{products.length} products</span>
          <div style={{ flex: 1 }} />
          {isManager && (
            <>
              <WinButton onClick={() => setCatManageOpen(true)}>
                <Settings2 style={{ width: 9, height: 9 }} /> Categories
              </WinButton>
              <WinButton onClick={() => setBulkOpen(true)}>
                <TrendingUp style={{ width: 9, height: 9 }} /> Bulk Price
              </WinButton>
              <WinButton onClick={() => setCreateOpen(true)}>
                <Plus style={{ width: 9, height: 9 }} /> Add Product
              </WinButton>
            </>
          )}
        </div>

        {/* Filter toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'linear-gradient(180deg,#F5F5F5 0%,#ECECEC 100%)', borderBottom: '1px solid #C0C0C0', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 11, height: 11, color: '#6C757D', pointerEvents: 'none' }} />
            <input
              placeholder="Search code or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ height: 24, paddingLeft: 22, paddingRight: 8, fontSize: 11, border: '1px solid #ABABAB', borderRadius: 2, outline: 'none', background: '#fff', width: 190, color: '#212529' }}
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ height: 24, padding: '0 6px', fontSize: 11, border: '1px solid #ABABAB', borderRadius: 2, background: '#fff', color: '#212529', outline: 'none' }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <React.Fragment key={c.id}>
                <option value={c.name}>{c.name}</option>
                {c.children.map(s => <option key={s.id} value={s.name}>&nbsp;&nbsp;↳ {s.name}</option>)}
              </React.Fragment>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value)}
            style={{ height: 24, padding: '0 6px', fontSize: 11, border: '1px solid #ABABAB', borderRadius: 2, background: '#fff', color: '#212529', outline: 'none' }}
          >
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
            <option value="all">All statuses</option>
          </select>
        </div>

        {/* Bulk action bar */}
        {isManager && selectedKeys.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: '#EBF3FC', borderBottom: '1px solid #185ABD', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#185ABD' }}>{selectedKeys.size} selected</span>
            <button
              onClick={() => setSelectedKeys(new Set())}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#6C757D', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
            >
              <X style={{ width: 11, height: 11 }} /> Clear
            </button>
            <div style={{ flex: 1 }} />
            <ModalBtn onClick={handleBulkReactivate} loading={bulkLoading === 'reactivate'} disabled={bulkLoading !== null}>Reactivate</ModalBtn>
            <ModalBtn onClick={handleBulkDeactivate} loading={bulkLoading === 'deactivate'} disabled={bulkLoading !== null}>Deactivate</ModalBtn>
            <ModalBtn variant="danger" onClick={() => setBulkDelOpen(true)} disabled={bulkLoading !== null}>Delete</ModalBtn>
          </div>
        )}

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#6C757D', fontSize: 12, gap: 8 }}>
              <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Loading…
            </div>
          ) : products.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, color: '#6C757D', fontSize: 12, gap: 8 }}>
              <span>No products found</span>
              {isManager && (
                <WinButton onClick={() => setCreateOpen(true)}>
                  <Plus style={{ width: 9, height: 9 }} /> Add Product
                </WinButton>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
                  {isManager && (
                    <th style={{ ...TH, width: 32, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        style={{ width: 12, height: 12, cursor: 'pointer' }}
                        checked={allSelected}
                        onChange={(e) => setSelectedKeys(e.target.checked ? new Set(products.map(p => p.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th style={{ ...TH, width: 100 }}>Code</th>
                  <th style={TH}>Name</th>
                  <th style={{ ...TH, width: 120 }}>Category</th>
                  <th style={{ ...TH, width: 56 }}>Unit</th>
                  <th style={{ ...TH, width: 90 }}>Buy Price</th>
                  <th style={{ ...TH, width: 90 }}>Sell Price</th>
                  <th style={{ ...TH, width: 70 }}>Margin</th>
                  <th style={{ ...TH, width: 76 }}>Status</th>
                  {isManager && <th style={{ ...TH, width: 72 }}></th>}
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => {
                  const m      = calcMargin(p.defaultBuyPrice, p.defaultSellPrice)
                  const cat    = allCategoryNames.find(c => c.name === p.category)
                  const catSty = getCategoryStyle(cat?.colorHex, p.category)
                  const rowBg  = i % 2 === 1 ? '#FAFAFA' : '#fff'
                  return (
                    <tr
                      key={p.id}
                      style={{ background: rowBg, borderBottom: '1px solid #F0F0F0', height: 30 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF4FB')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
                    >
                      {isManager && (
                        <td style={{ ...TD, width: 32, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            style={{ width: 12, height: 12, cursor: 'pointer' }}
                            checked={selectedKeys.has(p.id)}
                            onChange={(e) => {
                              const next = new Set(selectedKeys)
                              if (e.target.checked) { next.add(p.id) } else { next.delete(p.id) }
                              setSelectedKeys(next)
                            }}
                          />
                        </td>
                      )}
                      <td style={{ ...TD, fontFamily: 'monospace', color: '#6C757D', fontSize: 11 }}>{p.code}</td>
                      <td style={{ ...TD, fontWeight: 600, color: '#212529' }}>{p.name}</td>
                      <td style={TD}>
                        <span style={{ ...catSty, display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600 }}>{p.category}</span>
                      </td>
                      <td style={{ ...TD, textTransform: 'uppercase', color: '#6C757D', fontSize: 11 }}>{p.unit}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', color: colors.action }}>R {new Decimal(p.defaultBuyPrice).toFixed(2)}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', color: colors.process }}>R {new Decimal(p.defaultSellPrice).toFixed(2)}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600, color: m.color }}>{m.pct}</td>
                      <td style={TD}>
                        <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, ...(p.isActive ? { background: colors.actionBg, color: colors.action } : { background: colors.neutralBg, color: colors.textSecondary }) }}>
                          {p.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {isManager && (
                        <td style={{ ...TD, width: 32, textAlign: 'center' }}>
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === p.id ? null : p.id) }}
                              style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 2, color: '#9AAABF' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#212529')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#9AAABF')}
                            >
                              <MoreVertical style={{ width: 14, height: 14 }} />
                            </button>
                            {menuOpenId === p.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{ position: 'absolute', right: 0, top: 24, zIndex: 50, background: '#fff', border: '1px solid #D0D0D0', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 140, overflow: 'hidden' }}
                              >
                                {[
                                  { label: 'Edit', icon: <Pencil style={{ width: 12, height: 12 }} />, color: colors.textPrimary, action: () => { setEditTarget(p); setMenuOpenId(null) } },
                                  { label: p.isActive ? 'Deactivate' : 'Reactivate', icon: p.isActive ? <EyeOff style={{ width: 12, height: 12 }} /> : <Eye style={{ width: 12, height: 12 }} />, color: colors.warning, action: () => { handleToggleActive(p); setMenuOpenId(null) } },
                                  { label: 'Delete', icon: <Trash2 style={{ width: 12, height: 12 }} />, color: colors.danger, action: () => { setDeleteTarget(p); setMenuOpenId(null) } },
                                ].map((item) => (
                                  <button
                                    key={item.label}
                                    onClick={item.action}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: item.color, textAlign: 'left' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F5F5')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                  >
                                    {item.icon}{item.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
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
    </div>
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
                {categories.map((c) => (
                  <React.Fragment key={c.id}>
                    {c.children.length === 0
                      ? <SelectItem value={c.name}>{c.name}</SelectItem>
                      : <SelectItem value={c.name} disabled className="font-semibold opacity-60">{c.name}</SelectItem>
                    }
                    {c.children.map(s => <SelectItem key={s.id} value={s.name}>&nbsp;&nbsp;↳ {s.name}</SelectItem>)}
                  </React.Fragment>
                ))}
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
                  {categories.map((c) => (
                    <React.Fragment key={c.id}>
                      {c.children.length === 0
                        ? <SelectItem value={c.name}>{c.name}</SelectItem>
                        : <SelectItem value={c.name} disabled className="font-semibold opacity-60">{c.name}</SelectItem>
                      }
                      {c.children.map(s => <SelectItem key={s.id} value={s.name}>&nbsp;&nbsp;↳ {s.name}</SelectItem>)}
                    </React.Fragment>
                  ))}
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
                  <ModalBtn onClick={() => setRenameConfirm(null)} disabled={saving}>Cancel</ModalBtn>
                  <ModalBtn variant="primary" loading={saving}
                    onClick={() => doSaveEdit(renameConfirm.id, renameConfirm.newName, renameConfirm.color, renameConfirm.icon)}>
                    Confirm Rename
                  </ModalBtn>
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
                  <ModalBtn variant="primary" onClick={() => void handleSaveEdit(cat.id)} loading={saving} disabled={!editName.trim()}>Save</ModalBtn>
                  <ModalBtn onClick={() => { setEditId(null); setRenameConfirm(null) }} disabled={saving}>Cancel</ModalBtn>
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
            <button onClick={() => startEdit(cat)} style={{ fontSize: 11, color: colors.process, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>Edit</button>
            {hasChildren ? (
              <span style={{ fontSize: 10, color: colors.textSecondary, padding: '2px 4px' }} title="Delete sub-categories first">Has subs</span>
            ) : (
              <>
                <button onClick={() => void handleDeactivate(cat)} disabled={deleting === cat.id}
                  style={{ fontSize: 11, color: colors.warning, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', opacity: deleting === cat.id ? 0.5 : 1 }}>
                  {deleting === cat.id ? '…' : 'Deactivate'}
                </button>
                <button onClick={() => void handleDelete(cat)} disabled={deleting === cat.id}
                  style={{ fontSize: 11, color: colors.danger, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', opacity: deleting === cat.id ? 0.5 : 1 }}>
                  {deleting === cat.id ? '…' : 'Delete'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <ModalTitleBar title="Manage Categories" onClose={onClose} />
        <div className="space-y-3 mt-2">
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
              <ModalBtn variant="primary" onClick={() => void handleAdd()} loading={adding} disabled={!newName.trim()}>Add</ModalBtn>
            </div>
            <IconPicker value={newIcon} onChange={setNewIcon} />
          </div>

          <div className="flex justify-end">
            <ModalBtn onClick={onClose}>Close</ModalBtn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
