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
 * transactions belong to this session and no other. For the first session
 * of a calendar day this is [midnight SAST, closedAt-or-now]. For a later
 * same-day session (a second shift) it picks up exactly where the previous
 * same-day session left off, so multiple shifts in one day chain
 * back-to-back with no gap or overlap.
 *
 * Safe because only one session can ever be 'open' for a tenant at a time
 * (enforced by a partial unique index — see migration
 * 20260724000000_cashup_multi_session_per_day) — a same-day predecessor is
 * always closed (closedAt set, by submit or void) by the time a new session
 * is allowed to open.
 */
export async function getSessionWindow(
  client: PrismaLike,
  cashUp: { sessionDate: Date; openedAt: Date; closedAt: Date | null }
): Promise<DateWindow> {
  const { start: dayStart } = getDayBoundsSAST(cashUp.sessionDate)
  const prevSameDay = await client.cashUp.findFirst({
    where:   { sessionDate: cashUp.sessionDate, openedAt: { lt: cashUp.openedAt } },
    orderBy: { openedAt: 'desc' },
    select:  { closedAt: true },
  })
  return {
    start: prevSameDay?.closedAt ?? dayStart,
    end:   cashUp.closedAt ?? new Date(),
  }
}
