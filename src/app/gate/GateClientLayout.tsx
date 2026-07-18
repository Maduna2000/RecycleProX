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
      <div className="min-h-dvh bg-[#0F203A] flex items-center justify-center" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-11 h-11 border-[3px] border-white/15 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-slate-400 text-sm font-medium">Loading…</span>
        </div>
      </div>
    )
  }

  if (!session) {
    redirect('/gate/login')
    return null
  }

  return (
    <div className="min-h-dvh bg-slate-100 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <header
        className="text-white px-4 sm:px-6 flex items-center justify-between shadow-lg sticky top-0 z-10 shrink-0 border-b border-white/10"
        style={{
          background: 'linear-gradient(180deg, #14294A 0%, #0F203A 100%)',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)',
          paddingBottom: '10px',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0 ring-1 ring-blue-400/30">
            <ShieldCheck className="text-blue-300" style={{ width: 18, height: 18 }} />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-[15px] sm:text-lg tracking-tight block leading-tight">Gate Security</span>
            <span className="text-[10px] sm:text-xs text-slate-400 block leading-tight">Renovo Pro</span>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <span className="text-slate-300 text-sm hidden md:block truncate max-w-[160px]">
            {session.user.fullName}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/gate/login' })}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white active:bg-white/10 text-sm font-medium transition-colors px-3 min-h-[44px] min-w-[44px] rounded-lg justify-center"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">Sign out</span>
          </button>
        </div>
      </header>
      <main className="flex-1 flex flex-col min-h-0">{children}</main>
    </div>
  )
}
