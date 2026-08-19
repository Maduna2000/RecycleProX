import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getCurrentCashOnHand } from '@/lib/services/cashUpService'
import { todaySASTDateStr } from '@/lib/utils/dayBounds'

/**
 * GET /api/ledger/cash-on-hand?date=YYYY-MM-DD — the real-time cash-in-drawer
 * figure from the Cashup module (Opening Balance + today's live cash
 * movements), the same number the Cashup page shows as "Cal Float (Expected
 * in Drawer)". The Ledger dashboard reads this instead of deriving its own
 * figure from posted journal entries. Admin only.
 */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const date = req.nextUrl.searchParams.get('date') ?? todaySASTDateStr()

  try {
    const cashOnHand = await runWithRequestTenant(req, () => getCurrentCashOnHand(date))
    return NextResponse.json({ date, cashOnHand })
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/cash-on-hand failed')
    return NextResponse.json({ error: 'Failed to compute cash on hand' }, { status: 500 })
  }
}
