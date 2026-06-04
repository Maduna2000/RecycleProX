'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { LogOut, Scale, Printer } from 'lucide-react'
import PrinterSetup from './components/PrinterSetup'
import { PrinterContext } from './PrinterContext'

export default function ScaleClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = pathname === '/scale/login' || pathname.startsWith('/scale/admin')

  const { data: session, status } = useSession()
  const [printerSetupOpen, setPrinterSetupOpen] = useState(false)

  if (isPublic) return <>{children}</>

  if (status === 'loading') {
    return (
      <div
        className="min-h-dvh bg-slate-900 flex items-center justify-center"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="text-white text-lg">Loading…</div>
      </div>
    )
  }

  if (!session) {
    redirect('/scale/login')
    return null
  }

  return (
    <div
      className="min-h-dvh bg-slate-50 flex flex-col"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-lg sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-lg tracking-tight">Scale Station</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-300 text-sm hidden sm:block">
            {session.user.fullName}
          </span>
          <button
            onClick={() => setPrinterSetupOpen(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-white rounded-lg transition-colors"
            aria-label="Printer settings"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/scale/login' })}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm transition-colors px-3 min-h-[44px] rounded-lg"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">Sign out</span>
          </button>
        </div>
      </header>
      <PrinterContext.Provider value={{ openPrinterSetup: () => setPrinterSetupOpen(true) }}>
        <main className="flex-1 flex flex-col">{children}</main>
      </PrinterContext.Provider>
      <PrinterSetup open={printerSetupOpen} onClose={() => setPrinterSetupOpen(false)} />
    </div>
  )
}
