import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { AppSidebar } from '@/components/AppSidebar'
import { PinLockOverlay } from '@/components/PinLockOverlay'
import { Toaster } from '@/components/ui/sonner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <PinLockOverlay>
        <div className="flex h-screen bg-gray-100">
          <AppSidebar role={session.user.role} fullName={session.user.fullName} username={session.user.username} />
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
        <Toaster richColors />
      </PinLockOverlay>
    </SessionProvider>
  )
}
