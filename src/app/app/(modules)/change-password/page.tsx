'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChangePasswordSchema, type ChangePasswordInput } from '@/lib/schemas/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Recycle, CheckCircle2, XCircle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { Btn, NAVY } from '@/components/rpx'

function getStrength(pw: string): { label: string; color: string; score: number } {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Weak', color: 'bg-red-500', score }
  if (score === 2) return { label: 'Fair', color: 'bg-amber-500', score }
  if (score === 3) return { label: 'Good', color: 'bg-blue-500', score }
  return { label: 'Strong', color: 'bg-green-500', score }
}

const rules = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One number', test: (v: string) => /[0-9]/.test(v) },
  { label: 'One special character', test: (v: string) => /[^a-zA-Z0-9]/.test(v) },
]

export default function ChangePasswordPage() {
  const router = useRouter()
  const { update } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ChangePasswordInput>({
    resolver: zodResolver(ChangePasswordSchema),
  })

  const newPassword = watch('newPassword', '')
  const strength = getStrength(newPassword)

  async function onSubmit(data: ChangePasswordInput) {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/users/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setLoading(false)
    if (!res.ok) {
      const json = await res.json()
      setError(json.error ?? 'Failed to change password')
      return
    }
    // The session JWT still carries forcePasswordChange from login time —
    // without refreshing it here, middleware bounces /app/dashboard right
    // back to this page until the user logs out and in again (the DB flag
    // is already false; only the cookie is stale). The jwt callback in
    // auth.config.ts honors exactly this one update.
    await update({ forcePasswordChange: false })
    router.push('/app/dashboard')
    router.refresh()
  }

  return (
    <div className="flex justify-center px-4 py-8" style={{ background: colors.toolbar }}>
      <div className="w-full max-w-3xl">
        <div className="bg-white" style={{ border: `1px solid ${colors.border}`, borderRadius: 2 }}>
          {/* Header — horizontal, compact */}
          <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: `1px solid ${colors.border}` }}>
            <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ background: NAVY, borderRadius: 2 }}>
              <Recycle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight" style={{ color: colors.textPrimary }}>Change your password</h1>
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                Set a new password before continuing
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="px-6 py-5">
              {error && (
                <div className="mb-4 p-3 text-sm" style={{ background: colors.dangerBg, border: `1px solid ${colors.danger}`, borderRadius: 2, color: colors.danger }}>
                  {error}
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-[1fr_240px]">
                {/* Fields */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">Current password</Label>
                    <Input id="currentPassword" type="password" autoComplete="current-password" {...register('currentPassword')} className="mt-1" disabled={loading} />
                    {errors.currentPassword && <p className="text-xs text-red-600 mt-1">{errors.currentPassword.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="newPassword">New password</Label>
                    <Input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword')} className="mt-1" disabled={loading} />
                    {errors.newPassword && <p className="text-xs text-red-600 mt-1">{errors.newPassword.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="confirmPassword">Confirm new password</Label>
                    <Input id="confirmPassword" type="password" autoComplete="new-password" {...register('confirmPassword')} className="mt-1" disabled={loading} />
                    {errors.confirmPassword && <p className="text-xs text-red-600 mt-1">{errors.confirmPassword.message}</p>}
                  </div>
                </div>

                {/* Live requirements + strength, beside the fields instead of
                    stacked between them — keeps the whole card inside one
                    viewport with no scrolling */}
                <div className="p-4 self-start" style={{ background: colors.toolbar, borderRadius: 2 }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: colors.textSecondary }}>
                    Password requirements
                  </p>
                  <ul className="space-y-2">
                    {rules.map((r) => {
                      const pass = r.test(newPassword)
                      return (
                        <li key={r.label} className="flex items-center gap-2 text-xs">
                          {pass ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                          <span className={pass ? 'text-green-700' : 'text-gray-500'}>{r.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                  {newPassword && (
                    <div className="mt-4">
                      <div className="flex gap-1 mb-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength.score ? strength.color : 'bg-gray-200'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">{strength.label}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end px-6 py-4" style={{ borderTop: `1px solid ${colors.border}`, background: colors.toolbar }}>
              <Btn type="submit" variant="primary" loading={loading}>
                Update password
              </Btn>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
