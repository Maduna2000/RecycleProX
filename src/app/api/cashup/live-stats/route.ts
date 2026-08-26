import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getLiveStats, getOpenSession } from '@/lib/services/cashUpService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { prisma } from '@/lib/db/prisma'
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
    // getLiveStats alone issues well over a dozen parallel top-level prisma
    // calls (sales/purchases/payments/loans/expenses aggregates, plus
    // getOpenSession before it) — each one independently opens its own
    // tenant-scoped transaction/connection unless already inside one (see
    // withTenantScope, src/lib/db/prisma.ts). Left unwrapped, a single
    // request to this frequently-polled (every 15-30s, from several
    // screens) endpoint could grab 14+ connections from Neon's pool at
    // once; under concurrent load from multiple tabs/pollers that
    // occasionally exhausted the pool and surfaced as an intermittent 500
    // with no clear pattern. Wrapping the whole thing in one
    // prisma.$transaction pins the tenant once and every nested prisma.*
    // call below (however deep) reuses that same connection instead of
    // opening a new one.
    const stats = await runWithRequestTenant(req, () => prisma.$transaction(async () => {
      // Scope to the actual current (open/submitted) session for this date
      // if one exists — a day can hold more than one session (separate
      // shifts), so "today's live stats" means the one currently in
      // progress, not the whole day.
      //
      // When none exists — either nobody has opened a session yet today, or
      // the last one for today has already been approved and no new one is
      // open — pass a synthetic "right now" context instead of leaving the
      // window unscoped. getSessionWindow (cashUpWindow.ts) then looks up
      // today's most recent session regardless of status and starts the
      // window at ITS closedAt; with no session at all today it falls back
      // to midnight, identical to the old unscoped behaviour. Without this,
      // the gap between a session being approved and the next one opening
      // fell back to the whole calendar day, double-counting everything the
      // just-approved session already reconciled into the Float page's
      // "Current Balance (Expected in Drawer)" figure until a new session
      // was opened and re-scoped the window correctly.
      const current = await getOpenSession(dateStr)
      const context = current
        ? { openedAt: current.openedAt, closedAt: current.closedAt }
        : { openedAt: new Date(), closedAt: null }
      return getLiveStats(sessionDate, context)
    }))
    return NextResponse.json(stats)
  } catch (err) {
    logger.error({ err, dateStr }, 'GET /api/cashup/live-stats failed')
    return NextResponse.json({ error: 'Failed to fetch live stats' }, { status: 500 })
  }
}
