'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { Plus, Star, MoreVertical, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreatePriceGroupSchema, type CreatePriceGroupInput, type CreatePriceGroupFormInput } from '@/lib/schemas/product'
import { useSession } from 'next-auth/react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { colors } from '@/lib/design-tokens'
import {
  TH, TD, HEADER_GRAD,
  Btn, PortalPage, EmptyHint,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type PriceGroup = {
  id: string; name: string; description?: string
  isDefault: boolean; isActive: boolean
  _count: { customers: number; overrides: number }
}

export default function PriceGroupsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const { confirm } = useConfirm()
  const [createOpen, setCreateOpen] = useState(false)
  const [editGroup, setEditGroup] = useState<PriceGroup | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data } = useSWR<{ groups: PriceGroup[] }>('/api/price-groups', fetcher)
  const groups = data?.groups ?? []

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, groupId: string) {
    e.stopPropagation()
    if (menuOpenId === groupId) { setMenuOpenId(null); setMenuPos(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right })
    setMenuOpenId(groupId)
  }

  function closeMenu() { setMenuOpenId(null); setMenuPos(null) }

  async function handleDelete(group: PriceGroup) {
    closeMenu()
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

  return (
    <PortalPage
      title={`Price Groups (${groups.length})`}
      actions={isManager ? <Btn variant="primary" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>Add Price Group</Btn> : undefined}
    >
        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {groups.length === 0 ? (
            <EmptyHint text="No price groups created yet" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
                  {['Name', 'Description', 'Customers', 'Price Overrides', 'Default', 'Status', ''].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => (
                  <tr
                    key={g.id}
                    onClick={() => router.push(`/app/price-groups/${g.id}`)}
                    style={{ background: i % 2 === 1 ? '#FAFAFA' : '#fff', borderBottom: '1px solid #F0F0F0', height: 30, cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF4FB')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 1 ? '#FAFAFA' : '#fff')}
                  >
                    <td style={{ ...TD, fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {g.isDefault && <Star style={{ width: 12, height: 12, color: colors.warning, fill: colors.warning, flexShrink: 0 }} />}
                        {g.name}
                      </div>
                    </td>
                    <td style={{ ...TD, color: '#6C757D' }}>{g.description ?? '—'}</td>
                    <td style={{ ...TD, color: '#6C757D' }}>{g._count.customers}</td>
                    <td style={{ ...TD, color: '#6C757D' }}>{g._count.overrides}</td>
                    <td style={TD}>
                      {g.isDefault && (
                        <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: colors.warningBg, color: colors.warning }}>Default</span>
                      )}
                    </td>
                    <td style={TD}>
                      <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, ...(g.isActive ? { background: colors.actionBg, color: colors.action } : { background: colors.neutralBg, color: colors.textSecondary }) }}>
                        {g.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ ...TD, width: 36, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => openMenu(e, g.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 2, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6C757D' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#E0E0E0')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <MoreVertical style={{ width: 13, height: 13 }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      {/* Fixed dropdown — escapes overflow:hidden clipping */}
      {menuOpenId && menuPos && (() => {
        const activeGroup = groups.find((g) => g.id === menuOpenId) ?? null
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={closeMenu} />
            <div style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 50, background: '#fff', border: '1px solid #D0D0D0', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 170, padding: '2px 0' }}>
              <button
                onClick={() => { const id = menuOpenId; closeMenu(); router.push(`/app/price-groups/${id}`) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', fontSize: 12, color: '#212529', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <ExternalLink style={{ width: 12, height: 12, color: '#6C757D', flexShrink: 0 }} />
                Open / Manage
              </button>
              {isManager && activeGroup && (
                <>
                  <button
                    onClick={() => { closeMenu(); setEditGroup(activeGroup) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', fontSize: 12, color: '#212529', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <Pencil style={{ width: 12, height: 12, color: '#6C757D', flexShrink: 0 }} />
                    Edit
                  </button>
                  <button
                    onClick={() => { if (!activeGroup.isDefault) handleDelete(activeGroup) }}
                    disabled={activeGroup.isDefault}
                    title={activeGroup.isDefault ? 'Set another group as default before deleting' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', fontSize: 12,
                      color: activeGroup.isDefault ? '#C0C0C0' : colors.danger,
                      background: 'none', border: 'none', textAlign: 'left',
                      cursor: activeGroup.isDefault ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={(e) => { if (!activeGroup.isDefault) e.currentTarget.style.background = colors.dangerBg }}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <Trash2 style={{ width: 12, height: 12, flexShrink: 0 }} />
                    Delete
                  </button>
                </>
              )}
            </div>
          </>
        )
      })()}

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
