import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { AppShell } from '@/components/layout/AppShell'
import { PinLockOverlay } from '@/components/PinLockOverlay'
import { Toaster } from '@/components/ui/sonner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <PinLockOverlay>
        <AppShell
          role={session.user.role}
          fullName={session.user.fullName ?? session.user.username ?? 'User'}
        >
          {children}
        </AppShell>
        <Toaster richColors />
      </PinLockOverlay>
    </SessionProvider>
  )
}
