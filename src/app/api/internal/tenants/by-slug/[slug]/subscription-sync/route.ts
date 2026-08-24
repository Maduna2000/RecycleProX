import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import logger from '@/lib/logger'
import { SubscriptionSyncSchema } from '@/lib/schemas/internal'
import { authorizeInternalRequest } from '@/lib/internal/authorizeInternalRequest'
import { registryPrisma } from '@/lib/db/registryPrisma'

// Called by the Portal's webSyncClient.ts (on payment verification, and via
// its daily cron as a safety net) to push a tenant's current subscription
// due-date/status onto this Tenant row. The (modules) layout reads these
// fields directly on every page render — no live call back to the Portal.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  if (!authorizeInternalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = SubscriptionSyncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const graceEndsAt = new Date(parsed.data.subscriptionEndDate)
  graceEndsAt.setDate(graceEndsAt.getDate() + parsed.data.gracePeriodDays)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (registryPrisma as any).tenant.update({
      where: { companySlug: params.slug },
      data: {
        subscriptionStatus: parsed.data.subscriptionStatus,
        subscriptionEndDate: parsed.data.subscriptionEndDate,
        gracePeriodDays: parsed.data.gracePeriodDays,
        graceEndsAt,
      },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err, companySlug: params.slug }, 'Subscription sync failed — unknown tenant?')
    return NextResponse.json({ error: 'Unknown tenant' }, { status: 404 })
  }
}
