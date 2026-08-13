import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { duplicatePriceList } from '@/lib/services/priceListService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

/** POST /api/price-lists/[id]/duplicate — copy a list (re-dated to today, not active). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
  }

  try {
    const copy = await runWithRequestTenant(req, () => duplicatePriceList(params.id, session.user.id))
    return NextResponse.json(copy, { status: 201 })
  } catch (err) {
    logger.error({ err, priceListId: params.id }, 'POST /api/price-lists/[id]/duplicate failed')
    return NextResponse.json({ error: 'Failed to duplicate price list' }, { status: 500 })
  }
}
