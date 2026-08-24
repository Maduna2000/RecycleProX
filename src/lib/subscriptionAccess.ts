import type { ActiveBanner } from '@/lib/services/bannerClient'
import { registryPrisma } from '@/lib/db/registryPrisma'
import logger from '@/lib/logger'

export interface TenantSubscriptionFields {
  subscriptionEndDate: Date | null
  graceEndsAt: Date | null
}

export interface SubscriptionAccess {
  /** True once past graceEndsAt (subscriptionEndDate + the subscription's gracePeriodDays) — hard-locks the app. */
  blocked: boolean
  /** A dismissible countdown banner for the 7 days leading up to subscriptionEndDate, or null outside that window. */
  banner: ActiveBanner | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const COUNTDOWN_WINDOW_DAYS = 7

// Pure — takes whatever the layout read off the Tenant row (synced from the
// Portal, see subscription-sync/route.ts) and derives the two pieces of UI
// this drives: the pre-expiry countdown banner and the post-grace lockout.
// No network call here; the fields are already local.
export function computeSubscriptionAccess(tenant: TenantSubscriptionFields): SubscriptionAccess {
  if (!tenant.subscriptionEndDate) return { blocked: false, banner: null }

  const now = new Date()
  const blocked = !!tenant.graceEndsAt && now > tenant.graceEndsAt

  const daysUntilDue = Math.ceil((tenant.subscriptionEndDate.getTime() - now.getTime()) / MS_PER_DAY)
  const dueDateLabel = tenant.subscriptionEndDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })

  let banner: ActiveBanner | null = null
  if (!blocked && daysUntilDue >= 0 && daysUntilDue <= COUNTDOWN_WINDOW_DAYS) {
    banner = {
      id: 'subscription-expiry-countdown',
      title: daysUntilDue === 0 ? 'Your subscription expires today' : `Your subscription expires in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`,
      message: `Renew by ${dueDateLabel} to avoid losing access.`,
      type: 'billing',
      isDismissible: true,
      ctaText: null,
      ctaLink: null,
    }
  }

  return { blocked, banner }
}

export interface TenantSubscriptionAccess extends SubscriptionAccess {
  dueDateLabel: string | null
}

const FAIL_OPEN_RESULT: TenantSubscriptionAccess = { blocked: false, banner: null, dueDateLabel: null }

// Shared by both authenticated layouts — one Tenant read + one pure compute,
// so the countdown banner and the lockout gate can never disagree with each
// other about whether access is currently blocked. Never throws: this reads
// straight off `Tenant`, the same table `auth()` already depends on for
// login to work at all, so an actual DB outage isn't a new failure mode —
// but a bad deploy (e.g. this migration not yet applied) hitting an unknown
// column here shouldn't be able to 500 every page in the app. Failing open
// (not blocked) is the only safe default for a bug in this code path
// specifically, since failing closed would risk locking out every paying
// tenant at once over a code issue, not a real expiry.
export async function getTenantSubscriptionAccess(tenantSlug: string): Promise<TenantSubscriptionAccess> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant = await (registryPrisma as any).tenant.findUnique({
      where: { companySlug: tenantSlug },
      select: { subscriptionEndDate: true, graceEndsAt: true },
    })
    if (!tenant) return FAIL_OPEN_RESULT

    const access = computeSubscriptionAccess(tenant)
    const dueDateLabel = tenant.subscriptionEndDate
      ? (tenant.subscriptionEndDate as Date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
      : null

    return { ...access, dueDateLabel }
  } catch (err) {
    logger.error({ err, tenantSlug }, 'Failed to read subscription access — failing open')
    return FAIL_OPEN_RESULT
  }
}
