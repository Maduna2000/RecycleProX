import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { parseSASTDateRange } from '@/lib/utils/dayBounds'
import { getDateRangeReport } from '@/lib/services/reportService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

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

  const range = parseSASTDateRange(fromParam, toParam)
  if (!range?.from || !range.to) {
    return NextResponse.json({ error: 'Invalid date filter (YYYY-MM-DD)' }, { status: 400 })
  }
  const { from, to } = range

  try {
    const report = await runWithRequestTenant(req, () => getDateRangeReport(from, to))
    return NextResponse.json({ range: { from: fromParam, to: toParam }, ...report })
  } catch (err) {
    logger.error({ err }, 'GET /api/reports failed')
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
