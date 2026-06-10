'use client'

import { useState, useRef } from 'react'
import useSWR, { mutate } from 'swr'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, CheckCircle, AlertTriangle, Scale, RefreshCw, Camera, ExternalLink } from 'lucide-react'
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

// ─── Per-entry weigh state (local UI only) ────────────────────────────────────
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
  // Manual entry count qty
  const [countedQty, setCountedQty] = useState('')
  // Add-entry scale state
  const [addWeigh, setAddWeigh] = useState<EntryWeighState>(defaultWeigh())
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)

  // Per-existing-entry weigh state (keyed by entry.id)
  const [entryWeigh, setEntryWeigh] = useState<Record<string, EntryWeighState>>({})

  // Per-entry photo uploading state (keyed by entry.productId)
  const [uploadingPhoto, setUploadingPhoto] = useState<Record<string, boolean>>({})
  const photoInputRef = useRef<HTMLInputElement>(null)
  const pendingPhotoEntryRef = useRef<string | null>(null) // productId of entry being photographed

  function getEntryWeigh(entryId: string): EntryWeighState {
    return entryWeigh[entryId] ?? defaultWeigh()
  }
  function patchEntryWeigh(entryId: string, patch: Partial<EntryWeighState>) {
    setEntryWeigh((prev) => ({ ...prev, [entryId]: { ...getEntryWeigh(entryId), ...patch } }))
  }

  if (!isManager) {
    return <div className="flex items-center justify-center h-64 text-sm text-gray-400">Access restricted to managers and administrators.</div>
  }

  // ── Scale read helper ─────────────────────────────────────────────────────

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
    const t = new Decimal(tare  || '0')
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

  // ── Re-weigh an existing entry ───────────────────────────────────────────

  async function handleReweighEntry(entry: StocktakeEntry, type: 'gross' | 'tare') {
    const ew = getEntryWeigh(entry.id)
    patchEntryWeigh(entry.id, type === 'gross' ? { weighingGross: true } : { weighingTare: true })
    try {
      const w = await readScale(ew.selectedScale)
      const newGross = type === 'gross' ? w : (ew.grossQty || entry.grossQty || '0')
      const newTare  = type === 'tare'  ? w : (ew.tareQty  || entry.tareQty  || '0')
      const net = Decimal.max(new Decimal(newGross).minus(new Decimal(newTare)), new Decimal('0'))
      patchEntryWeigh(entry.id, { grossQty: newGross, tareQty: newTare })
      toast.success(`${type === 'gross' ? 'Gross' : 'Tare'}: ${w} kg — Net: ${net.toFixed(2)} kg`)
      // Auto-save the re-weighed entry
      await saveEntry(entry.productId, net.toFixed(2), { grossQty: newGross, tareQty: newTare })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scale not responding')
    } finally {
      patchEntryWeigh(entry.id, type === 'gross' ? { weighingGross: false } : { weighingTare: false })
    }
  }

  // ── Save entry ────────────────────────────────────────────────────────────

  async function saveEntry(
    pid: string,
    qty: string,
    opts?: { grossQty?: string; tareQty?: string }
  ) {
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

  // ── Photo upload per entry ────────────────────────────────────────────────

  function triggerPhotoUpload(productId: string) {
    pendingPhotoEntryRef.current = productId
    photoInputRef.current?.click()
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const pid  = pendingPhotoEntryRef.current
    if (!file || !pid) return
    e.target.value = '' // reset for re-use

    setUploadingPhoto((prev) => ({ ...prev, [pid]: true }))
    try {
      // Upload to R2 via server proxy (no CORS required)
      const fd = new FormData()
      fd.append('context', 'stocktake_entry')
      fd.append('referenceId', id)
      fd.append('file', file)

      const uploadRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { key } = await uploadRes.json() as { key: string }

      // Save the key on the entry
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
        tareQty:  addWeigh.tareQty  || undefined,
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
  const entries  = stocktake?.entries ?? []
  const isOpen   = stocktake?.status === 'open'
  const countedIds = new Set(entries.map((e) => e.productId))
  const variances  = entries.filter((e) => new Decimal(e.variance).abs().gt(0))

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  if (!stocktake) return <div className="p-10 text-center text-gray-400">Stocktake not found</div>

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
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
          <Button onClick={handleComplete} disabled={completing || entries.length === 0} className="bg-green-600 hover:bg-green-700">
            {completing
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Completing...</>
              : <><CheckCircle className="w-4 h-4 mr-2" />Complete Stocktake</>}
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
            <p className="text-2xl font-bold text-gray-900">{products.length - countedIds.size}</p>
            <p className="text-xs text-gray-500 mt-1">Products Remaining</p>
          </div>
        </div>
      )}

      {/* Add entry form */}
      {isOpen && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Add Count Entry</h2>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_40px] gap-3 items-end">
            <div>
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
              <Label>
                Net Qty{' '}
                {productId && <span className="text-gray-400 font-normal">({products.find((p) => p.id === productId)?.unit})</span>}
              </Label>
              <Input
                value={countedQty}
                onChange={(e) => setCountedQty(e.target.value)}
                placeholder="0.000"
                className="mt-1 font-mono"
                disabled={saving}
              />
            </div>

            {/* Scale toggle for add form */}
            <div className="pb-0.5">
              <Label className="opacity-0 select-none">.</Label>
              <Button
                variant={addWeigh.weighMode ? 'default' : 'outline'}
                size="sm"
                className={`mt-1 h-9 w-9 p-0 ${addWeigh.weighMode ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                title="Toggle scale mode"
                onClick={() => setAddWeigh((p) => ({ ...p, weighMode: !p.weighMode }))}
              >
                <Scale className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Scale panel for add form */}
          {addWeigh.weighMode && (
            <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-100 flex items-end gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-gray-500">Scale</Label>
                <Select
                  value={addWeigh.selectedScale}
                  onValueChange={(v) => setAddWeigh((p) => ({ ...p, selectedScale: v as '1' | '2' | '3' }))}
                >
                  <SelectTrigger className="h-8 w-28 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Scale 1</SelectItem>
                    <SelectItem value="2">Scale 2</SelectItem>
                    <SelectItem value="3">Scale 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs text-gray-500">Gross (kg)</Label>
                <div className="flex gap-1.5">
                  <Input
                    value={addWeigh.grossQty}
                    onChange={(e) => recomputeAddNet(e.target.value, addWeigh.tareQty)}
                    placeholder="0.000"
                    className="h-8 w-24 font-mono text-sm"
                  />
                  <Button size="sm" className="h-8 px-2 bg-blue-600 hover:bg-blue-700 text-white" disabled={addWeigh.weighingGross} onClick={handleAddWeighGross}>
                    {addWeigh.weighingGross ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs text-gray-500">Tare (kg)</Label>
                <div className="flex gap-1.5">
                  <Input
                    value={addWeigh.tareQty}
                    onChange={(e) => recomputeAddNet(addWeigh.grossQty, e.target.value)}
                    placeholder="0.000"
                    className="h-8 w-24 font-mono text-sm"
                  />
                  <Button size="sm" variant="outline" className="h-8 px-2" disabled={addWeigh.weighingTare} onClick={handleAddWeighTare}>
                    {addWeigh.weighingTare ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs text-gray-500">Net (kg)</Label>
                <div className="h-8 flex items-center px-3 rounded-md border bg-white font-mono text-sm font-semibold text-green-700 min-w-[72px]">
                  {countedQty || '0.000'}
                </div>
              </div>
            </div>
          )}

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
                {['Product', 'Category', 'System Qty', 'Gross / Tare', 'Net Counted', 'Variance', 'Photo', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => {
                const variance    = new Decimal(e.variance)
                const hasVariance = variance.abs().gt(0)
                const ew          = getEntryWeigh(e.id)
                return (
                  <tr key={e.id} className={hasVariance ? 'bg-orange-50' : ''}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{e.product.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{e.product.code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[e.product.category] ?? e.product.category}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">{Number(e.systemQty).toFixed(2)} {e.product.unit}</td>
                    <td className="px-4 py-3">
                      {(e.grossQty || e.tareQty) ? (
                        <span className="font-mono text-xs text-gray-500">
                          G:{Number(e.grossQty ?? 0).toFixed(2)} T:{Number(e.tareQty ?? 0).toFixed(2)}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                      {/* Re-weigh buttons for open stocktakes */}
                      {isOpen && (
                        <div className="flex items-center gap-1 mt-1">
                          <Select
                            value={ew.selectedScale}
                            onValueChange={(v) => patchEntryWeigh(e.id, { selectedScale: v as '1' | '2' | '3' })}
                          >
                            <SelectTrigger className="h-6 w-20 text-xs px-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Scale 1</SelectItem>
                              <SelectItem value="2">Scale 2</SelectItem>
                              <SelectItem value="3">Scale 3</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-6 px-1.5 text-xs bg-blue-600 hover:bg-blue-700" disabled={ew.weighingGross} onClick={() => handleReweighEntry(e, 'gross')} title="Re-weigh gross">
                            {ew.weighingGross ? <Loader2 className="w-3 h-3 animate-spin" /> : 'G'}
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-1.5 text-xs" disabled={ew.weighingTare} onClick={() => handleReweighEntry(e, 'tare')} title="Re-weigh tare">
                            {ew.weighingTare ? <Loader2 className="w-3 h-3 animate-spin" /> : 'T'}
                          </Button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">{Number(e.countedQty).toFixed(2)} {e.product.unit}</td>
                    <td className="px-4 py-3">
                      <span className={`font-mono font-semibold ${variance.gt(0) ? 'text-green-700' : variance.lt(0) ? 'text-red-700' : 'text-gray-400'}`}>
                        {variance.gt(0) ? '+' : ''}{Number(e.variance).toFixed(2)} {e.product.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {e.photoR2Key ? (
                          <button
                            onClick={() => viewPhoto(e.photoR2Key!)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> View
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                        {isOpen && (
                          <button
                            onClick={() => triggerPhotoUpload(e.productId)}
                            disabled={uploadingPhoto[e.productId]}
                            className="ml-1 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                            title="Upload photo"
                          >
                            {uploadingPhoto[e.productId]
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Camera className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
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
      {/* Hidden file input for photo uploads */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePhotoSelected}
      />
    </div>
  )
}
