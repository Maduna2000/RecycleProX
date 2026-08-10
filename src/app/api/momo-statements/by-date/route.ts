import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getMomoStatementForDate } from '@/lib/services/momoStatementService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'

// Used by the Cash-Up page to show (or prompt for) that session's MoMo
// statement without the cashier having to go find it in the full list.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dateLabel = req.nextUrl.searchParams.get('date')
  if (!dateLabel || !/^\d{4}-\d{2}-\d{2}$/.test(dateLabel)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 422 })
  }

  try {
    const statement = await runWithRequestTenant(req, () =>
      getMomoStatementForDate(sastDateLabelToUTCDate(dateLabel)))
    return NextResponse.json({ statement })
  } catch (err) {
    logger.error({ err, dateLabel }, 'GET /api/momo-statements/by-date failed')
    return NextResponse.json({ error: 'Failed to fetch MoMo statement' }, { status: 500 })
  }
}
