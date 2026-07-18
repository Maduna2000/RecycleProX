'use client'

import { useState, useEffect } from 'react'
import { signIn, getSession, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoginSchema, type LoginInput } from '@/lib/schemas/auth'
import { ShieldCheck, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react'

const GATE_ROLES = ['security_guard', 'admin', 'manager']

export default function GateLoginPage() {
  const router  = useRouter()
  const { data: session, status } = useSession()
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Already authenticated — skip straight to the kiosk
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role &&
        GATE_ROLES.includes(session.user.role)) {
      router.replace('/gate')
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
    if (!sess?.user?.role || !GATE_ROLES.includes(sess.user.role)) {
      setLoading(false)
      setError('This account does not have Guard Station access')
      return
    }

    router.push('/gate')
    router.refresh()
  }

  if (status === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at 50% 0%, #1B3A63 0%, #0F203A 60%)' }}>
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-4 sm:p-6"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1B3A63 0%, #0F203A 60%)' }}
    >
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-10">
          <div className="flex flex-col items-center mb-7 sm:mb-8">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#0F203A] flex items-center justify-center mb-4 shadow-lg ring-4 ring-blue-500/15"
            >
              <ShieldCheck className="w-9 h-9 sm:w-11 sm:h-11 text-blue-300" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Guard Station</h1>
            <p className="text-sm text-slate-400 mt-1">Renovo Pro</p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Username
              </label>
              <input
                autoComplete="username"
                {...register('username')}
                disabled={loading}
                className="w-full h-12 border border-slate-300 rounded-xl px-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 transition-shadow"
              />
              {errors.username && (
                <p className="text-xs text-red-600 mt-1">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  {...register('password')}
                  disabled={loading}
                  className="w-full h-12 border border-slate-300 rounded-xl px-4 pr-12 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 disabled:opacity-50 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-lg font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 mt-2 shadow-md shadow-blue-600/20"
            >
              {loading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Signing in…</>
                : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Accounts are created by an administrator
          </p>
        </div>
      </div>
    </div>
  )
}
