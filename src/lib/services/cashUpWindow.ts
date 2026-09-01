import { prisma } from '@/lib/db/prisma'
import { getDayBoundsSAST } from '@/lib/utils/dayBounds'

export interface DateWindow {
  start: Date
  end: Date
}

// Accepts either the plain client or an open transaction client, so this can
// be called from inside recalculateApprovedCashUpForDate's own transaction
// (cashUpService.ts) without opening a second connection.
type PrismaLike = Pick<typeof prisma, 'cashUp'>

/**
 * A cash-up session's reconciliation window — the time range whose
 * transactions belong to this session and no other. It picks up exactly
 * where the truly-previous session (whatever calendar date it was opened
 * on) left off, so back-to-back shifts — including one that spans a
 * midnight rollover — chain with no gap or overlap. Only the very first
 * session a tenant has ever had falls back to [midnight SAST of its own
 * sessionDate, closedAt-or-now].
 *
 * The previous session isn't restricted to the same sessionDate: a float
 * top-up entered after midnight but before today's session is opened is
 * still part of the prior (now-closed) session's window, not today's — if
 * this looked back only within the same calendar day, that top-up would
 * fall before "midnight" (today's fallback start) and get counted twice,
 * once for the old session and once for today.
 *
 * Safe because only one session can ever be 'open' for a tenant at a time
 * (enforced by a partial unique index — see migration
 * 20260724000000_cashup_multi_session_per_day) — the previous session is
 * always closed (closedAt set, by submit or void) by the time a new session
 * is allowed to open.
 *
 * The previous session lookup skips voided ones. A voided session never
 * produced a real reconciliation — its closedAt is just whenever someone
 * got around to voiding it, which can be long after it stopped being the
 * "current" session (e.g. a shift opened and left running, voided days
 * later once someone noticed). Treating that void timestamp as a window
 * boundary would trap any float movement recorded between "should have been
 * closed" and "actually got voided" inside the dead session — invisible to
 * every live session's reconciliation, since a voided session's own figures
 * are zeroed and ignored (confirmed against real data: a top-up landed
 * while a two-day-stale session was still open, and the window boundary
 * from that session's later void swallowed it). Looking past voided
 * sessions to the last genuinely closed (submitted/approved) one restores
 * the true unbroken chain.
 */
export async function getSessionWindow(
  client: PrismaLike,
  cashUp: { sessionDate: Date; openedAt: Date; closedAt: Date | null }
): Promise<DateWindow> {
  const { start: dayStart } = getDayBoundsSAST(cashUp.sessionDate)
  const prev = await client.cashUp.findFirst({
    where:   { openedAt: { lt: cashUp.openedAt }, status: { not: 'voided' } },
    orderBy: { openedAt: 'desc' },
    select:  { closedAt: true },
  })
  return {
    start: prev?.closedAt ?? dayStart,
    end:   cashUp.closedAt ?? new Date(),
  }
}
