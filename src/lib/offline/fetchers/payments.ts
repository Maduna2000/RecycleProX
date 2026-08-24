import { readPaymentsOffline } from '../readers/payments'

export async function paymentsListFetcher(url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } catch {
    const params = new URL(url, 'http://local').searchParams
    const num = (v: string | null) => (v ? Number(v) : undefined)
    return readPaymentsOffline({
      customerId: params.get('customerId') ?? undefined,
      paymentMethod: params.get('paymentMethod') ?? undefined,
      source: (params.get('source') as 'sale' | 'purchase' | null) ?? undefined,
      search: params.get('search') ?? undefined,
      includeVoided: params.get('includeVoided') === 'true',
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
      page: num(params.get('page')),
      pageSize: num(params.get('pageSize')),
    })
  }
}
