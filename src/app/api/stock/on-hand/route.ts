import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getStockOnHand } from '@/lib/services/stockService'
import { getDayBoundsSAST, sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'

/**
 * GET /api/stock/on-hand?productId=&asAt=YYYY-MM-DD
 * `asAt` returns levels as at the end of that SAST calendar day; omit for live.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const productId = req.nextUrl.searchParams.get('productId') ?? undefined
  const asAtParam = req.nextUrl.searchParams.get('asAt') ?? undefined

  if (asAtParam && !/^\d{4}-\d{2}-\d{2}$/.test(asAtParam)) {
    return NextResponse.json({ error: 'Invalid asAt date (YYYY-MM-DD required)' }, { status: 400 })
  }

  try {
    const asAt = asAtParam ? getDayBoundsSAST(sastDateLabelToUTCDate(asAtParam)).end : undefined
    const stock = await getStockOnHand(productId, asAt)
    return NextResponse.json({ stock })
  } catch (err) {
    logger.error({ err }, 'GET /api/stock/on-hand failed')
    return NextResponse.json({ error: 'Failed to fetch stock levels' }, { status: 500 })
  }
}
