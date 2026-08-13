import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getActivePriceList } from '@/lib/services/priceListService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

/** GET /api/price-lists/active — the list shown on the new-purchase screen (null when none set). */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const priceList = await runWithRequestTenant(req, () => getActivePriceList())
    return NextResponse.json({ priceList })
  } catch (err) {
    logger.error({ err }, 'GET /api/price-lists/active failed')
    return NextResponse.json({ error: 'Failed to load active price list' }, { status: 500 })
  }
}
