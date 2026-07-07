'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ResetPasswordSchema, type ResetPasswordInput } from '@/lib/schemas/auth'
import { Dialog } from '@/components/ui/dialog'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { inp, lbl, Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'

type User = { id: string; fullName: string; username: string }

const warningBox: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
  padding: '8px 10px', borderRadius: 2, marginBottom: 12,
  background: '#FEF3C7', border: '1px solid #FCD34D',
}

export function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
  })

  async function onSubmit(data: ResetPasswordInput) {
    setLoading(true)
    const res = await fetch(`/api/users/${user.id}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setLoading(false)
    if (res.ok) { toast.success('Password reset — user will be forced to change on next login'); onClose() }
    else { const json = await res.json(); toast.error(json.error ?? 'Failed to reset password') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title={`Reset Password — ${user.username}`} onClose={onClose} />
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <RpxDialogBody>
            <div style={warningBox}>
              <AlertTriangle style={{ width: 14, height: 14, color: '#92400E', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 11, color: '#92400E' }}>User will be forced to change their password on next login.</span>
            </div>
            <div>
              <span style={lbl}>New Password</span>
              <input type="password" {...register('newPassword')} disabled={loading} style={inp} />
              {errors.newPassword && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.newPassword.message}</span>}
            </div>
          </RpxDialogBody>
          <RpxDialogFooter>
            <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
            <Btn variant="danger" type="submit" loading={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </Btn>
          </RpxDialogFooter>
        </form>
      </RpxDialogContent>
    </Dialog>
  )
}
