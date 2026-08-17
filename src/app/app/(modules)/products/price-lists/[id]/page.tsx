'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { ArrowUp, ArrowDown, Trash2, Printer, Save, ListPlus, Eye, RotateCcw } from 'lucide-react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { colors, fontSize } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import {
  inp, lbl, Btn, PortalPage, PANEL, PANEL_HEAD,
  RpxDialogContent, RpxDialogHeader,
} from '@/components/rpx'
import { Dialog } from '@/components/ui/dialog'
import { ProductCategoryPicker } from '@/components/products/ProductCategoryPicker'
import { DEFAULT_PRICE_LIST_COLORS, type PriceListColors } from '@/lib/schemas/priceList'
import { incVatPrice } from '@/lib/utils/vat'
import { useOfflineLookup } from '@/hooks/useOfflineLookup'

const COLOR_FIELDS: { key: keyof PriceListColors; label: string }[] = [
  { key: 'primaryColor',      label: 'Ribbon / Header' },
  { key: 'accentColor',       label: 'Accent Strip' },
  { key: 'headerTextColor',   label: 'Header Text' },
  { key: 'materialTextColor', label: 'Material Text' },
  { key: 'priceTextColor',    label: 'Price (Inc)' },
  { key: 'exVatTextColor',    label: 'Price (Ex)' },
  { key: 'rowTintColor',      label: 'Row Tint' },
]

type Product = {
  id: string; code: string; name: string; category: string; unit: string
  defaultBuyPrice: string
}

type PriceGroupOption = { id: string; name: string; isDefault: boolean }

type EditableItem = {
  productId: string | null
  displayName: string
  category: string
  priceExVat: string // input string — validated on save; the entered value (INC VAT is computed for display/print)
}

type PriceListDetail = PriceListColors & {
  id: string
  title: string
  listDate: string
  footerText: string
  showLogo: boolean
  showExVat: boolean
  priceGroupId: string
  updatedAt: string
  items: { productId: string | null; displayName: string; category: string; priceExVat: string; sortOrder: number }[]
}

/** INC VAT is computed for display — EX VAT is the entered, canonical price. */
function incVatLabel(priceExVat: string): string {
  const n = parseFloat(priceExVat)
  if (!priceExVat || isNaN(n) || n <= 0) return '—'
  return incVatPrice(priceExVat).toFixed(2)
}

