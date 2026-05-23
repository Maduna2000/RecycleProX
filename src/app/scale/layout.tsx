'use client'

import { signOut, useSession } from 'next-auth/react'
import { LogOut, Scale } from 'lucide-react'
import { redirect } from 'next/navigation'

export default function ScaleLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    )
  }

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header bar */}
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-lg tracking-tight">Scale Station</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-300 text-sm hidden sm:block">
            {session.user.fullName}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm transition-colors px-2 py-1 rounded"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  )
}
