import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getBalanceSheet } from '@/lib/services/ledgerReportService'
import { todaySASTDateStr } from '@/lib/utils/dayBounds'

/** GET /api/ledger/balance-sheet?asOf=YYYY-MM-DD — Assets = Liabilities + Equity. Admin only. */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const asOf = req.nextUrl.searchParams.get('asOf') ?? todaySASTDateStr()

  try {
    const report = await runWithRequestTenant(req, () => getBalanceSheet(asOf))
    return NextResponse.json(report)
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/balance-sheet failed')
    return NextResponse.json({ error: 'Failed to generate balance sheet' }, { status: 500 })
  }
}
