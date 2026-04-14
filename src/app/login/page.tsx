'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoginSchema, type LoginInput } from '@/lib/schemas/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Loader2 } from 'lucide-react'

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

    router.push('/app/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8F9FA' }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8" style={{ border: '1px solid #E0E0E0' }}>
          {/* Logo & Title */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#1B3A6B' }}>
              <RefreshCw className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: '#212529' }}>Renovo Pro</h1>
            <p className="text-sm mt-1" style={{ color: '#6C757D' }}>Lariat Technologies</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FFF0F0', border: '1px solid #F5C6C6', color: '#C0392B' }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="username" style={{ color: '#212529' }}>Username</Label>
              <Input
                id="username"
                autoComplete="username"
                {...register('username')}
                className="mt-1 border-[#E0E0E0]"
                disabled={loading}
              />
              {errors.username && (
                <p className="text-xs mt-1" style={{ color: '#C0392B' }}>{errors.username.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password" style={{ color: '#212529' }}>Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className="mt-1 border-[#E0E0E0]"
                disabled={loading}
              />
              {errors.password && (
                <p className="text-xs mt-1" style={{ color: '#C0392B' }}>{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: '#1B3A6B' }}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: '#6C757D' }}>
            Accounts are created by an administrator
          </p>
        </div>
      </div>
    </div>
  )
}
