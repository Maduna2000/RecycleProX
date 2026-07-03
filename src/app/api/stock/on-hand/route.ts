import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getStockOnHand, getStockOnHandForPeriod } from '@/lib/services/stockService'
import { getDayBoundsSAST, sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'
import { getPeriodBounds, STOCK_PERIODS, type StockPeriod } from '@/lib/utils/stock-periods'

/**
 * GET /api/stock/on-hand?productId=
 *   &period=daily|weekly|mtd|yearly&date=YYYY-MM-DD  → opening/in/out/closing for the period
 *   &asAt=YYYY-MM-DD                                 → all-time levels as at end of that day
 * Omit both for live all-time levels.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const productId = params.get('productId') ?? undefined
  const periodParam = params.get('period') ?? undefined
  const dateParam = params.get('date') ?? new Date().toISOString().slice(0, 10)
  const asAtParam = params.get('asAt') ?? undefined

  if (periodParam && !STOCK_PERIODS.includes(periodParam as StockPeriod)) {
    return NextResponse.json({ error: 'Invalid period (daily|weekly|mtd|yearly)' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'Invalid date (YYYY-MM-DD required)' }, { status: 400 })
  }
  if (asAtParam && !/^\d{4}-\d{2}-\d{2}$/.test(asAtParam)) {
    return NextResponse.json({ error: 'Invalid asAt date (YYYY-MM-DD required)' }, { status: 400 })
  }

  try {
    if (periodParam) {
      const { periodStart, periodEnd } = getPeriodBounds(periodParam as StockPeriod, dateParam)
      const stock = await getStockOnHandForPeriod(periodStart, periodEnd, productId)
      return NextResponse.json({ stock })
    }
    const asAt = asAtParam ? getDayBoundsSAST(sastDateLabelToUTCDate(asAtParam)).end : undefined
    const stock = await getStockOnHand(productId, asAt)
    return NextResponse.json({ stock })
  } catch (err) {
    logger.error({ err }, 'GET /api/stock/on-hand failed')
    return NextResponse.json({ error: 'Failed to fetch stock levels' }, { status: 500 })
  }
}
