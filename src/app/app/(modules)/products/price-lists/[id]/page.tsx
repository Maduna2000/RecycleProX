'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { ArrowUp, ArrowDown, Trash2, Printer, Save, ListPlus } from 'lucide-react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { colors, fontSize } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import { inp, lbl, Btn, PortalPage, PANEL, PANEL_HEAD } from '@/components/rpx'
import { ProductCategoryPicker } from '@/components/products/ProductCategoryPicker'

const VAT_DIVISOR = new Decimal('1.15')

type Product = {
  id: string; code: string; name: string; category: string; unit: string
  defaultBuyPrice: string; isActive: boolean
}

type EditableItem = {
  productId: string | null
  displayName: string
  priceIncVat: string // input string — validated on save
}

type PriceListDetail = {
  id: string
  title: string
  listDate: string
  footerText: string
  showLogo: boolean
  showExVat: boolean
  updatedAt: string
  items: { productId: string | null; displayName: string; priceIncVat: string; sortOrder: number }[]
}

function exVatLabel(priceIncVat: string): string {
  const n = parseFloat(priceIncVat)
  if (!priceIncVat || isNaN(n) || n <= 0) return '—'
  return new Decimal(priceIncVat).div(VAT_DIVISOR).toFixed(2)
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
  const [items,      setItems]      = useState<EditableItem[]>([])
  const [updatedAt,  setUpdatedAt]  = useState<string | null>(null)
  const [loaded,     setLoaded]     = useState(false)
  const [saving,     setSaving]     = useState(false)

  // /api/products wraps the list: { products: [...] }
  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products?active=true', fetcher)
  const products = productsData?.products
  const { data: detail, error: detailError } = useSWR<PriceListDetail>(
    isNew ? null : `/api/price-lists/${params.id}`,
    fetcher,
  )

  // Hydrate editor state once from the fetched document
  useEffect(() => {
    if (isNew || !detail || loaded) return
    setTitle(detail.title)
    setListDate(detail.listDate.slice(0, 10))
    setFooterText(detail.footerText)
    setShowLogo(detail.showLogo)
    setShowExVat(detail.showExVat)
    setItems(detail.items.map((i) => ({
      productId:   i.productId,
      displayName: i.displayName,
      priceIncVat: new Decimal(i.priceIncVat).toFixed(2),
    })))
    setUpdatedAt(detail.updatedAt)
    setLoaded(true)
  }, [isNew, detail, loaded])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products ?? []) set.add(p.category)
    return Array.from(set).sort()
  }, [products])

  const usedProductIds = useMemo(() => new Set(items.map((i) => i.productId).filter(Boolean)), [items])

  function addProduct(product: Product) {
    if (usedProductIds.has(product.id)) { toast.info(`${product.name} is already on the list`); return }
    setItems((prev) => [...prev, {
      productId:   product.id,
      displayName: product.name,
      priceIncVat: new Decimal(product.defaultBuyPrice).toFixed(2),
    }])
  }

  function addCategory(category: string) {
    const toAdd = (products ?? []).filter((p) => p.category === category && !usedProductIds.has(p.id))
    if (toAdd.length === 0) { toast.info('All products in this category are already on the list'); return }
    setItems((prev) => [...prev, ...toAdd.map((p) => ({
      productId:   p.id,
      displayName: p.name,
      priceIncVat: new Decimal(p.defaultBuyPrice).toFixed(2),
    }))])
    toast.success(`Added ${toAdd.length} product${toAdd.length === 1 ? '' : 's'} from ${category}`)
  }

  function addCustomLine() {
    setItems((prev) => [...prev, { productId: null, displayName: '', priceIncVat: '' }])
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
    if (items.length === 0) return 'Add at least one product'
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      if (!item.displayName.trim()) return `Row ${i + 1}: name is required`
      const n = parseFloat(item.priceIncVat)
      if (!item.priceIncVat || isNaN(n) || n <= 0) return `Row ${i + 1} (${item.displayName || 'unnamed'}): enter a valid price`
    }
    return null
  }

  async function save(printAfter: boolean) {
    const problem = validate()
    if (problem) { toast.error(problem); return }

    setSaving(true)
    const body = {
      title:      title.trim(),
      listDate,
      footerText: footerText.trim(),
      showLogo,
      showExVat,
      items: items.map((item, i) => ({
        productId:   item.productId,
        displayName: item.displayName.trim(),
        priceIncVat: item.priceIncVat,
        sortOrder:   i,
      })),
      ...(isNew ? {} : { updatedAt }),
    }
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
            </div>
          </div>

        </div>

        {/* ── Items table — fills remaining height, scrolls internally ───── */}
        <div style={{ ...PANEL, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '52px 1fr 110px 90px 32px',
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
            <span>Material</span>
            <span style={{ textAlign: 'right' }}>Inc VAT (R)</span>
            <span style={{ textAlign: 'right' }}>Ex VAT</span>
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
                  gridTemplateColumns: '52px 1fr 110px 90px 32px',
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
                  value={item.displayName}
                  onChange={(e) => updateItem(i, { displayName: e.target.value })}
                  maxLength={80}
                  placeholder={item.productId ? undefined : 'Custom line name…'}
                  style={{ ...inp, height: 22, fontSize: fontSize.xs, marginRight: 8 }}
                  disabled={saving}
                />
                <input
                  value={item.priceIncVat}
                  onChange={(e) => updateItem(i, { priceIncVat: e.target.value })}
                  placeholder="0.00"
                  inputMode="decimal"
                  style={{ ...inp, height: 22, fontSize: fontSize.xs, fontFamily: 'monospace', textAlign: 'right' }}
                  disabled={saving}
                />
                <span className="font-mono" style={{ fontSize: fontSize.xs, textAlign: 'right', color: colors.textSecondary, paddingRight: 4 }}>
                  {showExVat ? exVatLabel(item.priceIncVat) : '—'}
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
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <Btn onClick={() => router.push('/app/products/price-lists')} disabled={saving}>Cancel</Btn>
          <Btn icon={Printer} onClick={() => save(true)} disabled={saving} loading={saving}>Save &amp; Print</Btn>
          <Btn variant="primary" icon={Save} onClick={() => save(false)} disabled={saving} loading={saving}>
            {isNew ? 'Create Price List' : 'Save Changes'}
          </Btn>
        </div>

      </div>
    </PortalPage>
  )
}
