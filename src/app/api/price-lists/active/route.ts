import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getActivePriceListForCustomer } from '@/lib/services/priceListService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

/**
 * GET /api/price-lists/active?priceGroupId= — the list shown on the
 * new-purchase screen for the given customer's price group (omit for no
 * customer selected / a Casual customer — both fall back to whichever
 * group is flagged isDefault). Null when nothing resolves.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const priceGroupId = req.nextUrl.searchParams.get('priceGroupId')

  try {
    const priceList = await runWithRequestTenant(req, () => getActivePriceListForCustomer(priceGroupId))
    return NextResponse.json({ priceList })
  } catch (err) {
    logger.error({ err }, 'GET /api/price-lists/active failed')
    return NextResponse.json({ error: 'Failed to load active price list' }, { status: 500 })
  }
}
