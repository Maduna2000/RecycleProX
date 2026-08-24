import { readProductsOffline } from '../readers/products'

export async function productsListFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch {
    const params = new URL(url, 'http://local').searchParams
    const activeParam = params.get('active')
    return readProductsOffline({
      category: params.get('category') ?? undefined,
      search: params.get('search') ?? undefined,
      isActive: activeParam === 'true' ? true : activeParam === 'false' ? false : undefined,
    })
  }
}
