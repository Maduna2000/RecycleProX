'use client'

import { useState, useRef } from 'react'
import useSWR, { mutate } from 'swr'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { Loader2, CheckCircle, Ban, Scale, RefreshCw, Camera, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { format } from '@/lib/utils/format'
import { colors } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import { useOfflineLookup } from '@/hooks/useOfflineLookup'
import {
  Btn, PortalPage, BAR_GRAD, PANEL,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'
import { DataTable, type Column, StatusBadge } from '@/components/ui/DataTable'


type Product = { id: string; code: string; name: string; unit: string; category: string }
type StocktakeEntry = {
  id: string
  productId: string
  product: Product
  systemQty: string
  countedQty: string
  grossQty: string | null
  tareQty: string | null
  variance: string
  photoR2Key: string | null
}
type Stocktake = {
  id: string
  refNumber: string
  status: 'open' | 'completed' | 'voided'
  notes: string | null
  completedAt: string | null
  createdAt: string
  createdBy: { fullName: string }
  voidedAt?: string | null
  voidedBy?: { fullName: string } | null
  voidReason?: string | null
  entries: StocktakeEntry[]
}

type EntryWeighState = {
  weighMode: boolean
  selectedScale: '1' | '2' | '3'
  grossQty: string
  tareQty: string
  weighingGross: boolean
  weighingTare: boolean
}
function defaultWeigh(): EntryWeighState {
  return { weighMode: false, selectedScale: '1', grossQty: '', tareQty: '', weighingGross: false, weighingTare: false }
}

export default function StocktakeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: stocktake, isLoading } = useSWR<Stocktake>(
    isManager ? `/api/stocktake/${id}` : null,
    fetcher
  )
  // Fetched via getActiveProducts (same as Purchases/Sales/the price-list
  // editor) rather than a plain fetcher — SWR's cache is keyed on the URL
  // alone, shared app-wide regardless of which fetcher populates it; a plain
  // fetcher here would hand other pages reading this same key the raw
  // { products: [...] } wrapper where they expect the unwrapped array.
  const { getActiveProducts } = useOfflineLookup()
  const { data: productsData } = useSWR<Product[]>(
    isManager ? '/api/products?active=true' : null,
    () => getActiveProducts()
  )

  const [productId, setProductId] = useState('')
  const [countedQty, setCountedQty] = useState('')
  const [addWeigh, setAddWeigh] = useState<EntryWeighState>(defaultWeigh())
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [entryWeigh, setEntryWeigh] = useState<Record<string, EntryWeighState>>({})
  const [uploadingPhoto, setUploadingPhoto] = useState<Record<string, boolean>>({})
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [showRecountDialog, setShowRecountDialog] = useState(false)
  const [pendingRecount, setPendingRecount] = useState<{ productId: string; existingQty: string } | null>(null)
  const [showVoidDialog, setShowVoidDialog] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const pendingPhotoEntryRef = useRef<string | null>(null)

  function getEntryWeigh(entryId: string): EntryWeighState {
    return entryWeigh[entryId] ?? defaultWeigh()
  }
  function patchEntryWeigh(entryId: string, patch: Partial<EntryWeighState>) {
    setEntryWeigh((prev) => ({ ...prev, [entryId]: { ...getEntryWeigh(entryId), ...patch } }))
  }

  if (!isManager) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary, fontSize: 13 }}>
        Access restricted to managers and administrators.
      </div>
    )
  }

  // Scale functions removed - scales are a future feature
  // See Phase 5 in the plan: scales disabled but UI kept as placeholder

  // Placeholder scale functions for add weigh mode (disabled until scale integration)
  function recomputeAddNet(gross: string, tare: string) {
    const g = parseFloat(gross || '0')
    const t = parseFloat(tare || '0')
    const net = Math.max(0, g - t)
    setAddWeigh((p) => ({ ...p, grossQty: gross, tareQty: tare }))
    setCountedQty(net > 0 ? net.toFixed(3) : '')
  }
  function handleAddWeighGross() {
    // Placeholder for future scale integration
  }
  function handleAddWeighTare() {
    // Placeholder for future scale integration
  }

  async function saveEntry(pid: string, qty: string, opts?: { grossQty?: string; tareQty?: string }) {
    const res = await fetch(`/api/stocktake/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: pid, countedQty: qty, ...opts }),
    })
    if (!res.ok) {
      const j = await res.json() as { error?: string }
      throw new Error(j.error ?? 'Failed to save')
    }
    mutate(`/api/stocktake/${id}`)
  }

  function triggerPhotoUpload(productId: string) {
    pendingPhotoEntryRef.current = productId
    photoInputRef.current?.click()
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const pid = pendingPhotoEntryRef.current
    if (!file || !pid) return
    e.target.value = ''

    setUploadingPhoto((prev) => ({ ...prev, [pid]: true }))
    try {
      const fd = new FormData()
      fd.append('context', 'stocktake_entry')
      fd.append('referenceId', id)
      fd.append('file', file)

      const uploadRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { key } = await uploadRes.json() as { key: string }

      const patchRes = await fetch(`/api/stocktake/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: pid, photoR2Key: key }),
      })
      if (!patchRes.ok) throw new Error('Failed to save photo key')

      toast.success('Photo saved')
      mutate(`/api/stocktake/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Photo upload failed')
    } finally {
      setUploadingPhoto((prev) => ({ ...prev, [pid]: false }))
      pendingPhotoEntryRef.current = null
    }
  }

  async function viewPhoto(key: string) {
    const res = await fetch(`/api/r2/view-url?key=${encodeURIComponent(key)}`)
    if (!res.ok) { toast.error('Failed to get photo URL'); return }
    const { url } = await res.json() as { url: string }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleAddEntryClick() {
    if (!productId) { toast.error('Select a product'); return }
    if (!countedQty || parseFloat(countedQty) < 0) { toast.error('Enter a valid quantity (0 or more)'); return }

    // Check if product already counted - show confirmation
    const existingEntry = entries.find((e) => e.productId === productId)
    if (existingEntry) {
      setPendingRecount({ productId, existingQty: existingEntry.countedQty })
      setShowRecountDialog(true)
      return
    }

    performSaveEntry()
  }

  async function performSaveEntry() {
    setSaving(true)
    try {
      await saveEntry(productId, countedQty, {
        grossQty: addWeigh.grossQty || undefined,
        tareQty: addWeigh.tareQty || undefined,
      })
      toast.success('Entry saved')
      setProductId('')
      setCountedQty('')
      setAddWeigh(defaultWeigh())
      setPendingRecount(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save entry')
    } finally {
      setSaving(false)
    }
  }

  async function performComplete() {
    setShowCompleteDialog(false)
    setCompleting(true)
    const res = await fetch(`/api/stocktake/${id}`, { method: 'POST' })
    setCompleting(false)
    if (res.ok) { toast.success('Stocktake completed'); mutate(`/api/stocktake/${id}`) }
    else { const j = await res.json() as { error?: string }; toast.error(j.error ?? 'Failed to complete') }
  }

  async function performVoid() {
    setVoiding(true)
    try {
      const res = await fetch(`/api/stocktake/${id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        throw new Error(j.error ?? 'Failed to void stocktake')
      }
      toast.success('Stocktake voided — stock adjustments reversed')
      setShowVoidDialog(false)
      setVoidReason('')
      mutate(`/api/stocktake/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to void stocktake')
    } finally {
      setVoiding(false)
    }
  }

  const products = productsData ?? []
  const entries = stocktake?.entries ?? []
  const isOpen = stocktake?.status === 'open'
  const countedIds = new Set(entries.map((e) => e.productId))
  const variances = entries.filter((e) => new Decimal(e.variance).abs().gt(0))

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary }}>
        <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }
  if (!stocktake) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: colors.textSecondary, fontSize: 13 }}>
        Stocktake not found
      </div>
    )
  }

  const columns: Column<StocktakeEntry>[] = [
    {
      key: 'product', header: 'Product',
      render: (e) => (
        <>
          <p style={{ fontWeight: 500, color: colors.textPrimary }}>{e.product.name}</p>
          <p style={{ fontSize: 10, fontFamily: 'monospace', color: colors.textSecondary }}>{e.product.code}</p>
        </>
      ),
    },
    {
      key: 'category', header: 'Category', width: '120px',
      render: (e) => (
        <span style={{ padding: '2px 6px', borderRadius: 2, fontSize: 10, background: colors.neutralBg, color: colors.textSecondary }}>
          {e.product.category}
        </span>
      ),
    },
    {
      key: 'systemQty', header: 'System Qty', width: '110px',
      render: (e) => <span style={{ fontFamily: 'monospace' }}>{Number(e.systemQty).toFixed(2)} {e.product.unit}</span>,
    },
    {
      key: 'grossTare', header: 'Gross / Tare', width: '160px',
      render: (e) => {
        const ew = getEntryWeigh(e.id)
        return (
          <>
            {(e.grossQty || e.tareQty) ? (
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: colors.textSecondary }}>
                G:{Number(e.grossQty ?? 0).toFixed(2)} T:{Number(e.tareQty ?? 0).toFixed(2)}
              </span>
            ) : <span style={{ color: colors.disabled }}>—</span>}
            {isOpen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Select value={ew.selectedScale} onValueChange={(v) => patchEntryWeigh(e.id, { selectedScale: v as '1' | '2' | '3' })} disabled>
                  <SelectTrigger style={{ height: 24, width: 60, fontSize: 10, padding: '0 4px', opacity: 0.5 }} aria-label="Select scale (coming soon)"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Scale 1</SelectItem>
                    <SelectItem value="2">Scale 2</SelectItem>
                    <SelectItem value="3">Scale 3</SelectItem>
                  </SelectContent>
                </Select>
                <Btn disabled style={{ height: 32, minWidth: 32, padding: '0 6px', fontSize: 10 }} title="Scale integration coming soon">G</Btn>
                <Btn disabled style={{ height: 32, minWidth: 32, padding: '0 6px', fontSize: 10 }} title="Scale integration coming soon">T</Btn>
              </div>
            )}
          </>
        )
      },
    },
    {
      key: 'countedQty', header: 'Net Counted', width: '110px',
      render: (e) => <span style={{ fontFamily: 'monospace' }}>{Number(e.countedQty).toFixed(2)} {e.product.unit}</span>,
    },
    {
      key: 'variance', header: 'Variance', width: '120px',
      render: (e) => {
        const variance = new Decimal(e.variance)
        const hasVariance = variance.abs().gt(0)
        const text = `${variance.gt(0) ? '+' : ''}${Number(e.variance).toFixed(2)} ${e.product.unit}`
        // No per-row background hook in DataTable — a colored pill stands in for
        // the full-row highlight this table used to show for variance entries.
        return hasVariance ? (
          <span style={{ display: 'inline-flex', padding: '2px 6px', borderRadius: 2, fontFamily: 'monospace', fontWeight: 600, fontSize: 11, background: colors.warningBg, color: variance.gt(0) ? colors.action : colors.danger }}>
            {text}
          </span>
        ) : (
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: colors.textSecondary }}>{text}</span>
        )
      },
    },
    {
      key: 'photo', header: 'Photo', width: '140px',
      render: (e) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {e.photoR2Key ? (
            <Btn icon={ExternalLink} onClick={() => viewPhoto(e.photoR2Key!)} style={{ height: 28, fontSize: 10 }}>View</Btn>
          ) : (
            <span style={{ fontSize: 10, color: colors.disabled }} aria-label="No photo">—</span>
          )}
          {isOpen && (
            <Btn
              icon={Camera}
              loading={uploadingPhoto[e.productId]}
              onClick={() => triggerPhotoUpload(e.productId)}
              style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}
              title="Upload photo"
            />
          )}
        </div>
      ),
    },
  ]

  return (
    <>
    <PortalPage
      title={stocktake.refNumber}
      actions={
        <>
          {isOpen && (
            <Btn variant="primary" size="sm" icon={CheckCircle} loading={completing} disabled={entries.length === 0} onClick={() => setShowCompleteDialog(true)}>
              Complete Stocktake
            </Btn>
          )}
          {stocktake.status === 'completed' && (
            <Btn variant="danger" size="sm" icon={Ban} onClick={() => setShowVoidDialog(true)}>Void</Btn>
          )}
        </>
      }
    >
        {/* Sub-header: status */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <StatusBadge status={stocktake.status} />
        </div>

        {/* Info bar */}
        <div style={{ padding: '6px 12px', background: colors.surface, borderBottom: `1px solid ${colors.border}`, fontSize: 11, color: colors.textSecondary, flexShrink: 0 }}>
          Created by {stocktake.createdBy.fullName} · {format.datetime(stocktake.createdAt)}
          {stocktake.completedAt && ` · Completed ${format.datetime(stocktake.completedAt)}`}
          {stocktake.status === 'voided' && stocktake.voidedAt && (
            <span style={{ color: colors.danger }}>
              {' · '}Voided {format.datetime(stocktake.voidedAt)}{stocktake.voidedBy && ` by ${stocktake.voidedBy.fullName}`}
              {stocktake.voidReason && ` — Reason: ${stocktake.voidReason}`}
            </span>
          )}
          {stocktake.notes && <span style={{ marginLeft: 12, color: colors.textPrimary }}>{stocktake.notes}</span>}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {/* Summary stats */}
          {entries.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary }}>{entries.length}</p>
                <p style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>Products Counted</p>
              </div>
              <div style={{ background: variances.length > 0 ? colors.warningBg : colors.surface, border: `1px solid ${variances.length > 0 ? colors.warning : colors.border}`, borderRadius: 2, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: variances.length > 0 ? colors.warning : colors.textPrimary }}>{variances.length}</p>
                <p style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>Variances Found</p>
              </div>
            </div>
          )}

          {/* Add entry form */}
          {isOpen && (
            <div style={{ ...PANEL, marginBottom: 16 }}>
              <div style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, background: BAR_GRAD }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary }}>Add Count Entry</span>
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 12, alignItems: 'end' }}>
                  <div>
                    <Label htmlFor="add-product-select" style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary }}>Product</Label>
                    <Select value={productId} onValueChange={(v) => setProductId(v ?? '')}>
                      <SelectTrigger id="add-product-select" style={{ marginTop: 4, height: 28, fontSize: 12, width: '100%' }}>
                        <SelectValue placeholder="Select product..." />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span style={{ color: colors.textPrimary }}>
                              {p.name} ({p.code})
                              {countedIds.has(p.id) && <span style={{ color: colors.process, fontWeight: 600 }}> · Recount</span>}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="add-counted-qty" style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary }}>
                      Net Qty {productId && <span style={{ color: colors.textSecondary, fontWeight: 400 }}>({products.find((p) => p.id === productId)?.unit})</span>}
                    </Label>
                    <Input
                      id="add-counted-qty"
                      value={countedQty}
                      onChange={(e) => setCountedQty(e.target.value)}
                      placeholder="0.000"
                      style={{ marginTop: 4, height: 28, fontSize: 12, fontFamily: 'monospace' }}
                      disabled={saving}
                      aria-describedby={productId ? 'qty-unit' : undefined}
                    />
                  </div>
                  <Btn
                    icon={Scale}
                    onClick={() => setAddWeigh((p) => ({ ...p, weighMode: !p.weighMode }))}
                    style={{ width: 32, height: 32, padding: 0, justifyContent: 'center', background: addWeigh.weighMode ? colors.process : undefined, color: addWeigh.weighMode ? colors.textOnDark : undefined }}
                    title="Scale integration coming soon"
                    disabled
                  />
                </div>

                {/* Scale panel */}
                {addWeigh.weighMode && (
                  <div style={{ marginTop: 12, padding: 10, background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 2, display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <Label htmlFor="add-scale-select" style={{ fontSize: 10, color: colors.textSecondary }}>Scale</Label>
                      <Select value={addWeigh.selectedScale} onValueChange={(v) => setAddWeigh((p) => ({ ...p, selectedScale: v as '1' | '2' | '3' }))} disabled>
                        <SelectTrigger id="add-scale-select" style={{ height: 24, width: 80, fontSize: 11, marginTop: 2, opacity: 0.5 }}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Scale 1</SelectItem>
                          <SelectItem value="2">Scale 2</SelectItem>
                          <SelectItem value="3">Scale 3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="add-gross-qty" style={{ fontSize: 10, color: colors.textSecondary }}>Gross (kg)</Label>
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        <Input id="add-gross-qty" value={addWeigh.grossQty} onChange={(e) => recomputeAddNet(e.target.value, addWeigh.tareQty)} placeholder="0.000" style={{ height: 24, width: 80, fontSize: 11, fontFamily: 'monospace' }} />
                        <Btn icon={RefreshCw} onClick={handleAddWeighGross} disabled style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }} title="Scale integration coming soon" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="add-tare-qty" style={{ fontSize: 10, color: colors.textSecondary }}>Tare (kg)</Label>
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        <Input id="add-tare-qty" value={addWeigh.tareQty} onChange={(e) => recomputeAddNet(addWeigh.grossQty, e.target.value)} placeholder="0.000" style={{ height: 24, width: 80, fontSize: 11, fontFamily: 'monospace' }} />
                        <Btn icon={RefreshCw} onClick={handleAddWeighTare} disabled style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }} title="Scale integration coming soon" />
                      </div>
                    </div>
                    <div>
                      <Label id="net-result-label" style={{ fontSize: 10, color: colors.textSecondary }}>Net (kg)</Label>
                      <div aria-labelledby="net-result-label" style={{ height: 24, display: 'flex', alignItems: 'center', padding: '0 8px', background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 2, fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: colors.action, marginTop: 2, minWidth: 60 }}>
                        {countedQty || '0.000'}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <Btn variant="primary" onClick={handleAddEntryClick} loading={saving}>Save Entry</Btn>
                </div>
              </div>
            </div>
          )}

          {/* Entries table */}
          <div style={PANEL}>
            <div style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, background: BAR_GRAD }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary }}>Count Entries</span>
              <span style={{ fontSize: 10, color: colors.textSecondary, marginLeft: 8 }}>({entries.length})</span>
            </div>
            {entries.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: colors.textSecondary, fontSize: 12 }}>
                No entries yet — start counting products above
              </div>
            ) : (
              <div style={{ padding: 10 }}>
                <DataTable columns={columns} rows={entries} rowKey={(e) => e.id} />
              </div>
            )}
          </div>
        </div>
    </PortalPage>
      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoSelected} aria-label="Upload photo file" />

      {/* Complete stocktake confirmation dialog */}
      {showCompleteDialog && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowCompleteDialog(false) }}>
          <RpxDialogContent maxWidth={480}>
            <RpxDialogHeader title="Complete Stocktake?" onClose={() => setShowCompleteDialog(false)} />
            <RpxDialogBody>
            <div className="space-y-3">
              <div style={{ background: colors.warningBg, border: `1px solid ${colors.warning}`, borderRadius: 3, padding: '10px 12px', fontSize: 12, color: '#92610A' }}>
                This will apply all variance adjustments to your stock levels. This action cannot be undone.
              </div>
              {variances.length > 0 && (
                <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 3, padding: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, marginBottom: 6 }}>
                    {variances.length} variance{variances.length > 1 ? 's' : ''} will be applied to stock:
                  </p>
                  {variances.map((v) => {
                    const variance = new Decimal(v.variance)
                    return (
                      <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
                        <span style={{ color: colors.textPrimary }}>{v.product.name}</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: variance.gt(0) ? colors.action : colors.danger }}>
                          {variance.gt(0) ? '+' : ''}{Number(v.variance).toFixed(2)} {v.product.unit}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            </RpxDialogBody>
            <RpxDialogFooter>
              <Btn onClick={() => setShowCompleteDialog(false)} disabled={completing}>Cancel</Btn>
              <Btn variant="primary" loading={completing} onClick={performComplete}>Complete Stocktake</Btn>
            </RpxDialogFooter>
          </RpxDialogContent>
        </Dialog>
      )}

      {/* Re-count confirmation dialog */}
      {showRecountDialog && (
        <Dialog open onOpenChange={(o) => { if (!o) { setShowRecountDialog(false); setPendingRecount(null) } }}>
          <RpxDialogContent maxWidth={420}>
            <RpxDialogHeader title="Overwrite Previous Count?" onClose={() => { setShowRecountDialog(false); setPendingRecount(null) }} />
            <RpxDialogBody>
              <div style={{ background: colors.warningBg, border: `1px solid ${colors.warning}`, borderRadius: 3, padding: '10px 12px', fontSize: 12, color: '#92610A' }}>
                This product was already counted with quantity: <strong>{pendingRecount?.existingQty}</strong>.
                Do you want to overwrite it with the new quantity: <strong>{countedQty}</strong>?
              </div>
            </RpxDialogBody>
            <RpxDialogFooter>
              <Btn onClick={() => { setShowRecountDialog(false); setPendingRecount(null) }}>Cancel</Btn>
              <Btn variant="primary" onClick={() => { setShowRecountDialog(false); performSaveEntry() }}>Overwrite</Btn>
            </RpxDialogFooter>
          </RpxDialogContent>
        </Dialog>
      )}

      {/* Void stocktake confirmation dialog */}
      {showVoidDialog && (
        <Dialog open onOpenChange={(o) => { if (!o) { setShowVoidDialog(false); setVoidReason('') } }}>
          <RpxDialogContent maxWidth={480}>
            <RpxDialogHeader title="Void Stocktake?" onClose={() => { setShowVoidDialog(false); setVoidReason('') }} />
            <RpxDialogBody>
            <div className="space-y-3">
              <div style={{ background: colors.warningBg, border: `1px solid ${colors.warning}`, borderRadius: 3, padding: '10px 12px', fontSize: 12, color: '#92610A' }}>
                This will reverse every stock adjustment this stocktake applied. This action cannot be undone.
              </div>
              <div>
                <Label htmlFor="void-reason" style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary }}>Reason for voiding (required)</Label>
                <Textarea
                  id="void-reason"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Counted wrong products in category X, re-doing the stocktake"
                  style={{ marginTop: 4, fontSize: 12, minHeight: 64 }}
                />
                <p style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>
                  {voidReason.trim().length}/5 characters minimum
                </p>
              </div>
            </div>
            </RpxDialogBody>
            <RpxDialogFooter>
              <Btn onClick={() => { setShowVoidDialog(false); setVoidReason('') }} disabled={voiding}>Cancel</Btn>
              <Btn variant="danger" loading={voiding} disabled={voidReason.trim().length < 5} onClick={performVoid}>
                Void Stocktake
              </Btn>
            </RpxDialogFooter>
          </RpxDialogContent>
        </Dialog>
      )}
    </>
  )
}
