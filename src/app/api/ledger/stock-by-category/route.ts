import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getStockValueByCategory } from '@/lib/services/ledgerReportService'

/** GET /api/ledger/stock-by-category — current stock on hand, valued by category. Admin only. */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  try {
    const report = await runWithRequestTenant(req, () => getStockValueByCategory())
    return NextResponse.json(report)
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/stock-by-category failed')
    return NextResponse.json({ error: 'Failed to generate stock-by-category report' }, { status: 500 })
  }
}
