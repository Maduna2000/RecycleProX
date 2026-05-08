import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getDateRangeReport } from '@/lib/services/reportService'

/**
 * GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns aggregated metrics for the date range.
 * Manager/admin only.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const fromParam = searchParams.get('from')
  const toParam   = searchParams.get('to')

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'from and to params required (YYYY-MM-DD)' }, { status: 400 })
  }

  const [fy, fm, fd] = fromParam.split('-').map(Number)
  const [ty, tm, td] = toParam.split('-').map(Number)
  const from = new Date(fy!, fm! - 1, fd!); from.setHours(0, 0, 0, 0)
  const to   = new Date(ty!, tm! - 1, td!); to.setHours(23, 59, 59, 999)

  try {
    const report = await getDateRangeReport(from, to)
    return NextResponse.json({ range: { from: fromParam, to: toParam }, ...report })
  } catch (err) {
    logger.error({ err }, 'GET /api/reports failed')
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
