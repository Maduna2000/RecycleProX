import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { GoodsSearchSchema } from '@/lib/schemas/police'
import { searchGoods, PoliceVisitNotActiveError } from '@/lib/services/policeVisitService'

/**
 * GET /api/police-search/goods?visitId=&productId=&from=&to=&minQuantity=
 * Goods search: all purchase lines of a product for an active inspection session.
 * Logged server-side in the same transaction as the query.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const parsed = GoodsSearchSchema.safeParse({
    visitId:     sp.get('visitId'),
    productId:   sp.get('productId'),
    from:        sp.get('from')        ?? undefined,
    to:          sp.get('to')          ?? undefined,
    minQuantity: sp.get('minQuantity') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const result = await searchGoods(parsed.data.visitId, {
      productId:   parsed.data.productId,
      from:        parsed.data.from,
      to:          parsed.data.to,
      minQuantity: parsed.data.minQuantity,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof PoliceVisitNotActiveError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: 409 })
    }
    logger.error({ err }, 'GET /api/police-search/goods failed')
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
