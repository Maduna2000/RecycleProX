'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, ChevronRight, Star, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreatePriceGroupSchema, type CreatePriceGroupInput, type CreatePriceGroupFormInput } from '@/lib/schemas/product'
import { useSession } from 'next-auth/react'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type PriceGroup = {
  id: string; name: string; description?: string
  isDefault: boolean; isActive: boolean
  _count: { customers: number; overrides: number }
}

export default function PriceGroupsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [createOpen, setCreateOpen] = useState(false)
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const { data } = useSWR<{ groups: PriceGroup[] }>('/api/price-groups', fetcher)
  const groups = data?.groups ?? []

  const count = groups.length
  const subtitle = `${count} price group${count !== 1 ? 's' : ''}`

  return (
    <PageShell title="Price Groups" subtitle={subtitle}>
      <div className="flex flex-col flex-1 min-h-0 gap-3">

        {/* Actions row */}
        {isManager && (
          <div className="flex justify-end shrink-0">
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium text-white transition-colors"
              style={{ background: colors.action }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#185A38')}
              onMouseLeave={(e) => (e.currentTarget.style.background = colors.action)}
            >
              <Plus className="w-3.5 h-3.5" /> New Group
            </button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {groups.length === 0 ? (
            <div className="rounded-lg p-10 text-center text-sm bg-white" style={{ border: `1px solid ${colors.border}`, color: colors.textSecondary }}>
              No price groups created yet
            </div>
          ) : (
            groups.map((g) => (
              <div
                key={g.id}
                className="bg-white rounded-lg p-4 flex items-center justify-between cursor-pointer transition-colors"
                style={{ border: `1px solid ${colors.border}` }}
                onClick={() => router.push(`/app/price-groups/${g.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = colors.action)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = colors.border)}
              >
                <div className="flex items-center gap-3">
                  {g.isDefault && <Star className="w-4 h-4 shrink-0" style={{ color: colors.warning, fill: colors.warning }} />}
                  <div>
                    <p className="font-semibold text-sm" style={{ color: colors.textPrimary }}>{g.name}</p>
                    {g.description && <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>{g.description}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs" style={{ color: colors.textSecondary }}>{g._count.customers} customers</span>
                      <span className="text-xs" style={{ color: colors.textSecondary }}>{g._count.overrides} price overrides</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {g.isDefault && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.warningBg, color: colors.warning }}>Default</span>
                  )}
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={g.isActive
                    ? { background: colors.actionBg, color: colors.action }
                    : { background: colors.neutralBg, color: colors.textSecondary }}>
                    {g.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <ChevronRight className="w-4 h-4" style={{ color: colors.textSecondary }} />
                </div>
              </div>
            ))
          )}
        </div>

        {createOpen && (
          <CreatePriceGroupModal
            onClose={() => setCreateOpen(false)}
            onSuccess={() => { mutate('/api/price-groups'); setCreateOpen(false) }}
          />
        )}
      </div>
    </PageShell>
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
            <Input {...register('name')} className="mt-1 border-[#E0E0E0]" placeholder="e.g. Platinum Dealer" disabled={loading} />
            {errors.name && <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.name.message}</p>}
          </div>
          <div>
            <Label style={{ color: colors.textPrimary }}>Description <span className="font-normal" style={{ color: colors.textSecondary }}>(optional)</span></Label>
            <Input {...register('description')} className="mt-1 border-[#E0E0E0]" disabled={loading} />
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
              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#185A38')}
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
