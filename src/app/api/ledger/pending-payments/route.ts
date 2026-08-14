import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getPendingSalesPayments } from '@/lib/services/ledgerReportService'

/** GET /api/ledger/pending-payments — real unpaid Sales, expected payments still to be received. Admin only. */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  try {
    const result = await runWithRequestTenant(req, () => getPendingSalesPayments())
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/pending-payments failed')
    return NextResponse.json({ error: 'Failed to load pending payments' }, { status: 500 })
  }
}
