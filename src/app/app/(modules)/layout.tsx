import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { AppShell } from '@/components/layout/AppShell'
import { BannerBar } from '@/components/BannerBar'
import { PinLockOverlay } from '@/components/PinLockOverlay'
import { LicenseGate } from '@/components/LicenseGate'
import { OfflineProvider } from '@/components/OfflineProvider'
import { Toaster } from '@/components/ui/sonner'
import { WindowedContent } from '@/components/layout/WindowedContent'
import { fetchActiveBanners } from '@/lib/services/bannerClient'

export default async function ModulesLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  // No Portal-managed company for the default/legacy tenant (no tenantSlug)
  // — nothing to fetch banners for.
  const banners = session.user.tenantSlug
    ? await fetchActiveBanners(session.user.tenantSlug)
    : []

  return (
    <SessionProvider session={session}>
      <OfflineProvider>
        <BannerBar banners={banners} />
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
