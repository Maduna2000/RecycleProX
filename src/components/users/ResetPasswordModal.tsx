'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ResetPasswordSchema, type ResetPasswordInput } from '@/lib/schemas/auth'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

type User = { id: string; fullName: string; username: string }

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
const btnBase: React.CSSProperties = {
  fontSize: 11, padding: '5px 14px', borderRadius: 2, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}
const cancelBtn: React.CSSProperties = {
  ...btnBase,
  background: 'linear-gradient(180deg,#F5F5F5 0%,#E0E0E0 100%)',
  border: '1px solid #ABABAB', color: '#333',
}
const dangerBtn: React.CSSProperties = {
  ...btnBase,
  background: 'linear-gradient(180deg,#FEE2E2 0%,#FECACA 100%)',
  border: '1px solid #FCA5A5', color: '#991B1B', fontWeight: 600,
}
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
      <DialogContent className="sm:max-w-md p-6">
        <div style={modalHdr}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#212529' }}>Reset Password — {user.username}</span>
        </div>

        <div style={warningBox}>
          <AlertTriangle style={{ width: 14, height: 14, color: '#92400E', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11, color: '#92400E' }}>User will be forced to change their password on next login.</span>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={lbl}>New Password</span>
            <input type="password" {...register('newPassword')} disabled={loading} style={inp} />
            {errors.newPassword && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.newPassword.message}</span>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onClose} disabled={loading} style={cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...dangerBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
