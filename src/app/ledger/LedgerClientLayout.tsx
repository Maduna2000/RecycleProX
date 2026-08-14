'use client'

import { usePathname, redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { LogOut, BookOpen } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

const NAV_ITEMS = [
  { href: '/ledger', label: 'Dashboard' },
  { href: '/ledger/accounts', label: 'Chart of Accounts' },
  { href: '/ledger/general-ledger', label: 'General Ledger' },
  { href: '/ledger/trial-balance', label: 'Trial Balance' },
  { href: '/ledger/profit-loss', label: 'Profit & Loss' },
  { href: '/ledger/balance-sheet', label: 'Balance Sheet' },
  { href: '/ledger/journal', label: 'Journal' },
]

export default function LedgerClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = pathname === '/ledger/login'

  const { data: session, status } = useSession()

  if (isPublic) return <>{children}</>

  if (status === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.dashBg }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-11 h-11 border-[3px] border-white/15 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-slate-400 text-sm font-medium">Loading…</span>
        </div>
      </div>
    )
  }

  if (!session) {
    redirect('/ledger/login')
    return null
  }

  if (session.user.role !== 'admin') {
    redirect('/app/dashboard')
    return null
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: colors.bg }}>
      <header
        className="text-white px-4 sm:px-6 flex items-center justify-between shadow-lg sticky top-0 z-10 shrink-0 border-b border-white/10"
        style={{ background: 'linear-gradient(180deg, #0A2A6B 0%, #003399 100%)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0 py-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 ring-1 ring-white/20">
            <BookOpen className="text-blue-200" style={{ width: 18, height: 18 }} />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-[15px] sm:text-lg tracking-tight block leading-tight">Ledger</span>
            <span className="text-[10px] sm:text-xs text-blue-200 block leading-tight">Renovo Pro</span>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {/* Which tenant's books this is — every figure on every /ledger
              page is scoped to this company and no other, via the same
              tenantId the session carries into every API call. */}
          {session.user.tenantSlug && (
            <span
              className="text-[11px] font-medium px-2.5 py-1 rounded-full hidden sm:block"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#DCE8FF' }}
              title="The company these books belong to"
            >
              {session.user.tenantSlug}
            </span>
          )}
          <span className="text-blue-100 text-sm hidden md:block truncate max-w-[160px]">
            {session.user.fullName}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/ledger/login' })}
            className="flex items-center gap-1.5 text-blue-100 hover:text-white text-sm font-medium transition-colors px-3 min-h-[40px] rounded-lg"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">Sign out</span>
          </button>
        </div>
      </header>

      <nav className="flex items-center gap-1 px-4 sm:px-6 overflow-x-auto shrink-0" style={{ background: '#0A2A6B', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/ledger' ? pathname === '/ledger' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap text-[13px] font-medium px-3 py-2.5 transition-colors border-b-2"
              style={{
                color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                borderBottomColor: active ? colors.tabAccent : 'transparent',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <main className="flex-1 flex flex-col min-h-0 p-4 sm:p-6">{children}</main>
    </div>
  )
}
