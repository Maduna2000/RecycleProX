import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getCancelledReport } from '@/lib/services/reportService'

// GET /api/reports/cancelled?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp      = req.nextUrl.searchParams
  const fromStr = sp.get('from')
  const toStr   = sp.get('to')

  if (!fromStr || !toStr) {
    return NextResponse.json({ error: 'from and to query params are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const from = new Date(fromStr); from.setHours(0, 0, 0, 0)
  const to   = new Date(toStr);   to.setHours(23, 59, 59, 999)

  try {
    const result = await getCancelledReport(from, to)
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/reports/cancelled failed')
    return NextResponse.json({ error: 'Failed to generate cancelled report' }, { status: 500 })
  }
}