export default function PriceListEditorPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const isNew = params.id === 'new'

  const [title,      setTitle]      = useState("TODAY'S PRICES")
  const [listDate,   setListDate]   = useState(() => new Date().toISOString().slice(0, 10))
  const [footerText, setFooterText] = useState('Prices subject to change without notice. VAT rate applied as per current legislation.')
  const [showLogo,   setShowLogo]   = useState(true)
  const [showExVat,  setShowExVat]  = useState(true)
  const [priceGroupId, setPriceGroupId] = useState('')
  const [docColors,  setDocColors]  = useState<PriceListColors>(DEFAULT_PRICE_LIST_COLORS)
  const [items,      setItems]      = useState<EditableItem[]>([])
  const [updatedAt,  setUpdatedAt]  = useState<string | null>(null)
  const [loaded,     setLoaded]     = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [previewOpen,    setPreviewOpen]    = useState(false)
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Fetched via getActiveProducts (same as Purchases/Sales) rather than a
  // plain fetcher — SWR's cache is keyed on the URL alone, shared across the
  // whole app regardless of which component/fetcher populates it. The plain
  // fetcher returned the raw { products: [...] } wrapper under this same
  // key, while every other page reading /api/products?active=true expects
  // the unwrapped array getActiveProducts already normalizes to — colliding
  // and handing an object where an array was expected, crashing on whichever
  // page rendered next.
  const { getActiveProducts } = useOfflineLookup()
  const { data: products } = useSWR<Product[]>('/api/products?active=true', () => getActiveProducts())
  const { data: priceGroupsData } = useSWR<{ groups: PriceGroupOption[] }>('/api/price-groups', fetcher)
  const priceGroups = useMemo(() => priceGroupsData?.groups ?? [], [priceGroupsData])
  const { data: detail, error: detailError } = useSWR<PriceListDetail>(
    isNew ? null : `/api/price-lists/${params.id}`,
    fetcher,
  )

  // A brand-new list starts pre-selected on whichever group is flagged
  // default — freely changeable before any products are added.
  useEffect(() => {
    if (!isNew || priceGroupId || priceGroups.length === 0) return
    const defaultGroup = priceGroups.find((g) => g.isDefault) ?? priceGroups[0]!
    setPriceGroupId(defaultGroup.id)
  }, [isNew, priceGroupId, priceGroups])

  // Hydrate editor state once from the fetched document
  useEffect(() => {
    if (isNew || !detail || loaded) return
    setTitle(detail.title)
    setListDate(detail.listDate.slice(0, 10))
    setFooterText(detail.footerText)
    setShowLogo(detail.showLogo)
    setShowExVat(detail.showExVat)
    setPriceGroupId(detail.priceGroupId)
    setDocColors({
      primaryColor:      detail.primaryColor,
      accentColor:       detail.accentColor,
      headerTextColor:   detail.headerTextColor,
      materialTextColor: detail.materialTextColor,
      priceTextColor:    detail.priceTextColor,
      exVatTextColor:    detail.exVatTextColor,
      rowTintColor:      detail.rowTintColor,
    })
    setItems(detail.items.map((i) => ({
      productId:  i.productId,
      displayName: i.displayName,
      category:   i.category,
      priceExVat: new Decimal(i.priceExVat).toFixed(2),
    })))
    setUpdatedAt(detail.updatedAt)
    setLoaded(true)
  }, [isNew, detail, loaded])

  // Revoke the blob URL on unmount so a closed-without-reopening preview
  // doesn't leak memory.
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products ?? []) set.add(p.category)
    return Array.from(set).sort()
  }, [products])

  const usedProductIds = useMemo(() => new Set(items.map((i) => i.productId).filter(Boolean)), [items])

  // Resolves EX VAT for this list's selected price group — a group override
  // if one exists for the product, else the product's own default (same
  // convention as Purchases/Sales — VAT is added on top, never derived by
  // dividing it back out). Reuses the endpoint resolveProductPrice already
  // calls elsewhere, so this stays consistent with actual purchase pricing.
  async function resolveGroupPrice(productId: string, fallback: string): Promise<string> {
    if (!priceGroupId) return new Decimal(fallback).toFixed(2)
    try {
      const res = await fetch(`/api/products/${productId}?priceGroupId=${priceGroupId}`)
      if (res.ok) {
        const data = await res.json() as { defaultBuyPrice: string }
        return new Decimal(data.defaultBuyPrice).toFixed(2)
      }
    } catch { /* fall through to the product's own default */ }
    return new Decimal(fallback).toFixed(2)
  }

  async function addProduct(product: Product) {
    if (usedProductIds.has(product.id)) { toast.info(`${product.name} is already on the list`); return }
    const priceExVat = await resolveGroupPrice(product.id, product.defaultBuyPrice)
    setItems((prev) => [...prev, {
      productId:  product.id,
      displayName: product.name,
      category:   product.category,
      priceExVat,
    }])
  }

  async function addCategory(category: string) {
    const toAdd = (products ?? []).filter((p) => p.category === category && !usedProductIds.has(p.id))
    if (toAdd.length === 0) { toast.info('All products in this category are already on the list'); return }
    const newItems = await Promise.all(toAdd.map(async (p) => ({
      productId:  p.id,
      displayName: p.name,
      category:   p.category,
      priceExVat: await resolveGroupPrice(p.id, p.defaultBuyPrice),
    })))
    setItems((prev) => [...prev, ...newItems])
    toast.success(`Added ${toAdd.length} product${toAdd.length === 1 ? '' : 's'} from ${category}`)
  }

  function addCustomLine() {
    setItems((prev) => [...prev, { productId: null, displayName: '', category: 'Other', priceExVat: '' }])
  }

  function updateItem(index: number, patch: Partial<EditableItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function moveItem(index: number, delta: -1 | 1) {
    setItems((prev) => {
      const target = index + delta
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const row = next.splice(index, 1)[0]!
      next.splice(target, 0, row)
      return next
    })
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function validate(): string | null {
    if (!title.trim()) return 'Title is required'
    if (!listDate) return 'Date is required'
    if (!priceGroupId) return 'Select a price group'
    if (items.length === 0) return 'Add at least one product'
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      if (!item.displayName.trim()) return `Row ${i + 1}: name is required`
      const n = parseFloat(item.priceExVat)
      if (!item.priceExVat || isNaN(n) || n <= 0) return `Row ${i + 1} (${item.displayName || 'unnamed'}): enter a valid price`
    }
    return null
  }

  function draftBody() {
    return {
      title:      title.trim(),
      listDate,
      footerText: footerText.trim(),
      showLogo,
      showExVat,
      priceGroupId,
      colors: docColors,
      items: items.map((item, i) => ({
        productId:   item.productId,
        displayName: item.displayName.trim(),
        category:    item.category.trim() || 'Other',
        priceExVat:  item.priceExVat,
        sortOrder:   i,
      })),
    }
  }

  async function handlePreview() {
    const problem = validate()
    if (problem) { toast.error(problem); return }

    setPreviewLoading(true)
    const res = await fetch('/api/price-lists/preview', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(draftBody()),
    })
    setPreviewLoading(false)

    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Failed to generate preview')
      return
    }
    const blob = await res.blob()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(blob))
    setPreviewOpen(true)
  }

  function closePreview() {
    setPreviewOpen(false)
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
  }

  async function save(printAfter: boolean) {
    const problem = validate()
    if (problem) { toast.error(problem); return }

    setSaving(true)
    const body = { ...draftBody(), ...(isNew ? {} : { updatedAt }) }
    const res = await fetch(isNew ? '/api/price-lists' : `/api/price-lists/${params.id}`, {
      method:  isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    setSaving(false)

    if (!res.ok) {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to save price list')
      return
    }
    const saved = await res.json()
    toast.success(isNew ? 'Price list created' : 'Price list saved')
    mutate('/api/price-lists')
    mutate('/api/price-lists/active')
    if (printAfter) window.open(`/api/price-lists/${saved.id}/pdf`, '_blank')
    router.push('/app/products/price-lists')
  }

  if (!isManager) {
    return (
      <PortalPage title="Price List">
        <p style={{ padding: 20, fontSize: fontSize.sm, color: colors.textSecondary }}>Manager role required.</p>
      </PortalPage>
    )
  }

  if (!isNew && detailError) {
    return (
      <PortalPage title="Price List">
        <p style={{ padding: 20, fontSize: fontSize.sm, color: colors.textSecondary }}>Price list not found.</p>
      </PortalPage>
    )
  }

  const pickerProducts = (products ?? []).filter((p) => !usedProductIds.has(p.id))

  return (
    <PortalPage title={isNew ? 'New Price List' : 'Edit Price List'}>
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto" style={{ padding: 8, gap: 8 }}>

        {/* ── Document settings + Add products, side by side ─────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flexShrink: 0 }}>

          <div style={PANEL}>
            <div style={PANEL_HEAD}>
              <span className="font-semibold" style={{ fontSize: fontSize.xs, color: colors.textPrimary }}>Document</span>
            </div>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={lbl}>Title</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} style={{ ...inp, height: 26 }} disabled={saving} />
                </div>
                <div style={{ width: 130 }}>
                  <span style={lbl}>Date</span>
                  <input type="date" value={listDate} onChange={(e) => setListDate(e.target.value)} style={{ ...inp, height: 26 }} disabled={saving} />
                </div>
              </div>
              <div>
                <span style={lbl} title="Which dealer tier these prices are for — new products you add resolve their price for this group. Casual customers (and no customer selected yet) see whichever group is flagged Default.">
                  Price group
                </span>
                <select
                  value={priceGroupId}
                  onChange={(e) => setPriceGroupId(e.target.value)}
                  style={{ ...inp, height: 26 }}
                  disabled={saving}
                >
                  <option value="" disabled>Select price group…</option>
                  {priceGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}{g.isDefault ? ' (Default)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <span style={lbl}>Footer text</span>
                <textarea
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  maxLength={500}
                  rows={2}
                  style={{ ...inp, height: 40, width: '100%', resize: 'none', fontFamily: 'inherit', padding: 6, fontSize: fontSize.xs }}
                  disabled={saving}
                />
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                <label className="flex items-center gap-1.5 cursor-pointer" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                  <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} className="rounded" />
                  Show logo
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                  <input type="checkbox" checked={showExVat} onChange={(e) => setShowExVat(e.target.checked)} className="rounded" />
                  Show EX VAT column
                </label>
              </div>
            </div>
          </div>

          <div style={PANEL}>
            <div className="flex items-center justify-between" style={PANEL_HEAD}>
              <span className="font-semibold" style={{ fontSize: fontSize.xs, color: colors.textPrimary }}>Add Products</span>
              <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <span style={lbl}>Add product</span>
                <ProductCategoryPicker
                  products={pickerProducts}
                  value=""
                  onChange={(productId) => {
                    const p = (products ?? []).find((x) => x.id === productId)
                    if (p) addProduct(p)
                  }}
                  placeholder="Select product…"
                  style={{ height: 26 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <span style={lbl}>Add whole category</span>
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) addCategory(e.target.value) }}
                    style={{ ...inp, height: 26 }}
                    disabled={saving}
                  >
                    <option value="">Select category…</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <Btn size="sm" icon={ListPlus} onClick={addCustomLine} disabled={saving}>Custom line</Btn>
              </div>

              {/* Print colors — moved in from its own standalone panel so the
                  items table below gets more vertical room. */}
              <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 2, paddingTop: 6 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                  <span style={lbl}>Print colors</span>
                  <button
                    onClick={() => setDocColors(DEFAULT_PRICE_LIST_COLORS)}
                    disabled={saving}
                    className="flex items-center gap-1 cursor-pointer"
                    style={{ fontSize: fontSize.xs, color: colors.link, background: 'none', border: 'none' }}
                  >
                    <RotateCcw style={{ width: 11, height: 11 }} />
                    Reset to default
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {COLOR_FIELDS.map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <input
                        type="color"
                        value={docColors[key]}
                        onChange={(e) => setDocColors((prev) => ({ ...prev, [key]: e.target.value }))}
                        disabled={saving}
                        style={{ width: 30, height: 20, padding: 0, border: `1px solid ${colors.border}`, borderRadius: 2, cursor: 'pointer', background: 'none' }}
                      />
                      <span style={{ fontSize: 9, color: colors.textSecondary, textAlign: 'center', lineHeight: 1.2, maxWidth: 66 }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Items table — fills remaining height, scrolls internally ───── */}
        <div style={{ ...PANEL, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '52px 100px 1fr 110px 90px 32px',
              gap: 0,
              padding: '4px 8px',
              borderBottom: `1px solid ${colors.border}`,
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: colors.textSecondary,
              background: colors.bg,
              flexShrink: 0,
            }}
          >
            <span>Order</span>
            <span>Category</span>
            <span>Material</span>
            <span style={{ textAlign: 'right' }}>Ex VAT (R)</span>
            <span style={{ textAlign: 'right' }}>Inc VAT</span>
            <span />
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {items.length === 0 && (
              <p style={{ padding: 14, fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' }}>
                No items yet — add products or a whole category above.
              </p>
            )}

            {items.map((item, i) => (
              <div
                key={`${item.productId ?? 'custom'}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 100px 1fr 110px 90px 32px',
                  alignItems: 'center',
                  padding: '2px 8px',
                  borderBottom: `1px solid ${colors.border}`,
                  background: i % 2 === 1 ? colors.bg : undefined,
                }}
              >
                <div style={{ display: 'flex', gap: 1 }}>
                  <button
                    onClick={() => moveItem(i, -1)}
                    disabled={i === 0 || saving}
                    style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, padding: 2 }}
                    title="Move up"
                  >
                    <ArrowUp style={{ width: 12, height: 12, color: colors.textSecondary }} />
                  </button>
                  <button
                    onClick={() => moveItem(i, 1)}
                    disabled={i === items.length - 1 || saving}
                    style={{ background: 'none', border: 'none', cursor: i === items.length - 1 ? 'default' : 'pointer', opacity: i === items.length - 1 ? 0.3 : 1, padding: 2 }}
                    title="Move down"
                  >
                    <ArrowDown style={{ width: 12, height: 12, color: colors.textSecondary }} />
                  </button>
                </div>
                <input
                  value={item.category}
                  onChange={(e) => updateItem(i, { category: e.target.value })}
                  maxLength={40}
                  placeholder="Category…"
                  title="Groups this row under a divider bar on the printed list"
                  style={{ ...inp, height: 22, fontSize: fontSize.xs, marginRight: 8 }}
                  disabled={saving}
                />
                <input
                  value={item.displayName}
                  onChange={(e) => updateItem(i, { displayName: e.target.value })}
                  maxLength={80}
                  placeholder={item.productId ? undefined : 'Custom line name…'}
                  style={{ ...inp, height: 22, fontSize: fontSize.xs, marginRight: 8 }}
                  disabled={saving}
                />
                <input
                  value={item.priceExVat}
                  onChange={(e) => updateItem(i, { priceExVat: e.target.value })}
                  placeholder="0.00"
                  inputMode="decimal"
                  style={{ ...inp, height: 22, fontSize: fontSize.xs, fontFamily: 'monospace', textAlign: 'right', marginRight: 8 }}
                  disabled={saving}
                />
                <span className="font-mono" style={{ fontSize: fontSize.xs, textAlign: 'right', color: colors.textSecondary, paddingRight: 4 }}>
                  {incVatLabel(item.priceExVat)}
                </span>
                <button
                  onClick={() => removeItem(i)}
                  disabled={saving}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, justifySelf: 'end' }}
                  title="Remove"
                >
                  <Trash2 style={{ width: 12, height: 12, color: colors.danger }} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0, margin: '0 -8px -8px', padding: '6px 10px', borderTop: `1px solid ${colors.border}`, background: '#F8F9FA' }}>
          <Btn onClick={() => router.push('/app/products/price-lists')} disabled={saving}>Cancel</Btn>
          <Btn icon={Eye} onClick={handlePreview} disabled={saving || previewLoading} loading={previewLoading}>Preview</Btn>
          <Btn icon={Printer} onClick={() => save(true)} disabled={saving} loading={saving}>Save &amp; Print</Btn>
          <Btn variant="primary" icon={Save} onClick={() => save(false)} disabled={saving} loading={saving}>
            {isNew ? 'Create Price List' : 'Save Changes'}
          </Btn>
        </div>

      </div>

      {previewOpen && previewUrl && (
        <Dialog open onOpenChange={(o) => { if (!o) closePreview() }}>
          <RpxDialogContent maxWidth={680} style={{ height: '90vh' }}>
            <RpxDialogHeader title="Price List Preview" onClose={closePreview} />
            <div style={{ flex: 1, minHeight: 0, background: colors.bg }}>
              <iframe src={previewUrl} title="Price list preview" style={{ width: '100%', height: '100%', border: 'none' }} />
            </div>
          </RpxDialogContent>
        </Dialog>
      )}
    </PortalPage>
  )
}
