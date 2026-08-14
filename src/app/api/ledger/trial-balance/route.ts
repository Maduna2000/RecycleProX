import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getTrialBalance } from '@/lib/services/ledgerReportService'
import { todaySASTDateStr } from '@/lib/utils/dayBounds'

/** GET /api/ledger/trial-balance?asOf=YYYY-MM-DD — every account with activity, own-lines only. Admin only. */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const asOf = req.nextUrl.searchParams.get('asOf') ?? todaySASTDateStr()

  try {
    const report = await runWithRequestTenant(req, () => getTrialBalance(asOf))
    return NextResponse.json(report)
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/trial-balance failed')
    return NextResponse.json({ error: 'Failed to generate trial balance' }, { status: 500 })
  }
}
