'use client'

import { useState, useRef } from 'react'
import useSWR, { mutate } from 'swr'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, CheckCircle, AlertTriangle, Scale, RefreshCw, Camera, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { format } from '@/lib/utils/format'
import { colors } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Windows aesthetic styles
const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 8px', height: 28,
  fontSize: 10, fontWeight: 700, color: colors.textSecondary,
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
  background: 'linear-gradient(180deg,#F5F5F5 0%,#ECECEC 100%)',
}
const TD: React.CSSProperties = { padding: '8px', fontSize: 12, color: colors.textPrimary }

const secBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
  padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2,
  background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary, cursor: 'pointer',
}
const priBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
  padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2,
  background: colors.action, border: `1px solid ${colors.actionHover}`, color: colors.textOnDark, cursor: 'pointer',
}
const scaleBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
  padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2,
  background: colors.process, border: `1px solid ${colors.processHover}`, color: colors.textOnDark, cursor: 'pointer',
}

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

function StatusBadge({ status }: { status: 'open' | 'completed' }) {
  const style = status === 'open'
    ? { background: colors.actionBg, color: colors.action, border: `1px solid ${colors.action}` }
    : { background: colors.neutralBg, color: colors.textSecondary, border: `1px solid ${colors.border}` }
  return (
    <span style={{ ...style, padding: '2px 6px', borderRadius: 2, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>
      {status === 'open' ? 'Open' : 'Completed'}
    </span>
  )
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
  const { data: productsData } = useSWR<{ products: Product[] }>(
    isManager ? '/api/products?active=true' : null,
    fetcher
  )

  const [productId, setProductId] = useState('')
  const [countedQty, setCountedQty] = useState('')
  const [addWeigh, setAddWeigh] = useState<EntryWeighState>(defaultWeigh())
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [entryWeigh, setEntryWeigh] = useState<Record<string, EntryWeighState>>({})
  const [uploadingPhoto, setUploadingPhoto] = useState<Record<string, boolean>>({})
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

  async function readScale(scaleNumber: '1' | '2' | '3'): Promise<string> {
    const res = await fetch(`/api/scales/${scaleNumber}/read`)
    if (!res.ok) {
      const j = await res.json() as { error?: string }
      throw new Error(j.error ?? 'Scale error')
    }
    const j = await res.json() as { weight: string }
    return j.weight
  }

  function recomputeAddNet(gross: string, tare: string) {
    const g = new Decimal(gross || '0')
    const t = new Decimal(tare || '0')
    const net = Decimal.max(g.minus(t), new Decimal('0'))
    setCountedQty(net.toFixed(2))
    setAddWeigh((prev) => ({ ...prev, grossQty: gross, tareQty: tare }))
  }

  async function handleAddWeighGross() {
    setAddWeigh((p) => ({ ...p, weighingGross: true }))
    try {
      const w = await readScale(addWeigh.selectedScale)
      recomputeAddNet(w, addWeigh.tareQty)
      toast.success(`Gross: ${w} kg`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scale not responding')
    } finally {
      setAddWeigh((p) => ({ ...p, weighingGross: false }))
    }
  }

  async function handleAddWeighTare() {
    setAddWeigh((p) => ({ ...p, weighingTare: true }))
    try {
      const w = await readScale(addWeigh.selectedScale)
      recomputeAddNet(addWeigh.grossQty, w)
      toast.success(`Tare: ${w} kg`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scale not responding')
    } finally {
      setAddWeigh((p) => ({ ...p, weighingTare: false }))
    }
  }

  async function handleReweighEntry(entry: StocktakeEntry, type: 'gross' | 'tare') {
    const ew = getEntryWeigh(entry.id)
    patchEntryWeigh(entry.id, type === 'gross' ? { weighingGross: true } : { weighingTare: true })
    try {
      const w = await readScale(ew.selectedScale)
      const newGross = type === 'gross' ? w : (ew.grossQty || entry.grossQty || '0')
      const newTare = type === 'tare' ? w : (ew.tareQty || entry.tareQty || '0')
      const net = Decimal.max(new Decimal(newGross).minus(new Decimal(newTare)), new Decimal('0'))
      patchEntryWeigh(entry.id, { grossQty: newGross, tareQty: newTare })
      toast.success(`${type === 'gross' ? 'Gross' : 'Tare'}: ${w} kg — Net: ${net.toFixed(2)} kg`)
      await saveEntry(entry.productId, net.toFixed(2), { grossQty: newGross, tareQty: newTare })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scale not responding')
    } finally {
      patchEntryWeigh(entry.id, type === 'gross' ? { weighingGross: false } : { weighingTare: false })
    }
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

  async function handleAddEntry() {
    if (!productId) { toast.error('Select a product'); return }
    if (!countedQty || parseFloat(countedQty) < 0) { toast.error('Enter a valid quantity (0 or more)'); return }
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save entry')
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete() {
    if (!confirm('Mark this stocktake as completed? This cannot be undone.')) return
    setCompleting(true)
    const res = await fetch(`/api/stocktake/${id}`, { method: 'POST' })
    setCompleting(false)
    if (res.ok) { toast.success('Stocktake completed'); mutate(`/api/stocktake/${id}`) }
    else { const j = await res.json() as { error?: string }; toast.error(j.error ?? 'Failed to complete') }
  }

  const products = productsData?.products ?? []
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.primary, fontFamily: 'monospace' }}>{stocktake.refNumber}</span>
          <StatusBadge status={stocktake.status} />
          <div style={{ flex: 1 }} />
          {isOpen && (
            <button onClick={handleComplete} disabled={completing || entries.length === 0} style={{ ...priBtn, opacity: (completing || entries.length === 0) ? 0.5 : 1 }}>
              {completing
                ? <><Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} /> Completing...</>
                : <><CheckCircle style={{ width: 11, height: 11 }} /> Complete Stocktake</>}
            </button>
          )}
        </div>

        {/* Info bar */}
        <div style={{ padding: '6px 12px', background: colors.surface, borderBottom: `1px solid ${colors.border}`, fontSize: 11, color: colors.textSecondary, flexShrink: 0 }}>
          Created by {stocktake.createdBy.fullName} · {format.datetime(stocktake.createdAt)}
          {stocktake.completedAt && ` · Completed ${format.datetime(stocktake.completedAt)}`}
          {stocktake.notes && <span style={{ marginLeft: 12, color: colors.textPrimary }}>{stocktake.notes}</span>}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {/* Summary stats */}
          {entries.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary }}>{entries.length}</p>
                <p style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>Products Counted</p>
              </div>
              <div style={{ background: variances.length > 0 ? colors.warningBg : colors.surface, border: `1px solid ${variances.length > 0 ? colors.warning : colors.border}`, borderRadius: 2, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: variances.length > 0 ? colors.warning : colors.textPrimary }}>{variances.length}</p>
                <p style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>Variances Found</p>
              </div>
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 2, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary }}>{products.length - countedIds.size}</p>
                <p style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>Products Remaining</p>
              </div>
            </div>
          )}

          {/* Add entry form */}
          {isOpen && (
            <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary }}>Add Count Entry</span>
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 12, alignItems: 'end' }}>
                  <div>
                    <Label style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary }}>Product</Label>
                    <Select value={productId} onValueChange={(v) => setProductId(v ?? '')}>
                      <SelectTrigger style={{ marginTop: 4, height: 28, fontSize: 12 }}>
                        <SelectValue placeholder="Select product..." />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span style={{ color: countedIds.has(p.id) ? colors.textSecondary : colors.textPrimary }}>
                              {p.name} ({p.code}){countedIds.has(p.id) ? ' ✓' : ''}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary }}>
                      Net Qty {productId && <span style={{ color: colors.textSecondary, fontWeight: 400 }}>({products.find((p) => p.id === productId)?.unit})</span>}
                    </Label>
                    <Input
                      value={countedQty}
                      onChange={(e) => setCountedQty(e.target.value)}
                      placeholder="0.000"
                      style={{ marginTop: 4, height: 28, fontSize: 12, fontFamily: 'monospace' }}
                      disabled={saving}
                    />
                  </div>
                  <button
                    onClick={() => setAddWeigh((p) => ({ ...p, weighMode: !p.weighMode }))}
                    style={{ ...scaleBtn, background: addWeigh.weighMode ? colors.process : colors.surface, color: addWeigh.weighMode ? colors.textOnDark : colors.textPrimary, border: `1px solid ${addWeigh.weighMode ? colors.processHover : colors.border}`, width: 28, padding: 0, justifyContent: 'center' }}
                    title="Toggle scale mode"
                  >
                    <Scale style={{ width: 12, height: 12 }} />
                  </button>
                </div>

                {/* Scale panel */}
                {addWeigh.weighMode && (
                  <div style={{ marginTop: 12, padding: 10, background: colors.processBg, border: `1px solid ${colors.process}`, borderRadius: 2, display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <Label style={{ fontSize: 10, color: colors.textSecondary }}>Scale</Label>
                      <Select value={addWeigh.selectedScale} onValueChange={(v) => setAddWeigh((p) => ({ ...p, selectedScale: v as '1' | '2' | '3' }))}>
                        <SelectTrigger style={{ height: 24, width: 80, fontSize: 11, marginTop: 2 }}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Scale 1</SelectItem>
                          <SelectItem value="2">Scale 2</SelectItem>
                          <SelectItem value="3">Scale 3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label style={{ fontSize: 10, color: colors.textSecondary }}>Gross (kg)</Label>
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        <Input value={addWeigh.grossQty} onChange={(e) => recomputeAddNet(e.target.value, addWeigh.tareQty)} placeholder="0.000" style={{ height: 24, width: 80, fontSize: 11, fontFamily: 'monospace' }} />
                        <button onClick={handleAddWeighGross} disabled={addWeigh.weighingGross} style={{ ...scaleBtn, width: 24, padding: 0, justifyContent: 'center', opacity: addWeigh.weighingGross ? 0.5 : 1 }}>
                          {addWeigh.weighingGross ? <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> : <RefreshCw style={{ width: 10, height: 10 }} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label style={{ fontSize: 10, color: colors.textSecondary }}>Tare (kg)</Label>
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        <Input value={addWeigh.tareQty} onChange={(e) => recomputeAddNet(addWeigh.grossQty, e.target.value)} placeholder="0.000" style={{ height: 24, width: 80, fontSize: 11, fontFamily: 'monospace' }} />
                        <button onClick={handleAddWeighTare} disabled={addWeigh.weighingTare} style={{ ...secBtn, width: 24, padding: 0, justifyContent: 'center', opacity: addWeigh.weighingTare ? 0.5 : 1 }}>
                          {addWeigh.weighingTare ? <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> : <RefreshCw style={{ width: 10, height: 10 }} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label style={{ fontSize: 10, color: colors.textSecondary }}>Net (kg)</Label>
                      <div style={{ height: 24, display: 'flex', alignItems: 'center', padding: '0 8px', background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 2, fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: colors.action, marginTop: 2, minWidth: 60 }}>
                        {countedQty || '0.000'}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={handleAddEntry} disabled={saving} style={{ ...priBtn, opacity: saving ? 0.5 : 1 }}>
                    {saving ? <><Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} /> Saving...</> : 'Save Entry'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Entries table */}
          <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary }}>Count Entries</span>
              <span style={{ fontSize: 10, color: colors.textSecondary, marginLeft: 8 }}>({entries.length})</span>
            </div>
            {entries.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: colors.textSecondary, fontSize: 12 }}>
                No entries yet — start counting products above
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <th style={TH}>Product</th>
                    <th style={TH}>Category</th>
                    <th style={TH}>System Qty</th>
                    <th style={TH}>Gross / Tare</th>
                    <th style={TH}>Net Counted</th>
                    <th style={TH}>Variance</th>
                    <th style={TH}>Photo</th>
                    <th style={{ ...TH, width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => {
                    const variance = new Decimal(e.variance)
                    const hasVariance = variance.abs().gt(0)
                    const ew = getEntryWeigh(e.id)
                    return (
                      <tr key={e.id} style={{ borderBottom: i < entries.length - 1 ? `1px solid ${colors.rowDivider}` : undefined, background: hasVariance ? colors.warningBg : undefined }}>
                        <td style={TD}>
                          <p style={{ fontWeight: 500, color: colors.textPrimary }}>{e.product.name}</p>
                          <p style={{ fontSize: 10, fontFamily: 'monospace', color: colors.textSecondary }}>{e.product.code}</p>
                        </td>
                        <td style={TD}>
                          <span style={{ padding: '2px 6px', borderRadius: 2, fontSize: 10, background: colors.neutralBg, color: colors.textSecondary }}>
                            {CATEGORY_LABELS[e.product.category] ?? e.product.category}
                          </span>
                        </td>
                        <td style={{ ...TD, fontFamily: 'monospace' }}>{Number(e.systemQty).toFixed(2)} {e.product.unit}</td>
                        <td style={TD}>
                          {(e.grossQty || e.tareQty) ? (
                            <span style={{ fontFamily: 'monospace', fontSize: 10, color: colors.textSecondary }}>
                              G:{Number(e.grossQty ?? 0).toFixed(2)} T:{Number(e.tareQty ?? 0).toFixed(2)}
                            </span>
                          ) : <span style={{ color: colors.disabled }}>—</span>}
                          {isOpen && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Select value={ew.selectedScale} onValueChange={(v) => patchEntryWeigh(e.id, { selectedScale: v as '1' | '2' | '3' })}>
                                <SelectTrigger style={{ height: 20, width: 60, fontSize: 10, padding: '0 4px' }}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">Scale 1</SelectItem>
                                  <SelectItem value="2">Scale 2</SelectItem>
                                  <SelectItem value="3">Scale 3</SelectItem>
                                </SelectContent>
                              </Select>
                              <button onClick={() => handleReweighEntry(e, 'gross')} disabled={ew.weighingGross} style={{ ...scaleBtn, height: 20, padding: '0 4px', fontSize: 10, opacity: ew.weighingGross ? 0.5 : 1 }} title="Re-weigh gross">
                                {ew.weighingGross ? <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> : 'G'}
                              </button>
                              <button onClick={() => handleReweighEntry(e, 'tare')} disabled={ew.weighingTare} style={{ ...secBtn, height: 20, padding: '0 4px', fontSize: 10, opacity: ew.weighingTare ? 0.5 : 1 }} title="Re-weigh tare">
                                {ew.weighingTare ? <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> : 'T'}
                              </button>
                            </div>
                          )}
                        </td>
                        <td style={{ ...TD, fontFamily: 'monospace' }}>{Number(e.countedQty).toFixed(2)} {e.product.unit}</td>
                        <td style={TD}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: variance.gt(0) ? colors.action : variance.lt(0) ? colors.danger : colors.textSecondary }}>
                            {variance.gt(0) ? '+' : ''}{Number(e.variance).toFixed(2)} {e.product.unit}
                          </span>
                        </td>
                        <td style={TD}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {e.photoR2Key ? (
                              <button onClick={() => viewPhoto(e.photoR2Key!)} style={{ ...secBtn, height: 20, fontSize: 10 }}>
                                <ExternalLink style={{ width: 10, height: 10 }} /> View
                              </button>
                            ) : (
                              <span style={{ fontSize: 10, color: colors.disabled }}>—</span>
                            )}
                            {isOpen && (
                              <button
                                onClick={() => triggerPhotoUpload(e.productId)}
                                disabled={uploadingPhoto[e.productId]}
                                style={{ ...secBtn, width: 20, height: 20, padding: 0, justifyContent: 'center', opacity: uploadingPhoto[e.productId] ? 0.5 : 1 }}
                                title="Upload photo"
                              >
                                {uploadingPhoto[e.productId]
                                  ? <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} />
                                  : <Camera style={{ width: 10, height: 10 }} />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={TD}>
                          {hasVariance && <AlertTriangle style={{ width: 14, height: 14, color: colors.warning }} />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoSelected} />
    </div>
  )
}
