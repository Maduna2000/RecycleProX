'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { Star, ExternalLink, Pencil, Trash2, Save, RotateCcw, Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreatePriceGroupSchema, type CreatePriceGroupInput, type CreatePriceGroupFormInput } from '@/lib/schemas/product'
import { useSession } from 'next-auth/react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { colors } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import { useOfflineLookup } from '@/hooks/useOfflineLookup'
import {
  TH, TD, HEADER_GRAD,
  Btn, PortalPage, winBevel,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'
import { DataTable, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'


type PriceGroup = {
  id: string; name: string; description?: string
  isDefault: boolean; isActive: boolean
  _count: { customers: number; overrides: number }
}

export default function PriceGroupsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const { confirm } = useConfirm()
  const [createOpen, setCreateOpen] = useState(false)
  const [editGroup, setEditGroup] = useState<PriceGroup | null>(null)
  const [manageGroupId, setManageGroupId] = useState<string | null>(null)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  // Toolbar "Add Price Group" deep-link (?create=1)
  useEffect(() => {
    if (searchParams.get('create') === '1' && isManager) {
      setCreateOpen(true)
      router.replace('/app/price-groups')
    }
  }, [searchParams, isManager, router])

  const { data, isLoading, error } = useSWR<{ groups: PriceGroup[] }>('/api/price-groups', fetcher)
  const groups = data?.groups ?? []

  async function handleDelete(group: PriceGroup) {
    const confirmed = await confirm({
      title: 'Delete Price Group',
      message: `Permanently delete "${group.name}"? Its price overrides will be removed. This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    })
    if (!confirmed) return

    const res = await fetch(`/api/price-groups/${group.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Price group deleted'); mutate('/api/price-groups') }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to delete price group') }
  }

  const columns: Column<PriceGroup>[] = [
    {
      key: 'name', header: 'Name',
      render: (g) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          {g.isDefault && <Star style={{ width: 12, height: 12, color: colors.warning, fill: colors.warning, flexShrink: 0 }} />}
          {g.name}
        </div>
      ),
    },
    { key: 'description', header: 'Description', render: (g) => <span style={{ color: '#6C757D' }}>{g.description ?? '—'}</span> },
    { key: 'customers', header: 'Customers', width: '100px', render: (g) => <span style={{ color: '#6C757D' }}>{g._count.customers}</span> },
    { key: 'overrides', header: 'Price Overrides', width: '120px', render: (g) => <span style={{ color: '#6C757D' }}>{g._count.overrides}</span> },
    {
      key: 'default', header: 'Default', width: '90px',
      render: (g) => g.isDefault
        ? <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: colors.warningBg, color: colors.warning }}>Default</span>
        : null,
    },
    { key: 'status', header: 'Status', width: '90px', render: (g) => <StatusBadge status={g.isActive ? 'active' : 'inactive'} /> },
  ]

  const rowActions: RowAction<PriceGroup>[] = [
    { label: 'Open / Manage', icon: ExternalLink, onClick: (g) => setManageGroupId(g.id) },
    { label: 'Edit', icon: Pencil, hidden: () => !isManager, onClick: (g) => setEditGroup(g) },
    {
      label: 'Delete', icon: Trash2, danger: true, hidden: () => !isManager,
      onClick: (g) => {
        if (g.isDefault) { toast.error('Set another group as default before deleting'); return }
        handleDelete(g)
      },
    },
  ]

  return (
    // maxWidth matches src/lib/pageWidthCaps.ts, which PageTitleBar reads to
    // cap/border itself to match — keeps the unbounded Name/Description
    // columns from stretching to fill the whole window.
    <PortalPage title={`Price Groups (${groups.length})`} maxWidth={900}>
        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, padding: 10 }}>
          <DataTable
            columns={columns}
            rows={groups}
            rowKey={(g) => g.id}
            rowActions={rowActions}
            onRowClick={(g) => setManageGroupId(g.id)}
            loading={isLoading}
            error={error}
            emptyMessage="No price groups created yet"
          />
        </div>

      {createOpen && (
        <CreatePriceGroupModal
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { mutate('/api/price-groups'); setCreateOpen(false) }}
        />
      )}

      {editGroup && (
        <EditPriceGroupModal
          group={editGroup}
          onClose={() => setEditGroup(null)}
          onSuccess={() => { mutate('/api/price-groups'); setEditGroup(null) }}
        />
      )}

      {manageGroupId && (
        <ManagePriceGroupModal
          groupId={manageGroupId}
          onClose={() => setManageGroupId(null)}
          onChanged={() => mutate('/api/price-groups')}
        />
      )}
    </PortalPage>
  )
}

function CreatePriceGroupModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<CreatePriceGroupFormInput, unknown, CreatePriceGroupInput>({
    resolver: zodResolver(CreatePriceGroupSchema),
    defaultValues: { isDefault: false },
  })

  async function onSubmit(data: CreatePriceGroupInput) {
    setLoading(true)
    const res = await fetch('/api/price-groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setLoading(false)
    if (res.ok) { toast.success('Price group created'); onSuccess() }
    else if (res.status === 409) toast.error('A group with that name already exists')
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to create group') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="New Price Group" onClose={onClose} />
        <form id="create-price-group-form" onSubmit={handleSubmit(onSubmit)}>
        <RpxDialogBody>
          <div className="space-y-4">
          <div>
            <Label style={{ color: colors.textPrimary }}>Group Name</Label>
            <Input {...register('name')} className="mt-1 border-rpx-border" placeholder="e.g. Platinum Dealer" disabled={loading} />
            {errors.name && <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.name.message}</p>}
          </div>
          <div>
            <Label style={{ color: colors.textPrimary }}>Description <span className="font-normal" style={{ color: colors.textSecondary }}>(optional)</span></Label>
            <Input {...register('description')} className="mt-1 border-rpx-border" disabled={loading} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.textPrimary }}>
            <input type="checkbox" onChange={(e) => setValue('isDefault', e.target.checked)} className="rounded" />
            Set as default price group
          </label>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" form="create-price-group-form" loading={loading}>Create Group</Btn>
        </RpxDialogFooter>
        </form>
      </RpxDialogContent>
    </Dialog>
  )
}

