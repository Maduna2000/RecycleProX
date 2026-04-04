'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Badge } from '@/components/ui/badge'
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Price Groups</h1>
          <p className="text-sm text-gray-500 mt-0.5">Assign custom buy/sell prices to customer groups</p>
        </div>
        {isManager && (
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Group
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {groups.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center text-gray-400">No price groups created yet</div>
        ) : (
          groups.map((g) => (
            <div
              key={g.id}
              className="bg-white rounded-xl border p-4 flex items-center justify-between hover:border-green-300 cursor-pointer transition-colors"
              onClick={() => router.push(`/app/price-groups/${g.id}`)}
            >
              <div className="flex items-center gap-3">
                {g.isDefault && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 shrink-0" />}
                <div>
                  <p className="font-semibold text-gray-900">{g.name}</p>
                  {g.description && <p className="text-sm text-gray-500 mt-0.5">{g.description}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-400">{g._count.customers} customers</span>
                    <span className="text-xs text-gray-400">{g._count.overrides} price overrides</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {g.isDefault && <Badge className="bg-yellow-100 text-yellow-700">Default</Badge>}
                <Badge className={g.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                  {g.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <ChevronRight className="w-4 h-4 text-gray-400" />
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
            <Label>Group Name</Label>
            <Input {...register('name')} className="mt-1" placeholder="e.g. Platinum Dealer" disabled={loading} />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input {...register('description')} className="mt-1" disabled={loading} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" onChange={(e) => setValue('isDefault', e.target.checked)} className="rounded" />
            Set as default price group
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : 'Create Group'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
