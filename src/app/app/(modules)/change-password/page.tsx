'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChangePasswordSchema, type ChangePasswordInput } from '@/lib/schemas/auth'
import { CheckCircle2, XCircle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { Btn, Field, inp, PortalPage } from '@/components/rpx'

function getStrength(pw: string): { label: string; color: string; score: number } {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Weak', color: colors.danger, score }
  if (score === 2) return { label: 'Fair', color: colors.warning, score }
  if (score === 3) return { label: 'Good', color: colors.process, score }
  return { label: 'Strong', color: colors.action, score }
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
    // The API route above already reissues the session cookie with
    // forcePasswordChange cleared, so the redirect below won't get bounced
    // back here by middleware. This client-side update just keeps
    // useSession()'s in-memory state in sync — best-effort only, wrapped so
    // it can never strand the user on this page if it fails (it used to be
    // the only fix for the stale cookie, and racing it against
    // SessionProvider's own background refetches was exactly what caused
    // "Update password" to silently do nothing).
    try {
      await update({ forcePasswordChange: false })
    } catch {
      // Cookie is already correct server-side either way.
    }
    router.push('/app/dashboard')
    router.refresh()
  }

  return (
    <PortalPage title="Change Password">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
        <div className="px-6 py-5 flex-1 overflow-auto">
          <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
            Set a new password before continuing
          </p>

          {error && (
            <div className="mb-4 p-3 text-sm" style={{ background: colors.dangerBg, border: `1px solid ${colors.danger}`, borderRadius: 2, color: colors.danger }}>
              {error}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-[1fr_240px] max-w-3xl">
            {/* Fields */}
            <div className="space-y-3">
              <Field label="Current password">
                <input id="currentPassword" type="password" autoComplete="current-password" {...register('currentPassword')} style={inp} disabled={loading} />
                {errors.currentPassword && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{errors.currentPassword.message}</p>}
              </Field>

              <Field label="New password">
                <input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword')} style={inp} disabled={loading} />
                {errors.newPassword && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{errors.newPassword.message}</p>}
              </Field>

              <Field label="Confirm new password">
                <input id="confirmPassword" type="password" autoComplete="new-password" {...register('confirmPassword')} style={inp} disabled={loading} />
                {errors.confirmPassword && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{errors.confirmPassword.message}</p>}
              </Field>
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
                      {pass ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: colors.action }} /> : <XCircle className="w-3.5 h-3.5 shrink-0" style={{ color: colors.textMuted }} />}
                      <span style={{ color: pass ? colors.action : colors.textSecondary }}>{r.label}</span>
                    </li>
                  )
                })}
              </ul>
              {newPassword && (
                <div className="mt-4">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-1.5 flex-1 rounded-full"
                        style={{ background: i <= strength.score ? strength.color : colors.border }}
                      />
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>{strength.label}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end px-6 py-4" style={{ borderTop: `1px solid ${colors.border}`, background: colors.toolbar, flexShrink: 0 }}>
          <Btn type="submit" variant="primary" loading={loading}>
            Update password
          </Btn>
        </div>
      </form>
    </PortalPage>
  )
}
