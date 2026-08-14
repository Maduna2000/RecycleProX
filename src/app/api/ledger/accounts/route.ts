import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getChartOfAccounts } from '@/lib/services/ledgerReportService'
import { todaySASTDateStr } from '@/lib/utils/dayBounds'

/** GET /api/ledger/accounts?asOf=YYYY-MM-DD — Chart of Accounts tree with rolled-up balances. Admin only. */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const asOf = req.nextUrl.searchParams.get('asOf') ?? todaySASTDateStr()

  try {
    const tree = await runWithRequestTenant(req, () => getChartOfAccounts(asOf))
    return NextResponse.json({ asOf, accounts: tree })
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/accounts failed')
    return NextResponse.json({ error: 'Failed to load chart of accounts' }, { status: 500 })
  }
}
