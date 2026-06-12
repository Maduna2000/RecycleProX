'use client'

import { useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoginSchema, type LoginInput } from '@/lib/schemas/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Loader2, Eye, EyeOff } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  })

  async function onSubmit(data: LoginInput) {
    setLoading(true)
    setError(null)

    const result = await signIn('credentials', {
      username: data.username,
      password: data.password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      if (result.error.includes('locked')) {
        setError('Account locked — contact an administrator')
      } else if (result.error.includes('inactive')) {
        setError('Account inactive — contact an administrator')
      } else {
        setError('Invalid username or password')
      }
      return
    }

    const sess = await getSession()
    if (sess?.user?.role === 'scale_operator') {
      router.push('/scale')
    } else {
      router.push('/app/dashboard')
    }
    router.refresh()
  }

  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: colors.toolbar }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8" style={{ border: `1px solid ${colors.border}` }}>
          {/* Logo & Title */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-lg flex items-center justify-center mb-4" style={{ background: colors.primary }}>
              <RefreshCw className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Renovo Pro</h1>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>Golden Keys Investments</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: colors.dangerBg, border: `1px solid ${colors.danger}`, color: colors.danger }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="username" style={{ color: colors.textPrimary }}>Username</Label>
              <Input
                id="username"
                autoComplete="username"
                {...register('username')}
                className="mt-1"
                style={{ borderColor: colors.border }}
                disabled={loading}
              />
              {errors.username && (
                <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.username.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password" style={{ color: colors.textPrimary }}>Password</Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...register('password')}
                  style={{ borderColor: colors.border }}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100"
                  style={{ color: colors.textSecondary }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: colors.primary }}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: colors.textSecondary }}>
            Accounts are created by an administrator
          </p>
        </div>
      </div>
    </div>
  )
}
