import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { activatePriceList } from '@/lib/services/priceListService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

/** POST /api/price-lists/[id]/activate — make this the list shown on the new-purchase screen. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
  }

  try {
    const priceList = await runWithRequestTenant(req, () => activatePriceList(params.id, session.user.id))
    return NextResponse.json(priceList)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    logger.error({ err, priceListId: params.id }, 'POST /api/price-lists/[id]/activate failed')
    if (message === 'Price list not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to activate price list' }, { status: 500 })
  }
}
