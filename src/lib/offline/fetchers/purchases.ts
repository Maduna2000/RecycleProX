import { readPurchasesOffline, readPurchaseDetailOffline } from '../readers/purchases'

/**
 * Drop-in SWR fetcher replacements for the Purchases module — live fetch on
 * success, falls back to the local offline replica on any failure. Same
 * response shape as the live API either way, so the page's own code doesn't
 * change. See the "Desktop offline mode" plan.
 */

function parseListParams(url: string) {
  const params = new URL(url, 'http://local').searchParams
  const num = (v: string | null) => (v ? Number(v) : undefined)
  return {
    status: params.get('status') ?? undefined,
    paymentMethod: params.get('paymentMethod') ?? undefined,
    search: params.get('search') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    page: num(params.get('page')),
    pageSize: num(params.get('pageSize')),
  }
}

export async function purchasesListFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch {
    return readPurchasesOffline(parseListParams(url))
  }
}

export async function purchaseDetailFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch (err) {
    const id = url.split('/').filter(Boolean).pop()!
    const detail = await readPurchaseDetailOffline(id)
    if (!detail) throw err
    return detail
  }
}
