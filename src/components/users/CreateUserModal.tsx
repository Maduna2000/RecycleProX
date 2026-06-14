'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateUserSchema, type CreateUserInput } from '@/lib/schemas/auth'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// ─── Shared styles (matching profile pages) ─────────────────────────────────────
const modalHdr: React.CSSProperties = {
  background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)',
  borderBottom: '2px solid #B0B0B0',
  padding: '8px 16px',
  borderRadius: '6px 6px 0 0',
  margin: '-24px -24px 16px -24px',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: '#6C757D', marginBottom: 4,
}
const inp: React.CSSProperties = {
  height: 28, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 8px',
  fontSize: 12, color: '#212529', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
}
const selectStyle: React.CSSProperties = {
  height: 28, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 8px',
  fontSize: 12, color: '#212529', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
}
const btnBase: React.CSSProperties = {
  fontSize: 11, padding: '5px 14px', borderRadius: 2, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}
const cancelBtn: React.CSSProperties = {
  ...btnBase,
  background: 'linear-gradient(180deg,#F5F5F5 0%,#E0E0E0 100%)',
  border: '1px solid #ABABAB', color: '#333',
}
const submitBtn: React.CSSProperties = {
  ...btnBase,
  background: 'linear-gradient(180deg,#10B981 0%,#059669 100%)',
  border: '1px solid #059669', color: '#fff', fontWeight: 600,
}

export function CreateUserModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: { isActive: true },
  })

  async function onSubmit(data: CreateUserInput) {
    setLoading(true)
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setLoading(false)
    if (res.ok) {
      toast.success('User created')
      reset()
      onSuccess()
      onClose()
    } else {
      const json = await res.json()
      toast.error(json.error ?? 'Failed to create user')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-md p-6">
        <div style={modalHdr}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#212529' }}>Add User</span>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={lbl}>Full Name</span>
            <input {...register('fullName')} disabled={loading} style={inp} />
            {errors.fullName && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.fullName.message}</span>}
          </div>

          <div>
            <span style={lbl}>Username</span>
            <input {...register('username')} disabled={loading} style={inp} />
            {errors.username && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.username.message}</span>}
          </div>

          <div>
            <span style={lbl}>Password</span>
            <input type="password" {...register('password')} disabled={loading} style={inp} />
            {errors.password && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.password.message}</span>}
          </div>

          <div>
            <span style={lbl}>Role</span>
            <select
              onChange={(e) => setValue('role', e.target.value as 'admin' | 'manager' | 'cashier')}
              disabled={loading}
              style={selectStyle}
              defaultValue=""
            >
              <option value="" disabled>Select role...</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="cashier">Cashier</option>
            </select>
            {errors.role && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.role.message}</span>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onClose} disabled={loading} style={cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...submitBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
