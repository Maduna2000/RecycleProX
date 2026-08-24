import { offlineDB } from '../db'

/**
 * Float HISTORY fetcher (GET /api/float — last 30 CashFloat rows) — uses the
 * fully-replicated `cashFloats` table. Two approximations versus the live
 * listFloats():
 *  - `currentBalance` falls back to closingAmount (or openingAmount if still
 *    open) rather than opening + top-ups - withdrawals — FloatMovement rows
 *    aren't replicated (Float's live movements list is cache-aside, see the
 *    "Desktop offline mode" plan), so this is only approximate for the one
 *    still-open entry, if any; every closed entry is exact.
 *  - `canReverse` defaults to false rather than guessing yes: it depends on
 *    a live check this replica can't safely evaluate offline, and disabling
 *    the action is the safe direction to be wrong in.
 */
export async function floatHistoryFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch {
    const all = await offlineDB.cashFloats.toArray()
    all.sort((a, b) => new Date(b.floatDate).getTime() - new Date(a.floatDate).getTime())
    return all.slice(0, 30).map((f, i) => ({
      id: f.id,
      floatDate: f.floatDate,
      openingAmount: f.openingAmount,
      closingAmount: f.closingAmount ?? null,
      currentBalance: f.closingAmount ?? f.openingAmount,
      notes: f.notes ?? null,
      createdAt: f.createdAt,
      isLastEntry: i === 0,
      canReverse: false,
    }))
  }
}
