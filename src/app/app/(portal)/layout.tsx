import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { AppShell } from '@/components/layout/AppShell'
import { BannerBar } from '@/components/BannerBar'
import { PinLockOverlay } from '@/components/PinLockOverlay'
import { OfflineProvider } from '@/components/OfflineProvider'
import { Toaster } from '@/components/ui/sonner'
import { fetchActiveBanners } from '@/lib/services/bannerClient'

// Deliberately narrower than (modules)/layout.tsx: this route wraps only
// the dashboard, which WindowedContent.tsx already special-cases as "the
// desktop, not a window" (skips window registration entirely) — so it
// stays outside LicenseGate/WindowedContent too. BannerBar is wired in here
// though, since platform banners (subscription/maintenance notices) are
// exactly as relevant on the dashboard as anywhere else in the app; its
// prior absence here was an unremarked gap, not an intentional exemption.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const banners = session.user.tenantSlug
    ? await fetchActiveBanners(session.user.tenantSlug)
    : []

  return (
    <SessionProvider session={session}>
      <OfflineProvider>
        <BannerBar banners={banners} />
        <PinLockOverlay>
          <AppShell
            role={session.user.role}
            fullName={session.user.fullName ?? session.user.username ?? 'User'}
            allowedModules={session.user.allowedModules}
          >
            {children}
          </AppShell>
          <Toaster richColors />
        </PinLockOverlay>
      </OfflineProvider>
    </SessionProvider>
  )
}
