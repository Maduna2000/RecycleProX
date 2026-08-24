import { readStockMovementsOffline, readStockGridOffline } from '../readers/stock'
import type { StockPeriod } from '@/lib/utils/stock-periods'

export async function stockMovementsFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch {
    const params = new URL(url, 'http://local').searchParams
    const num = (v: string | null) => (v ? Number(v) : undefined)
    return readStockMovementsOffline({
      productId: params.get('productId') ?? undefined,
      direction: (params.get('direction') as 'in' | 'out' | null) ?? undefined,
      source: params.get('source') ?? undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
      page: num(params.get('page')),
      pageSize: num(params.get('pageSize')),
    })
  }
}

export async function stockGridFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch {
    const params = new URL(url, 'http://local').searchParams
    const period = (params.get('period') as StockPeriod | null) ?? 'daily'
    const date = params.get('date') ?? new Date().toISOString().slice(0, 10)
    const category = params.get('category') ?? undefined
    return readStockGridOffline(period, date, category)
  }
}
