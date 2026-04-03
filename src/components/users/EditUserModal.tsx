'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSession } from 'next-auth/react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const EditSchema = z.object({
  fullName: z.string().min(2),
  role: z.enum(['admin', 'manager', 'cashier']),
  isActive: z.boolean(),
})
type EditInput = z.infer<typeof EditSchema>

type User = { id: string; fullName: string; username: string; role: string; isActive: boolean }

export function EditUserModal({ user, onClose, onSuccess }: { user: User; onClose: () => void; onSuccess: () => void }) {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const isSelf = session?.user?.id === user.id

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<EditInput>({
    resolver: zodResolver(EditSchema),
    defaultValues: { fullName: user.fullName, role: user.role as EditInput['role'], isActive: user.isActive },
  })

  async function onSubmit(data: EditInput) {
    setLoading(true)
    const res = await fetch(`/api/users/${user.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setLoading(false)
    if (res.ok) { toast.success('User updated'); onSuccess(); onClose() }
    else { const json = await res.json(); toast.error(json.error ?? 'Failed to update user') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit User — {user.username}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <Label>Full Name</Label>
            <Input {...register('fullName')} className="mt-1" disabled={loading} />
            {errors.fullName && <p className="text-xs text-red-600 mt-1">{errors.fullName.message}</p>}
          </div>
          <div>
            <Label>Role</Label>
            <Select defaultValue={user.role} onValueChange={(v) => setValue('role', v as EditInput['role'])} disabled={loading || isSelf}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="cashier">Cashier</SelectItem>
              </SelectContent>
            </Select>
            {isSelf && <p className="text-xs text-gray-400 mt-1">Cannot change your own role</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
