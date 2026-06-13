'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChangePasswordSchema, type ChangePasswordInput } from '@/lib/schemas/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Recycle, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

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
    router.push('/app/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: colors.toolbar }}>
      <div className="w-full max-w-md">
        <div className="bg-white p-8" style={{ border: `1px solid ${colors.border}`, borderRadius: 2 }}>
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 flex items-center justify-center mb-3" style={{ background: colors.warning, borderRadius: 2 }}>
              <Recycle className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold" style={{ color: colors.textPrimary }}>Change Your Password</h1>
            <p className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
              You must change your password before continuing
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 text-sm" style={{ background: colors.dangerBg, border: `1px solid ${colors.danger}`, borderRadius: 2, color: colors.danger }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input id="currentPassword" type="password" {...register('currentPassword')} className="mt-1" disabled={loading} />
              {errors.currentPassword && <p className="text-xs text-red-600 mt-1">{errors.currentPassword.message}</p>}
            </div>

            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <Input id="newPassword" type="password" {...register('newPassword')} className="mt-1" disabled={loading} />
              {newPassword && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength.score ? strength.color : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">{strength.label}</p>
                </div>
              )}
              {errors.newPassword && <p className="text-xs text-red-600 mt-1">{errors.newPassword.message}</p>}
            </div>

            {/* Password rules */}
            <ul className="space-y-1">
              {rules.map((r) => {
                const pass = r.test(newPassword)
                return (
                  <li key={r.label} className="flex items-center gap-2 text-xs">
                    {pass ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-gray-300" />}
                    <span className={pass ? 'text-green-700' : 'text-gray-400'}>{r.label}</span>
                  </li>
                )
              })}
            </ul>

            <div>
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input id="confirmPassword" type="password" {...register('confirmPassword')} className="mt-1" disabled={loading} />
              {errors.confirmPassword && <p className="text-xs text-red-600 mt-1">{errors.confirmPassword.message}</p>}
            </div>

            <Button type="submit" className="w-full hover:opacity-90" style={{ background: colors.action }} disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating...</> : 'Update Password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
