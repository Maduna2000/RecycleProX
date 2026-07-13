import logger from '@/lib/logger'

export interface ActiveBanner {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'danger' | 'billing' | 'maintenance'
  isDismissible: boolean
  ctaText: string | null
  ctaLink: string | null
}

// Calls the Portal's read side of the banner system (banners/active/route.ts)
// — companySlug + shared secret, the same auth path Desktop uses with its
// device token. This was the one real gap in the banner system: it had a
// working publish flow and a working read endpoint, but nothing on Web ever
// called it. Banners are informational only, never load-bearing, so any
// failure here degrades to "no banners shown" rather than surfacing an
// error anywhere in the app.
export async function fetchActiveBanners(companySlug: string): Promise<ActiveBanner[]> {
  const baseUrl = process.env.RENOVO_PORTAL_BASE_URL
  const secret = process.env.INTERNAL_API_SHARED_SECRET
  if (!baseUrl || !secret) return []

  try {
    const res = await fetch(`${baseUrl}/api/banners/active?companySlug=${encodeURIComponent(companySlug)}`, {
      headers: { 'x-internal-secret': secret },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.banners ?? []
  } catch (err) {
    logger.warn({ err, companySlug }, 'Failed to fetch active banners')
    return []
  }
}
