import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getCurrentCashOnHand } from '@/lib/services/cashUpService'
import { getPostedCashAndBankBalances } from '@/lib/services/ledgerReportService'
import { todaySASTDateStr } from '@/lib/utils/dayBounds'
import Decimal from 'decimal.js'

/**
 * GET /api/ledger/cash-on-hand?date=YYYY-MM-DD — the real-time cash-in-drawer
 * figure from the Cashup module (Opening Balance + today's live cash
 * movements), the same number the Cashup page shows as "Cal Float (Expected
 * in Drawer)". The Ledger dashboard reads this instead of deriving its own
 * figure from posted journal entries.
 *
 * Also returns the posted ledger's own Cash/Bank balances alongside it, so the
 * dashboard can show a reconciliation between the operational figure and what
 * has actually been posted to the general ledger. Admin only.
 */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const date = req.nextUrl.searchParams.get('date') ?? todaySASTDateStr()

  try {
    const [cashOnHand, posted] = await runWithRequestTenant(req, () =>
      Promise.all([getCurrentCashOnHand(date), getPostedCashAndBankBalances(date)])
    )
    const variance = new Decimal(posted.cash).minus(cashOnHand).toFixed(2)
    return NextResponse.json({
      date,
      cashOnHand,
      ledgerCash: posted.cash,
      ledgerBank: posted.bank,
      variance,
    })
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/cash-on-hand failed')
    return NextResponse.json({ error: 'Failed to compute cash on hand' }, { status: 500 })
  }
}
