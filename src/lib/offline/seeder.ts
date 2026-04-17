import { offlineDB } from './db'

const SEED_INTERVAL_MS = 6 * 60 * 60 * 1000  // 6 hours
const META_KEY = 'lastSeededAt'

async function getLastSeededAt(): Promise<number> {
  const row = await offlineDB.meta.get(META_KEY)
  return row ? Number(row.value) : 0
}

async function setLastSeededAt() {
  await offlineDB.meta.put({ key: META_KEY, value: String(Date.now()) })
}

async function seedProducts() {
  const res = await fetch('/api/products?limit=500&active=true')
  if (!res.ok) return
  const data = await res.json()
  const products = Array.isArray(data) ? data : data.products ?? []
  await offlineDB.products.bulkPut(
    products.map((p: Record<string, unknown>) => ({
      id: p.id as string,
      code: p.code as string,
      name: p.name as string,
      category: p.category as string,
      unit: p.unit as string,
      defaultBuyPrice: String(p.defaultBuyPrice),
      defaultSellPrice: String(p.defaultSellPrice),
      isActive: Boolean(p.isActive),
      sortOrder: Number(p.sortOrder ?? 0),
    }))
  )
}

async function seedCustomers() {
  // Fetch in pages of 200 until exhausted
  let page = 1
  const pageSize = 200
  while (true) {
    const res = await fetch(`/api/customers?limit=${pageSize}&page=${page}`)
    if (!res.ok) break
    const data = await res.json()
    const customers = Array.isArray(data) ? data : data.customers ?? []
    if (customers.length === 0) break

    await offlineDB.customers.bulkPut(
      customers.map((c: Record<string, unknown>) => ({
        id: c.id as string,
        idNumber: c.idNumber as string,
        firstName: c.firstName as string,
        lastName: c.lastName as string,
        companyName: c.companyName as string | undefined,
        phone: c.phone as string,
        customerType: c.customerType as string,
        primaryFunction: c.primaryFunction as string,
        blacklisted: Boolean(c.blacklisted),
        isActive: Boolean(c.isActive),
        priceGroupId: c.priceGroupId as string | undefined,
      }))
    )

    if (customers.length < pageSize) break
    page++
  }
}

async function seedPriceGroups() {
  const res = await fetch('/api/price-groups')
  if (!res.ok) return
  const data = await res.json()
  const groups = Array.isArray(data) ? data : data.priceGroups ?? []

  await offlineDB.priceGroups.bulkPut(
    groups.map((g: Record<string, unknown>) => ({
      id: g.id as string,
      name: g.name as string,
      isDefault: Boolean(g.isDefault),
      isActive: Boolean(g.isActive),
    }))
  )

  // Seed overrides per group
  const overrides: Array<{
    id: string; priceGroupId: string; productId: string
    buyPrice: string; sellPrice: string
  }> = []
  for (const g of groups) {
    const ov = (g as Record<string, unknown>).overrides
    if (Array.isArray(ov)) {
      for (const o of ov) {
        overrides.push({
          id: (o as Record<string, unknown>).id as string,
          priceGroupId: g.id as string,
          productId: (o as Record<string, unknown>).productId as string,
          buyPrice: String((o as Record<string, unknown>).buyPrice),
          sellPrice: String((o as Record<string, unknown>).sellPrice),
        })
      }
    }
  }
  if (overrides.length > 0) {
    await offlineDB.priceOverrides.bulkPut(overrides)
  }
}

/** Run full seed if stale or forced */
export async function runSeeder(force = false): Promise<void> {
  const lastSeeded = await getLastSeededAt()
  const stale = Date.now() - lastSeeded > SEED_INTERVAL_MS

  if (!force && !stale) return

  await Promise.allSettled([
    seedProducts(),
    seedCustomers(),
    seedPriceGroups(),
  ])

  await setLastSeededAt()
}
