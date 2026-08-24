import { readSalesOffline, readSaleDetailOffline } from '../readers/sales'

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

export async function salesListFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch {
    return readSalesOffline(parseListParams(url))
  }
}

export async function saleDetailFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch (err) {
    const id = url.split('/').filter(Boolean).pop()!
    const detail = await readSaleDetailOffline(id)
    if (!detail) throw err
    return detail
  }
}
