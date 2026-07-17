'use client'

import { useState } from 'react'
import { signIn, signOut, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoginSchema, type LoginInput } from '@/lib/schemas/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Loader2, Eye, EyeOff } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

export function LoginForm({ tenantSlug }: { tenantSlug?: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCompanyCode, setShowCompanyCode] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  })

  async function onSubmit(data: LoginInput) {
    setLoading(true)
    setError(null)

    // tenantSlug normally comes from the subdomain (the `tenantSlug` prop,
    // derived by middleware.ts from the request hostname) — but this
    // deployment has no custom domain attached (zero-cost hosting on
    // *.vercel.app, see CLAUDE.md), so that never resolves in production.
    // The company-code disclosure below is the fallback that actually makes
    // non-default tenants reachable at all today; the prop still wins if a
    // real subdomain is ever wired up later, so the disclosure naturally
    // stops being shown at that point. The typed value only counts while
    // its field is visible — a code typed and then collapsed is ignored.
    const effectiveTenantSlug =
      tenantSlug || (showCompanyCode ? data.tenantSlug?.trim() : undefined) || undefined

    // signIn() form-encodes this object — an `undefined` value gets
    // coerced to the literal string "undefined" by URLSearchParams, which
    // is truthy and would incorrectly steer login() into the tenant-lookup
    // branch. Only include the key at all when there's a real slug.
    const result = await signIn('credentials', {
      username: data.username,
      password: data.password,
      ...(effectiveTenantSlug ? { tenantSlug: effectiveTenantSlug } : {}),
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

    // Block scale operators from main login — they must use /scale/login
    if (sess?.user?.role === 'scale_operator') {
      await signOut({ redirect: false })
      setLoading(false)
      setError('Scale operators must use the Scale Station login')
      return
    }

    router.push('/app/dashboard')
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
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
              {tenantSlug ? tenantSlug : 'Recycling Yard Management'}
            </p>
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

            {!tenantSlug && (
              showCompanyCode ? (
                <div>
                  <Label htmlFor="tenantSlug" style={{ color: colors.textPrimary }}>Company code</Label>
                  <Input
                    id="tenantSlug"
                    autoComplete="off"
                    autoFocus
                    {...register('tenantSlug')}
                    className="mt-1"
                    style={{ borderColor: colors.border }}
                    disabled={loading}
                  />
                  <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    Provided by your administrator
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCompanyCode(true)}
                  className="text-xs underline-offset-2 hover:underline"
                  style={{ color: colors.textSecondary }}
                  disabled={loading}
                >
                  Sign in with a company code
                </button>
              )
            )}

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
