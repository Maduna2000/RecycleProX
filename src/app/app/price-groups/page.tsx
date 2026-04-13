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

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Page header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Price Groups</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>Assign custom buy/sell prices to customer groups</p>
        </div>
        {isManager && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium text-white transition-colors"
            style={{ background: '#217346' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#185A38')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#217346')}
          >
            <Plus className="w-3.5 h-3.5" /> New Group
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
        {groups.length === 0 ? (
          <div className="rounded-lg p-10 text-center text-sm bg-white" style={{ border: '1px solid #E0E0E0', color: '#6C757D' }}>
            No price groups created yet
          </div>
        ) : (
          groups.map((g) => (
            <div
              key={g.id}
              className="bg-white rounded-lg p-4 flex items-center justify-between cursor-pointer transition-colors"
              style={{ border: '1px solid #E0E0E0' }}
              onClick={() => router.push(`/app/price-groups/${g.id}`)}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#217346')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#E0E0E0')}
            >
              <div className="flex items-center gap-3">
                {g.isDefault && <Star className="w-4 h-4 shrink-0" style={{ color: '#C9A020', fill: '#C9A020' }} />}
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#212529' }}>{g.name}</p>
                  {g.description && <p className="text-xs mt-0.5" style={{ color: '#6C757D' }}>{g.description}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs" style={{ color: '#6C757D' }}>{g._count.customers} customers</span>
                    <span className="text-xs" style={{ color: '#6C757D' }}>{g._count.overrides} price overrides</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {g.isDefault && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#FFFBEB', color: '#C9A020' }}>Default</span>
                )}
                <span className="px-2 py-0.5 rounded text-xs font-medium" style={g.isActive
                  ? { background: '#F0FBF4', color: '#217346' }
                  : { background: '#F1F3F4', color: '#6C757D' }}>
                  {g.isActive ? 'Active' : 'Inactive'}
                </span>
                <ChevronRight className="w-4 h-4" style={{ color: '#6C757D' }} />
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
            <Label style={{ color: '#212529' }}>Group Name</Label>
            <Input {...register('name')} className="mt-1 border-[#E0E0E0]" placeholder="e.g. Platinum Dealer" disabled={loading} />
            {errors.name && <p className="text-xs mt-1" style={{ color: '#C0392B' }}>{errors.name.message}</p>}
          </div>
          <div>
            <Label style={{ color: '#212529' }}>Description <span className="font-normal" style={{ color: '#6C757D' }}>(optional)</span></Label>
            <Input {...register('description')} className="mt-1 border-[#E0E0E0]" disabled={loading} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#212529' }}>
            <input type="checkbox" onChange={(e) => setValue('isDefault', e.target.checked)} className="rounded" />
            Set as default price group
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 h-9 px-4 rounded text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: '#217346' }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#185A38')}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.background = '#217346')}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Creating…</> : 'Create Group'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
