'use client'

import { useState, useEffect } from 'react'
import { signIn, getSession, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoginSchema, type LoginInput } from '@/lib/schemas/auth'
import { BookOpen, Loader2, Eye, EyeOff } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { AuthShell } from '@/components/auth/AuthShell'

// Admin-only — no allowedModules grant fallback, unlike Scale/Gate. Ledger
// exposes real financial figures across the whole business, not a single
// kiosk workflow, so it isn't something a manager/cashier can be individually
// granted into the way /app/scale or /app/gate can.
const ACCENT = colors.mainInstruction

function hasLedgerAccess(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === 'admin'
}

export default function LedgerLoginPage() {
  const router  = useRouter()
  const { data: session, status } = useSession()
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (status === 'authenticated' && hasLedgerAccess(session?.user)) {
      router.replace('/ledger')
    }
  }, [session, status, router])

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
    if (!hasLedgerAccess(sess?.user)) {
      setLoading(false)
      setError('This account does not have Ledger access — admin role required')
      return
    }

    router.push('/ledger')
    router.refresh()
  }

  return (
    <AuthShell
      accentColor={ACCENT}
      icon={
        <div style={{ width: '100%', height: '100%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BookOpen style={{ width: 32, height: 32, color: '#fff' }} />
        </div>
      }
      title="Ledger"
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
