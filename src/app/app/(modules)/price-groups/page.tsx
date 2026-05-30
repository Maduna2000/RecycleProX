'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus, Star, Loader2, MoreVertical, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreatePriceGroupSchema, type CreatePriceGroupInput, type CreatePriceGroupFormInput } from '@/lib/schemas/product'
import { useSession } from 'next-auth/react'
import { colors } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type PriceGroup = {
  id: string; name: string; description?: string
  isDefault: boolean; isActive: boolean
  _count: { customers: number; overrides: number }
}

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 10px', height: 28,
  fontSize: 10, fontWeight: 700, color: '#6C757D',
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '0 10px', fontSize: 12, color: '#212529' }

export default function PriceGroupsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [createOpen, setCreateOpen] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  useEffect(() => {
    const close = () => setMenuOpenId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const { data } = useSWR<{ groups: PriceGroup[] }>('/api/price-groups', fetcher)
  const groups = data?.groups ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1B3A6B' }}>Price Groups</span>
          <span style={{ fontSize: 11, color: '#6C757D' }}>{groups.length} group{groups.length !== 1 ? 's' : ''}</span>
          <div style={{ flex: 1 }} />
          {isManager && (
            <button
              onClick={() => setCreateOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 2, background: '#217346', border: '1px solid #176338', color: '#fff', cursor: 'pointer' }}
            >
              <Plus style={{ width: 11, height: 11 }} /> New Group
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {groups.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#6C757D', fontSize: 12 }}>
              No price groups created yet
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
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
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === g.id ? null : g.id) }}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 2, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6C757D' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#E0E0E0')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <MoreVertical style={{ width: 13, height: 13 }} />
                        </button>
                        {menuOpenId === g.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{ position: 'absolute', right: 0, top: 24, zIndex: 50, background: '#fff', border: '1px solid #D0D0D0', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 160, padding: '2px 0' }}
                          >
                            <button
                              onClick={() => { setMenuOpenId(null); router.push(`/app/price-groups/${g.id}`) }}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', fontSize: 12, color: '#212529', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                            >
                              <ExternalLink style={{ width: 12, height: 12, color: '#6C757D', flexShrink: 0 }} />
                              Open / Manage
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {createOpen && (
        <CreatePriceGroupModal
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { mutate('/api/price-groups'); setCreateOpen(false) }}
        />
      )}
    </div>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New Price Group</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 h-9 px-4 rounded text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: colors.action }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = colors.actionHover)}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.background = colors.action)}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Creating…</> : 'Create Group'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