function EditPriceGroupModal({ group, onClose, onSuccess }: { group: PriceGroup; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<CreatePriceGroupFormInput, unknown, CreatePriceGroupInput>({
    resolver: zodResolver(CreatePriceGroupSchema),
    defaultValues: { name: group.name, description: group.description ?? '', isDefault: group.isDefault },
  })

  async function onSubmit(data: CreatePriceGroupInput) {
    setLoading(true)
    const res = await fetch(`/api/price-groups/${group.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setLoading(false)
    if (res.ok) { toast.success('Price group updated'); onSuccess() }
    else if (res.status === 409) toast.error('A group with that name already exists')
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to update group') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Edit Price Group" onClose={onClose} />
        <form id="edit-price-group-form" onSubmit={handleSubmit(onSubmit)}>
        <RpxDialogBody>
          <div className="space-y-4">
          <div>
            <Label style={{ color: colors.textPrimary }}>Group Name</Label>
            <Input {...register('name')} className="mt-1 border-rpx-border" placeholder="e.g. Platinum Dealer" disabled={loading} />
            {errors.name && <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.name.message}</p>}
          </div>
          <div>
            <Label style={{ color: colors.textPrimary }}>Description <span className="font-normal" style={{ color: colors.textSecondary }}>(optional)</span></Label>
            <Input {...register('description')} className="mt-1 border-rpx-border" disabled={loading} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.textPrimary }}>
            <input type="checkbox" defaultChecked={group.isDefault} onChange={(e) => setValue('isDefault', e.target.checked)} className="rounded" />
            Set as default price group
          </label>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" form="edit-price-group-form" loading={loading}>Save Changes</Btn>
        </RpxDialogFooter>
        </form>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Manage Price Group (Open / Manage) — a popup instead of a full page ──────

type ProductOverride = {
  id: string
  productId: string
  buyPrice: string
  sellPrice: string
}

type PriceGroupDetail = {
  id: string; name: string; description?: string; isDefault: boolean; isActive: boolean
  overrides: ProductOverride[]
}

type ManageProduct = {
  id: string; code: string; name: string; category: string
  defaultBuyPrice: string; defaultSellPrice: string; unit: string
}

function ManagePriceGroupModal({ groupId, onClose, onChanged }: {
  groupId: string; onClose: () => void; onChanged: () => void
}) {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data: group, isLoading: groupLoading } = useSWR<PriceGroupDetail>(`/api/price-groups/${groupId}`, fetcher)
  // Fetched via getActiveProducts (same as Purchases/Sales/the price-list
  // editor/stocktake) rather than a plain fetcher — SWR's cache is keyed on
  // the URL alone, shared app-wide regardless of which fetcher populates it;
  // a plain fetcher here would hand other pages reading this same key the
  // raw { products: [...] } wrapper where they expect the unwrapped array.
  const { getActiveProducts } = useOfflineLookup()
  const { data: products } = useSWR<ManageProduct[]>('/api/products?active=true', () => getActiveProducts())

  const [overrides, setOverrides] = useState<Record<string, { buy: string; sell: string; enabled: boolean }>>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false)

  useEffect(() => {
    if (!group || !products) return
    const init: Record<string, { buy: string; sell: string; enabled: boolean }> = {}
    const groupOverrideMap = Object.fromEntries(group.overrides.map((o) => [o.productId, o]))
    for (const p of products) {
      const existing = groupOverrideMap[p.id]
      init[p.id] = {
        buy:     existing ? Number(existing.buyPrice).toFixed(2)  : Number(p.defaultBuyPrice).toFixed(2),
        sell:    existing ? Number(existing.sellPrice).toFixed(2) : Number(p.defaultSellPrice).toFixed(2),
        enabled: !!existing,
      }
    }
    setOverrides(init)
    setDirty(false)
  }, [group, products])

  async function onSave() {
    const activeOverrides = Object.entries(overrides)
      .filter(([, v]) => v.enabled)
      .map(([productId, v]) => ({ productId, buyPrice: v.buy, sellPrice: v.sell }))
    setSaving(true)
    const res = await fetch(`/api/price-groups/${groupId}/overrides`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: activeOverrides }),
    })
    setSaving(false)
    if (res.ok) { toast.success('Price overrides saved'); mutate(`/api/price-groups/${groupId}`); setDirty(false); onChanged() }
    else { const j = await res.json(); toast.error((j as { error?: string }).error ?? 'Failed to save overrides') }
  }

  function onReset() {
    if (!group || !products) return
    const init: Record<string, { buy: string; sell: string; enabled: boolean }> = {}
    const groupOverrideMap = Object.fromEntries(group.overrides.map((o) => [o.productId, o]))
    for (const p of products) {
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
      const res = await fetch(`/api/price-groups/${groupId}/copy-from-defaults`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      if (res.ok) {
        const j = await res.json() as { upserted: number }
        toast.success(`Copied default prices for ${j.upserted} products`)
        mutate(`/api/price-groups/${groupId}`)
      } else {
        const j = await res.json() as { error?: string }
        toast.error(j.error ?? 'Failed to copy prices')
      }
    } finally { setCopying(false) }
  }

  const categories = Array.from(new Set((products ?? []).map((p) => p.category))).sort()

  return (
    <>
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={960} style={{ height: '82vh' }}>
        <RpxDialogHeader title={group?.name ?? (groupLoading ? 'Loading…' : 'Price Group')} onClose={onClose} />

        {groupLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontSize: 12, color: '#6C757D', gap: 8 }}>
            <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Loading…
          </div>
        ) : !group ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontSize: 12, color: '#6C757D' }}>
            Price group not found
          </div>
        ) : (
          <>
            {/* Status + actions — merged into one row, actions far right */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '4px 8px', borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {group.isDefault && <Star style={{ width: 12, height: 12, color: colors.warning, fill: colors.warning, flexShrink: 0 }} />}
                {group.description && <span style={{ fontSize: 11, color: '#6C757D' }}>{group.description}</span>}
                {group.isDefault && (
                  <span style={{ display: 'inline-flex', padding: '0px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: colors.warningBg, color: colors.warning }}>Default</span>
                )}
                <span style={{ display: 'inline-flex', padding: '0px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600, ...(group.isActive ? { background: colors.actionBg, color: colors.action } : { background: colors.neutralBg, color: colors.textSecondary }) }}>
                  {group.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {isManager && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Btn size="sm" icon={Copy} loading={copying} onClick={() => setCopyConfirmOpen(true)}>Copy Defaults</Btn>
                  {dirty && <Btn size="sm" icon={RotateCcw} onClick={onReset}>Reset</Btn>}
                  {dirty && <Btn size="sm" variant="primary" icon={Save} loading={saving} onClick={onSave}>Save</Btn>}
                </div>
              )}
            </div>

            {/* Table */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
                    {['Override', 'Product', 'Default Buy', 'Default Sell', 'Group Buy', 'Group Sell'].map((h) => (
                      <th key={h} style={{ ...TH, height: 24 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => {
                    const catProducts = (products ?? []).filter((p) => p.category === cat)
                    return (
                      <>
                        <tr key={`cat-${cat}`}>
                          <td colSpan={6} style={{ padding: '1px 8px', fontSize: 10, fontWeight: 700, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F0F0F0', borderTop: '1px solid #E0E0E0', borderBottom: '1px solid #E0E0E0' }}>
                            {cat}
                          </td>
                        </tr>
                        {catProducts.map((p, i) => {
                          const ov = overrides[p.id]
                          const isEnabled = ov?.enabled ?? false
                          const rowBg = isEnabled ? '#F0FAF4' : (i % 2 === 1 ? '#FAFAFA' : '#fff')
                          return (
                            <tr key={p.id} style={{ background: rowBg, borderBottom: '1px solid #F0F0F0', height: 26 }}>
                              <td style={{ ...TD, padding: '1px 8px', width: 50, textAlign: 'center' }}>
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
                              <td style={{ ...TD, padding: '1px 8px' }}>
                                <span style={{ fontWeight: 600 }}>{p.name}</span>
                                <span style={{ fontSize: 10, color: '#6C757D', fontFamily: 'monospace', marginLeft: 6 }}>{p.code} · {p.unit}</span>
                              </td>
                              <td style={{ ...TD, padding: '1px 8px', fontFamily: 'monospace', color: '#6C757D' }}>R {Number(p.defaultBuyPrice).toFixed(2)}</td>
                              <td style={{ ...TD, padding: '1px 8px', fontFamily: 'monospace', color: '#6C757D' }}>R {Number(p.defaultSellPrice).toFixed(2)}</td>
                              <td style={{ ...TD, padding: '1px 8px', width: 120 }}>
                                {isEnabled ? (
                                  <Input
                                    value={ov?.buy ?? ''}
                                    onChange={(e) => { setOverrides((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, buy: e.target.value } })); setDirty(true) }}
                                    disabled={!isManager}
                                    className="h-5 text-xs font-mono"
                                    style={{ width: 100, ...winBevel(true) }}
                                  />
                                ) : (
                                  <span style={{ fontSize: 11, color: '#C0C0C0', fontFamily: 'monospace' }}>—</span>
                                )}
                              </td>
                              <td style={{ ...TD, padding: '1px 8px', width: 120 }}>
                                {isEnabled ? (
                                  <Input
                                    value={ov?.sell ?? ''}
                                    onChange={(e) => { setOverrides((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, sell: e.target.value } })); setDirty(true) }}
                                    disabled={!isManager}
                                    className="h-5 text-xs font-mono"
                                    style={{ width: 100, ...winBevel(true) }}
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
          </>
        )}
      </RpxDialogContent>
    </Dialog>

    {/* Copy Defaults Confirmation */}
    {copyConfirmOpen && group && (
      <Dialog open onOpenChange={(o) => { if (!o) setCopyConfirmOpen(false) }}>
        <RpxDialogContent maxWidth={440}>
          <RpxDialogHeader title="Copy Default Prices?" onClose={() => setCopyConfirmOpen(false)} />
          <RpxDialogBody>
            <p style={{ fontSize: 13, color: '#212529', lineHeight: 1.6, margin: 0 }}>
              This will overwrite all existing price overrides in <strong>{group.name}</strong> with the current default prices for every active product. This cannot be undone.
            </p>
          </RpxDialogBody>
          <RpxDialogFooter>
            <Btn onClick={() => setCopyConfirmOpen(false)} disabled={copying}>Cancel</Btn>
            <Btn variant="primary" loading={copying} onClick={onCopyFromDefaults}>
              Yes, Copy Defaults
            </Btn>
          </RpxDialogFooter>
        </RpxDialogContent>
      </Dialog>
    )}
    </>
  )
}
