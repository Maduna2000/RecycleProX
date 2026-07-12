import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { AppShell } from '@/components/layout/AppShell'
import { PinLockOverlay } from '@/components/PinLockOverlay'
import { LicenseGate } from '@/components/LicenseGate'
import { OfflineProvider } from '@/components/OfflineProvider'
import { Toaster } from '@/components/ui/sonner'
import { WindowedContent } from '@/components/layout/WindowedContent'

export default async function ModulesLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <OfflineProvider>
        <LicenseGate>
          <PinLockOverlay>
            <AppShell
              role={session.user.role}
              fullName={session.user.fullName ?? session.user.username ?? 'User'}
            >
              <WindowedContent>
                {children}
              </WindowedContent>
            </AppShell>
            <Toaster richColors />
          </PinLockOverlay>
        </LicenseGate>
      </OfflineProvider>
    </SessionProvider>
  )
}
