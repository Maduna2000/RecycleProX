import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getProfitAndLoss } from '@/lib/services/ledgerReportService'

/** GET /api/ledger/profit-loss?from=YYYY-MM-DD&to=YYYY-MM-DD. Admin only. */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to params required (YYYY-MM-DD)' }, { status: 400 })
  }

  try {
    const report = await runWithRequestTenant(req, () => getProfitAndLoss(from, to))
    return NextResponse.json(report)
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/profit-loss failed')
    return NextResponse.json({ error: 'Failed to generate P&L' }, { status: 500 })
  }
}
