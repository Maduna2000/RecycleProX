import { readCustomersOffline } from '../readers/customers'

export async function customersListFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch {
    const params = new URL(url, 'http://local').searchParams
    const num = (v: string | null) => (v ? Number(v) : undefined)
    const bool = (v: string | null) => (v === null ? undefined : v === 'true')
    return readCustomersOffline({
      search: params.get('search') ?? undefined,
      type: params.get('type') ?? undefined,
      blacklisted: params.has('blacklisted') ? bool(params.get('blacklisted')) : undefined,
      isActive: params.has('isActive') ? bool(params.get('isActive')) : undefined,
      dealerCategory: params.get('dealerCategory') ?? undefined,
      primaryFunction: params.get('primaryFunction') ?? undefined,
      priceGroupId: params.get('priceGroupId') ?? undefined,
      page: num(params.get('page')),
      limit: num(params.get('limit')),
    })
  }
}
