import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getEftAwaitingConfirmation } from '@/lib/services/ledgerReportService'

/** GET /api/ledger/eft-receivables — completed EFT sales sitting in Accounts Receivable, awaiting bank confirmation. Admin only. */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  try {
    const result = await runWithRequestTenant(req, () => getEftAwaitingConfirmation())
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/eft-receivables failed')
    return NextResponse.json({ error: 'Failed to load EFT receivables' }, { status: 500 })
  }
}
