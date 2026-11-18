'use client'

import { useState, useEffect } from 'react'
import { signIn, getSession, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoginSchema, type LoginInput } from '@/lib/schemas/auth'
import { Scale, Loader2, Eye, EyeOff } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { AuthShell } from '@/components/auth/AuthShell'

const SCALE_ROLES = ['scale_operator', 'admin', 'manager']
// localStorage key for the company code this kiosk last signed in with.
const COMPANY_CODE_KEY = 'scale.companyCode'
const ACCENT = colors.action

// A cashier explicitly granted /app/scale (via the same per-user
// allowedModules mechanism every other module uses) gets in too, alongside
// the roles above that always have kiosk access.
function hasScaleAccess(user: { role?: string | null; allowedModules?: string[] } | null | undefined): boolean {
  if (!user) return false
  if (user.role && SCALE_ROLES.includes(user.role)) return true
  return (user.allowedModules ?? []).includes('/app/scale')
}

export default function ScaleLoginPage() {
  const router  = useRouter()
  const { data: session, status } = useSession()
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // Which company this kiosk signs into. The scale station is served from the
  // apex host (no company subdomain), so without a code login always lands in
  // the default company. The code is remembered on this device so an operator
  // only ever types it once.
  const [showCompanyCode, setShowCompanyCode] = useState(false)
  const [rememberedCode, setRememberedCode] = useState(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COMPANY_CODE_KEY)
      if (saved) {
        setValue('tenantSlug', saved)
        setShowCompanyCode(true)
        setRememberedCode(true)
      }
    } catch {
      // Storage unavailable (private mode) — the field simply starts empty.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Already authenticated — skip straight to the wizard
  useEffect(() => {
    if (status === 'authenticated' && hasScaleAccess(session?.user)) {
      router.replace('/scale')
    }
  }, [session, status, router])

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  })

  async function onSubmit(data: LoginInput) {
    setLoading(true)
    setError(null)

    // Only a visible, non-empty code counts. Never pass `undefined`: signIn()
    // form-encodes it as the literal string "undefined", which would steer
    // login into the company-lookup branch with a bogus slug.
    const tenantSlug = showCompanyCode ? data.tenantSlug?.trim() : undefined

    const result = await signIn('credentials', {
      username: data.username,
      password: data.password,
      ...(tenantSlug ? { tenantSlug } : {}),
      redirect: false,
    })

    if (result?.error) {
      setLoading(false)
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
    if (!hasScaleAccess(sess?.user)) {
      setLoading(false)
      setError('This account does not have Scale Station access')
      return
    }

    // Remember (or forget) the company code only once the login has actually
    // succeeded, so a typo is never persisted.
    try {
      if (tenantSlug) window.localStorage.setItem(COMPANY_CODE_KEY, tenantSlug)
      else window.localStorage.removeItem(COMPANY_CODE_KEY)
    } catch {
      // Storage unavailable — nothing to remember.
    }

    router.push('/scale')
    router.refresh()
  }

  return (
    <AuthShell
      accentColor={ACCENT}
      icon={
        <div style={{ width: '100%', height: '100%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Scale style={{ width: 32, height: 32, color: '#fff' }} />
        </div>
      }
      title="Scale Station"
      subtitle="Renovo Pro"
      errorMessage={error}
      isSessionLoading={status === 'loading'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="username" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 6 }}>
            Username
          </label>
          <input
            id="username"
            autoComplete="username"
            {...register('username')}
            disabled={loading}
            className="disabled:opacity-50"
            style={touchInput}
            onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.boxShadow = `0 0 0 3px ${ACCENT}33` }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#ABABAB'; e.currentTarget.style.boxShadow = 'none' }}
          />
          {errors.username && (
            <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.username.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 6 }}>
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              {...register('password')}
              disabled={loading}
              className="disabled:opacity-50"
              style={{ ...touchInput, paddingRight: 48 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.boxShadow = `0 0 0 3px ${ACCENT}33` }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#ABABAB'; e.currentTarget.style.boxShadow = 'none' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center disabled:opacity-50 transition-colors"
              style={{ color: colors.textMuted }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs mt-1" style={{ color: colors.danger }}>{errors.password.message}</p>
          )}
        </div>

        {showCompanyCode ? (
          <div>
            <label htmlFor="tenantSlug" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 6 }}>
              Company code
            </label>
            <input
              id="tenantSlug"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              {...register('tenantSlug')}
              disabled={loading}
              className="disabled:opacity-50"
              style={touchInput}
              onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.boxShadow = `0 0 0 3px ${ACCENT}33` }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#ABABAB'; e.currentTarget.style.boxShadow = 'none' }}
            />
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              {rememberedCode
                ? 'Remembered on this device — change it only if this kiosk moves to another company.'
                : 'Provided by your administrator. Leave blank for the default company.'}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCompanyCode(true)}
            disabled={loading}
            className="text-sm underline-offset-2 hover:underline min-h-[44px]"
            style={{ color: colors.textSecondary }}
          >
            Sign in with a company code
          </button>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ ...submitBtn(ACCENT), ...(loading ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.filter = 'brightness(0.92)' }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
        >
          {loading
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Signing in…</>
            : 'Sign In'}
        </button>
      </form>
    </AuthShell>
  )
}

const touchInput: React.CSSProperties = {
  width: '100%', height: 48, border: '1px solid #ABABAB', borderRadius: 3,
  padding: '0 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box',
}

function submitBtn(accent: string): React.CSSProperties {
  return {
    width: '100%', height: 56, marginTop: 8, border: 'none', borderRadius: 3,
    background: accent, color: '#fff', fontSize: 16, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 6px rgba(0,0,0,0.25)',
  }
}
