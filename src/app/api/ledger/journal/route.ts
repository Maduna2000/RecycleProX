import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getJournal } from '@/lib/services/ledgerReportService'
import { todaySASTDateStr } from '@/lib/utils/dayBounds'

/** GET /api/ledger/journal?from=&to=&sourceType=&page= — raw chronological feed of posted entries. Admin only. */
export async function GET(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const today = todaySASTDateStr()
  const from = req.nextUrl.searchParams.get('from') ?? `${today.slice(0, 7)}-01`
  const to = req.nextUrl.searchParams.get('to') ?? today
  const sourceType = req.nextUrl.searchParams.get('sourceType') ?? undefined
  const page = Number(req.nextUrl.searchParams.get('page') ?? '1')

  try {
    const report = await runWithRequestTenant(req, () => getJournal({ fromLabel: from, toLabel: to, sourceType, page }))
    return NextResponse.json(report)
  } catch (err) {
    logger.error({ err }, 'GET /api/ledger/journal failed')
    return NextResponse.json({ error: 'Failed to load journal' }, { status: 500 })
  }
}
