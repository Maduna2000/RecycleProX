import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getGeneralLedger } from '@/lib/services/ledgerReportService'
import { todaySASTDateStr } from '@/lib/utils/dayBounds'

/** GET /api/ledger/general-ledger/:accountId?from=&to= — one account's line-by-line activity with running balance. Admin only. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const { accountId } = await params
  const today = todaySASTDateStr()
  const from = req.nextUrl.searchParams.get('from') ?? `${today.slice(0, 7)}-01`
  const to = req.nextUrl.searchParams.get('to') ?? today
  const page = Number(req.nextUrl.searchParams.get('page') ?? '1') || 1

  try {
    const report = await runWithRequestTenant(req, () => getGeneralLedger(accountId, from, to, { page }))
    return NextResponse.json(report)
  } catch (err) {
    logger.error({ err, accountId }, 'GET /api/ledger/general-ledger/[accountId] failed')
    return NextResponse.json({ error: 'Failed to load general ledger' }, { status: 500 })
  }
}
