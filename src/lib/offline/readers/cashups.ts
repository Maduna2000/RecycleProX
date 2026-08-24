import { offlineDB } from '../db'

/**
 * Offline reader for Cash-up session HISTORY — mirrors getCashUpHistory()'s
 * shape (src/lib/services/cashUpService.ts), which is what the Previous
 * Reports modal (GET /api/cashup/history) actually consumes.
 */
export async function readCashUpHistoryOffline(opts: { skip?: number; take?: number; status?: string[] } = {}) {
  const skip = opts.skip ?? 0
  const take = opts.take ?? 50
  const status = opts.status ?? ['submitted', 'approved']

  const all = await offlineDB.cashUps.filter((c) => status.includes(c.status)).toArray()
  all.sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime())

  const sessions = all.slice(skip, skip + take).map((c) => ({
    id: c.id,
    sessionDate: c.sessionDate,
    status: c.status,
    currency: c.currency,
    variance: c.variance ?? null,
    openingBalance: c.openingBalance,
    declaredCash: c.declaredCash ?? null,
    submittedAt: c.closedAt ?? null,
    approvedAt: c.approvedAt ?? null,
  }))

  return { sessions, total: all.length, skip, take }
}
