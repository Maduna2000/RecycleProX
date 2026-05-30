'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, ModalTitleBar, ModalBtn } from '@/components/ui/dialog'
import { ArrowLeft, Star, Save, Loader2, RotateCcw, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { colors } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ProductOverride = {
  id: string
  productId: string
  buyPrice: string
  sellPrice: string
  product: {
    id: string; code: string; name: string; category: string
    defaultBuyPrice: string; defaultSellPrice: string; unit: string
  }
}

type PriceGroup = {
  id: string; name: string; description?: string; isDefault: boolean; isActive: boolean
  overrides: ProductOverride[]
}

type Product = {
  id: string; code: string; name: string; category: string
  defaultBuyPrice: string; defaultSellPrice: string; unit: string
}

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 10px', height: 28,
  fontSize: 10, fontWeight: 700, color: '#6C757D',
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '0 10px', fontSize: 12, color: '#212529' }

const secBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
  padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2,
  background: '#fff', border: '1px solid #ABABAB', color: '#212529', cursor: 'pointer',
}

export default function PriceGroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: group, isLoading: groupLoading } = useSWR<PriceGroup>(`/api/price-groups/${id}`, fetcher)
  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products?active=true', fetcher)

  const [overrides, setOverrides] = useState<Record<string, { buy: string; sell: string; enabled: boolean }>>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false)

  useEffect(() => {
    if (!group || !productsData) return
    const init: Record<string, { buy: string; sell: string; enabled: boolean }> = {}
    const groupOverrideMap = Object.fromEntries(group.overrides.map((o) => [o.productId, o]))
    for (const p of productsData.products) {
      const existing = groupOverrideMap[p.id]
      init[p.id] = {
        buy:     existing ? Number(existing.buyPrice).toFixed(2)  : Number(p.defaultBuyPrice).toFixed(2),
        sell:    existing ? Number(existing.sellPrice).toFixed(2) : Number(p.defaultSellPrice).toFixed(2),
        enabled: !!existing,
      }
    }
    setOverrides(init)
    setDirty(false)
  }, [group, productsData])

  async function onSave() {
    const activeOverrides = Object.entries(overrides)
      .filter(([, v]) => v.enabled)
      .map(([productId, v]) => ({ productId, buyPrice: v.buy, sellPrice: v.sell }))
    setSaving(true)
    const res = await fetch(`/api/price-groups/${id}/overrides`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: activeOverrides }),
    })
    setSaving(false)
    if (res.ok) { toast.success('Price overrides saved'); mutate(`/api/price-groups/${id}`); setDirty(false) }
    else { const j = await res.json(); toast.error((j as { error?: string }).error ?? 'Failed to save overrides') }
  }

  function onReset() {
    if (!group || !productsData) return
    const init: Record<string, { buy: string; sell: string; enabled: boolean }> = {}
    const groupOverrideMap = Object.fromEntries(group.overrides.map((o) => [o.productId, o]))
    for (const p of productsData.products) {
      const existing = groupOverrideMap[p.id]
      init[p.id] = {
        buy:     existing ? Number(existing.buyPrice).toFixed(2)  : Number(p.defaultBuyPrice).toFixed(2),
        sell:    existing ? Number(existing.sellPrice).toFixed(2) : Number(p.defaultSellPrice).toFixed(2),
        enabled: !!existing,
      }
    }
    setOverrides(init)
    setDirty(false)
  }

  async function onCopyFromDefaults() {
    setCopying(true)
    setCopyConfirmOpen(false)
    try {
      const res = await fetch(`/api/price-groups/${id}/copy-from-defaults`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      if (res.ok) {
        const j = await res.json() as { upserted: number }
        toast.success(`Copied default prices for ${j.upserted} products`)
        mutate(`/api/price-groups/${id}`)
      } else {
        const j = await res.json() as { error?: string }
        toast.error(j.error ?? 'Failed to copy prices')
      }
    } finally { setCopying(false) }
  }

  if (groupLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, fontSize: 12, color: '#6C757D', gap: 8 }}>
      <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Loading…
    </div>
  )
  if (!group) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, fontSize: 12, color: '#6C757D' }}>
      Price group not found
    </div>
  )

  const products = productsData?.products ?? []
  const categories = Array.from(new Set(products.map((p) => p.category))).sort()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <button onClick={() => router.back()} style={secBtn}>
            <ArrowLeft style={{ width: 11, height: 11 }} /> Back
          </button>
          <div style={{ width: 1, height: 16, background: '#C0C0C0' }} />
          {group.isDefault && <Star style={{ width: 13, height: 13, color: colors.warning, fill: colors.warning, flexShrink: 0 }} />}
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1B3A6B' }}>{group.name}</span>
          {group.description && <span style={{ fontSize: 11, color: '#6C757D' }}>— {group.description}</span>}
          {group.isDefault && (
            <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: colors.warningBg, color: colors.warning }}>Default</span>
          )}
          <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, ...(group.isActive ? { background: colors.actionBg, color: colors.action } : { background: colors.neutralBg, color: colors.textSecondary }) }}>
            {group.isActive ? 'Active' : 'Inactive'}
          </span>
          <div style={{ flex: 1 }} />
          {isManager && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setCopyConfirmOpen(true)}
                disabled={copying}
                style={{ ...secBtn, opacity: copying ? 0.7 : 1, cursor: copying ? 'not-allowed' : 'pointer' }}
              >
                {copying ? <><Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> Copying…</> : <><Copy style={{ width: 11, height: 11 }} /> Copy Defaults</>}
              </button>
              {dirty && (
                <button onClick={onReset} style={secBtn}>
                  <RotateCcw style={{ width: 11, height: 11 }} /> Reset
                </button>
              )}
              <button
                onClick={onSave}
                disabled={saving || !dirty}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2, background: dirty ? '#217346' : '#ABABAB', border: `1px solid ${dirty ? '#176338' : '#9A9A9A'}`, color: '#fff', cursor: saving || !dirty ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? <><Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> Saving…</> : <><Save style={{ width: 11, height: 11 }} /> Save</>}
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
                {['Override', 'Product', 'Default Buy', 'Default Sell', 'Group Buy', 'Group Sell'].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const catProducts = products.filter((p) => p.category === cat)
                return (
                  <>
                    <tr key={`cat-${cat}`}>
                      <td colSpan={6} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F0F0F0', borderTop: '1px solid #E0E0E0', borderBottom: '1px solid #E0E0E0' }}>
                        {cat}
                      </td>
                    </tr>
                    {catProducts.map((p, i) => {
                      const ov = overrides[p.id]
                      const isEnabled = ov?.enabled ?? false
                      const rowBg = isEnabled ? '#F0FAF4' : (i % 2 === 1 ? '#FAFAFA' : '#fff')
                      return (
                        <tr key={p.id} style={{ background: rowBg, borderBottom: '1px solid #F0F0F0', height: 34 }}>
                          <td style={{ ...TD, width: 50, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              disabled={!isManager}
                              style={{ width: 12, height: 12, cursor: isManager ? 'pointer' : 'default' }}
                              onChange={(e) => {
                                setOverrides((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, enabled: e.target.checked } }))
                                setDirty(true)
                              }}
                            />
                          </td>
                          <td style={TD}>
                            <span style={{ fontWeight: 600 }}>{p.name}</span>
                            <span style={{ fontSize: 10, color: '#6C757D', fontFamily: 'monospace', marginLeft: 6 }}>{p.code} · {p.unit}</span>
                          </td>
                          <td style={{ ...TD, fontFamily: 'monospace', color: '#6C757D' }}>R {Number(p.defaultBuyPrice).toFixed(2)}</td>
                          <td style={{ ...TD, fontFamily: 'monospace', color: '#6C757D' }}>R {Number(p.defaultSellPrice).toFixed(2)}</td>
                          <td style={{ ...TD, width: 120 }}>
                            {isEnabled ? (
                              <Input
                                value={ov?.buy ?? ''}
                                onChange={(e) => { setOverrides((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, buy: e.target.value } })); setDirty(true) }}
                                disabled={!isManager}
                                className="h-6 text-xs font-mono border-[#ABABAB]"
                                style={{ width: 100 }}
                              />
                            ) : (
                              <span style={{ fontSize: 11, color: '#C0C0C0', fontFamily: 'monospace' }}>—</span>
                            )}
                          </td>
                          <td style={{ ...TD, width: 120 }}>
                            {isEnabled ? (
                              <Input
                                value={ov?.sell ?? ''}
                                onChange={(e) => { setOverrides((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, sell: e.target.value } })); setDirty(true) }}
                                disabled={!isManager}
                                className="h-6 text-xs font-mono border-[#ABABAB]"
                                style={{ width: 100 }}
                              />
                            ) : (
                              <span style={{ fontSize: 11, color: '#C0C0C0', fontFamily: 'monospace' }}>—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Copy Defaults Confirmation */}
      {copyConfirmOpen && (
        <Dialog open onOpenChange={(o) => { if (!o) setCopyConfirmOpen(false) }}>
          <DialogContent className="sm:max-w-md" showCloseButton={false}>
            <ModalTitleBar title="Copy Default Prices?" onClose={() => setCopyConfirmOpen(false)} />
            <div style={{ padding: '12px 16px 16px' }}>
              <p style={{ fontSize: 13, color: '#212529', lineHeight: 1.6 }}>
                This will overwrite all existing price overrides in <strong>{group.name}</strong> with the current default prices for every active product. This cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <ModalBtn variant="outline" onClick={() => setCopyConfirmOpen(false)} disabled={copying}>Cancel</ModalBtn>
                <ModalBtn variant="primary" onClick={onCopyFromDefaults} disabled={copying}>
                  {copying ? 'Copying…' : 'Yes, Copy Defaults'}
                </ModalBtn>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
