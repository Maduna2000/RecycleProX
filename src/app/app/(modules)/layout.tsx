import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { AppShell } from '@/components/layout/AppShell'
import { BannerBar } from '@/components/BannerBar'
import { PinLockOverlay } from '@/components/PinLockOverlay'
import { LicenseGate } from '@/components/LicenseGate'
import { SubscriptionGate } from '@/components/SubscriptionGate'
import { OfflineProvider } from '@/components/OfflineProvider'
import { Toaster } from '@/components/ui/sonner'
import { WindowedContent } from '@/components/layout/WindowedContent'
import { fetchActiveBanners } from '@/lib/services/bannerClient'
import { getTenantSubscriptionAccess } from '@/lib/subscriptionAccess'

export default async function ModulesLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  // No Portal-managed company for the default/legacy tenant (no tenantSlug)
  // — nothing to fetch banners for, and nothing to lock.
  const [banners, subscriptionAccess] = session.user.tenantSlug
    ? await Promise.all([
        fetchActiveBanners(session.user.tenantSlug),
        getTenantSubscriptionAccess(session.user.tenantSlug),
      ])
    : [[], { blocked: false, banner: null, dueDateLabel: null }]

  const allBanners = subscriptionAccess.banner ? [subscriptionAccess.banner, ...banners] : banners

  return (
    <SessionProvider session={session}>
      <OfflineProvider>
        <BannerBar banners={allBanners} />
        <SubscriptionGate blocked={subscriptionAccess.blocked} dueDateLabel={subscriptionAccess.dueDateLabel}>
          <LicenseGate>
            <PinLockOverlay>
              <AppShell
                role={session.user.role}
                fullName={session.user.fullName ?? session.user.username ?? 'User'}
                allowedModules={session.user.allowedModules}
              >
                <WindowedContent>
                  {children}
                </WindowedContent>
              </AppShell>
              <Toaster richColors />
            </PinLockOverlay>
          </LicenseGate>
        </SubscriptionGate>
      </OfflineProvider>
    </SessionProvider>
  )
}
