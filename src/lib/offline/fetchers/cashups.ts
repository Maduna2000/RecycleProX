import { readCashUpHistoryOffline } from '../readers/cashups'

/**
 * Cash-up HISTORY fetcher (GET /api/cashup/history — the Previous Reports
 * modal) only — the "today" open-session query goes through the generic
 * response-cache fetcher instead (src/lib/offline/responseCache.ts), see the
 * "Desktop offline mode" plan's note on why that stays cache-aside rather
 * than a local replica.
 */
export async function cashUpHistoryFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch {
    const params = new URL(url, 'http://local').searchParams
    const num = (v: string | null) => (v ? Number(v) : undefined)
    const statusParam = params.get('status')
    return readCashUpHistoryOffline({
      skip: num(params.get('skip')),
      take: num(params.get('take')),
      status: statusParam ? statusParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    })
  }
}
