'use client'

import { usePathname, redirect } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { LogOut, ShieldCheck } from 'lucide-react'

export default function GateClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = pathname === '/gate/login'

  const { data: session, status } = useSession()

  if (isPublic) return <>{children}</>

  if (status === 'loading') {
    return (
      <div className="min-h-dvh bg-slate-900 flex items-center justify-center" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="text-white text-lg">Loading…</div>
      </div>
    )
  }

  if (!session) {
    redirect('/gate/login')
    return null
  }

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-lg sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-lg tracking-tight">Gate Security</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-300 text-sm hidden sm:block">
            {session.user.fullName}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/gate/login' })}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm transition-colors px-3 min-h-[44px] rounded-lg"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">Sign out</span>
          </button>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
