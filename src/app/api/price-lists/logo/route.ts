import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireTenantId, runWithRequestTenant } from '@/lib/db/tenantContext'
import { getSetting } from '@/lib/services/settingsService'
import { PRICE_LIST_LOGO_SETTING_KEY } from '@/lib/services/priceListService'
import { SetPriceListLogoSchema } from '@/lib/schemas/priceList'
import { getViewUrl } from '@/lib/r2'
import logger from '@/lib/logger'

/** GET /api/price-lists/logo — current saved logo key + short-lived view URL. */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const key = await runWithRequestTenant(req, () => getSetting(PRICE_LIST_LOGO_SETTING_KEY))
    const url = key ? await getViewUrl(key) : null
    return NextResponse.json({ key, url })
  } catch (err) {
    logger.error({ err }, 'GET /api/price-lists/logo failed')
    return NextResponse.json({ error: 'Failed to load logo' }, { status: 500 })
  }
}

/** PUT /api/price-lists/logo — save the R2 key of an already-uploaded logo. */
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = SetPriceListLogoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    await runWithRequestTenant(req, async () => {
      const tenantId = requireTenantId()
      await prisma.systemSettings.upsert({
        where:  { tenantId_key: { tenantId, key: PRICE_LIST_LOGO_SETTING_KEY } },
        update: { value: parsed.data.r2Key },
        create: { tenantId, key: PRICE_LIST_LOGO_SETTING_KEY, value: parsed.data.r2Key },
      })
    })
    logger.info({ userId: session.user.id, key: parsed.data.r2Key }, 'price-list-logo.set')
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'PUT /api/price-lists/logo failed')
    return NextResponse.json({ error: 'Failed to save logo' }, { status: 500 })
  }
}

/** DELETE /api/price-lists/logo — unlink the saved logo (R2 object left in place). */
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
  }

  try {
    await runWithRequestTenant(req, async () => {
      const tenantId = requireTenantId()
      await prisma.systemSettings.deleteMany({
        where: { tenantId, key: PRICE_LIST_LOGO_SETTING_KEY },
      })
    })
    logger.info({ userId: session.user.id }, 'price-list-logo.removed')
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'DELETE /api/price-lists/logo failed')
    return NextResponse.json({ error: 'Failed to remove logo' }, { status: 500 })
  }
}
