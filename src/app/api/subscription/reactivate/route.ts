import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { registryPrisma } from '@/lib/db/registryPrisma'

// Submitted from SubscriptionGate.tsx once a locked-out tenant user types in
// the activation key their platform finance admin gave them after
// verifying payment. Proxies the code to the Portal's own reactivate
// endpoint (it owns the real Company.reactivationCode) and, on success,
// writes the fresh subscription snapshot straight onto this Tenant row —
// the same shape the Portal's scheduled sync would eventually push, just
// applied immediately instead of waiting for it.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.tenantSlug) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!code) {
    return NextResponse.json({ error: 'Enter an activation key' }, { status: 400 })
  }

  const baseUrl = process.env.RENOVO_PORTAL_BASE_URL
  const secret = process.env.INTERNAL_API_SHARED_SECRET
  if (!baseUrl || !secret) {
    logger.error('RENOVO_PORTAL_BASE_URL / INTERNAL_API_SHARED_SECRET not configured')
    return NextResponse.json({ error: 'Reactivation is not available right now' }, { status: 500 })
  }

  try {
    const res = await fetch(`${baseUrl}/api/internal/companies/by-slug/${session.user.tenantSlug}/reactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ code }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return NextResponse.json({ error: typeof data.error === 'string' ? data.error : 'Invalid activation key' }, { status: res.status === 404 ? 400 : res.status })
    }

    const result = await res.json()
    const graceEndsAt = result.graceEndsAt ? new Date(result.graceEndsAt) : null
    const subscriptionEndDate = result.dueDate ? new Date(result.dueDate) : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (registryPrisma as any).tenant.update({
      where: { companySlug: session.user.tenantSlug },
      data: {
        subscriptionStatus: result.effectiveStatus,
        subscriptionEndDate,
        graceEndsAt,
        featureFlags: result.featureFlags,
      },
    })

    logger.info({ tenantSlug: session.user.tenantSlug }, 'Subscription reactivated')
    return NextResponse.json({ success: true, allowed: result.allowed })
  } catch (err) {
    logger.error({ err, tenantSlug: session.user.tenantSlug }, 'Reactivation call to Portal failed')
    return NextResponse.json({ error: 'Could not reach the licensing server — try again shortly' }, { status: 502 })
  }
}
