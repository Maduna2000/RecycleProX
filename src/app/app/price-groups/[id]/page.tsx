'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Star, Save, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

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

const CATEGORY_LABELS: Record<string, string> = {
  ferrous: 'Ferrous', non_ferrous: 'Non-Ferrous', copper: 'Copper',
  aluminium: 'Aluminium', plastic: 'Plastic', paper: 'Paper', e_waste: 'E-Waste', other: 'Other',
}

export default function PriceGroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: group, isLoading: groupLoading } = useSWR<PriceGroup>(`/api/price-groups/${id}`, fetcher)
  const { data: productsData } = useSWR<{ products: Product[] }>('/api/products?active=true', fetcher)

  // Local override state: productId → { buy, sell, enabled }
  const [overrides, setOverrides] = useState<Record<string, { buy: string; sell: string; enabled: boolean }>>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Initialise from group data
  useEffect(() => {
    if (!group || !productsData) return
    const init: Record<string, { buy: string; sell: string; enabled: boolean }> = {}
    const groupOverrideMap = Object.fromEntries(group.overrides.map((o) => [o.productId, o]))

    for (const p of productsData.products) {
      const existing = groupOverrideMap[p.id]
      init[p.id] = {
        buy: existing ? Number(existing.buyPrice).toFixed(2) : Number(p.defaultBuyPrice).toFixed(2),
        sell: existing ? Number(existing.sellPrice).toFixed(2) : Number(p.defaultSellPrice).toFixed(2),
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
    if (res.ok) {
      toast.success('Price overrides saved')
      mutate(`/api/price-groups/${id}`)
      setDirty(false)
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to save overrides')
    }
  }

  if (groupLoading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
  if (!group) return <div className="flex items-center justify-center h-64 text-gray-400">Price group not found</div>

  const products = productsData?.products ?? []

  // Group products by category
  const categories = Array.from(new Set(products.map((p) => p.category))).sort()

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      <div className="bg-white rounded-xl border p-6 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {group.isDefault && <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 shrink-0" />}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{group.name}</h1>
              {group.description && <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {group.isDefault && <Badge className="bg-yellow-100 text-yellow-700">Default</Badge>}
            <Badge className={group.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
              {group.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Override editor */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">Price Overrides</h2>
            <p className="text-sm text-gray-500 mt-0.5">Enable products to set custom buy/sell prices for this group</p>
          </div>
          {isManager && (
            <div className="flex gap-2">
              {dirty && (
                <Button variant="outline" size="sm" onClick={() => {
                  if (!group || !productsData) return
                  const init: Record<string, { buy: string; sell: string; enabled: boolean }> = {}
                  const groupOverrideMap = Object.fromEntries(group.overrides.map((o) => [o.productId, o]))
                  for (const p of productsData.products) {
                    const existing = groupOverrideMap[p.id]
                    init[p.id] = {
                      buy: existing ? Number(existing.buyPrice).toFixed(2) : Number(p.defaultBuyPrice).toFixed(2),
                      sell: existing ? Number(existing.sellPrice).toFixed(2) : Number(p.defaultSellPrice).toFixed(2),
                      enabled: !!existing,
                    }
                  }
                  setOverrides(init)
                  setDirty(false)
                }}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
                </Button>
              )}
              <Button className="bg-green-600 hover:bg-green-700" size="sm" onClick={onSave} disabled={saving || !dirty}>
                {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving...</> : <><Save className="w-3.5 h-3.5 mr-1.5" />Save</>}
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Override', 'Product', 'Default Buy', 'Default Sell', 'Group Buy', 'Group Sell'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {categories.map((cat) => {
                const catProducts = products.filter((p) => p.category === cat)
                return (
                  <>
                    <tr key={`cat-${cat}`} className="bg-gray-50">
                      <td colSpan={6} className="px-4 py-1.5">
                        <span className="text-xs font-semibold text-gray-500 uppercase">{CATEGORY_LABELS[cat] ?? cat}</span>
                      </td>
                    </tr>
                    {catProducts.map((p) => {
                      const ov = overrides[p.id]
                      const isEnabled = ov?.enabled ?? false
                      return (
                        <tr key={p.id} className={isEnabled ? 'bg-green-50' : ''}>
                          <td className="px-4 py-2.5">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              disabled={!isManager}
                              onChange={(e) => {
                                setOverrides((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, enabled: e.target.checked } }))
                                setDirty(true)
                              }}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-900">{p.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{p.code} · {p.unit}</p>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">R {Number(p.defaultBuyPrice).toFixed(2)}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">R {Number(p.defaultSellPrice).toFixed(2)}</td>
                          <td className="px-4 py-2.5">
                            {isEnabled ? (
                              <Input
                                value={ov?.buy ?? ''}
                                onChange={(e) => { setOverrides((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, buy: e.target.value } })); setDirty(true) }}
                                disabled={!isManager}
                                className="w-28 h-7 text-sm font-mono"
                              />
                            ) : (
                              <span className="text-xs text-gray-300 font-mono">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {isEnabled ? (
                              <Input
                                value={ov?.sell ?? ''}
                                onChange={(e) => { setOverrides((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, sell: e.target.value } })); setDirty(true) }}
                                disabled={!isManager}
                                className="w-28 h-7 text-sm font-mono"
                              />
                            ) : (
                              <span className="text-xs text-gray-300 font-mono">—</span>
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
    </div>
  )
}
