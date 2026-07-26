import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getLiveStats, getOpenSession } from '@/lib/services/cashUpService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

// GET /api/cashup/live-stats?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const dateStr = searchParams.get('date')
  if (!dateStr) return NextResponse.json({ error: 'date param required' }, { status: 400 })

  const [y, m, d] = dateStr.split('-').map(Number)
  const sessionDate = new Date(y!, m! - 1, d!)

  try {
    const stats = await runWithRequestTenant(req, async () => {
      // Scope to the actual current (open/submitted) session for this date
      // if one exists — a day can hold more than one session (separate
      // shifts), so "today's live stats" means the one currently in
      // progress, not the whole day. Falls back to the whole day when no
      // session has been opened yet (the pre-open live preview).
      const current = await getOpenSession(dateStr)
      return getLiveStats(sessionDate, current ? { openedAt: current.openedAt, closedAt: current.closedAt } : undefined)
    })
    return NextResponse.json(stats)
  } catch (err) {
    logger.error({ err, dateStr }, 'GET /api/cashup/live-stats failed')
    return NextResponse.json({ error: 'Failed to fetch live stats' }, { status: 500 })
  }
}
