import type { Table } from 'dexie'
import {
  offlineDB,
  type OfflinePurchase, type OfflineSale, type OfflinePayment,
  type OfflineCashUpSession, type OfflineCashFloat, type OfflineStockMovement,
} from './db'

const SEED_INTERVAL_MS = 6 * 60 * 60 * 1000  // 6 hours
const META_KEY = 'lastSeededAt'

async function getLastSeededAt(): Promise<number> {
  const row = await offlineDB.meta.get(META_KEY)
  return row ? Number(row.value) : 0
}

async function setLastSeededAt() {
  await offlineDB.meta.put({ key: META_KEY, value: String(Date.now()) })
}

// ─── Full-history replica sync (Float, Purchases, Sales, Payments, Cash-up,
// Stock — see the "Desktop offline mode" plan) ─────────────────────────────
//
// Each entity tracks its own resume cursor in the meta table, independent of
// lastSeededAt above (which only gates *how often this whole function
// bothers trying*). A fresh install has no cursor yet, so the first pass
// naturally does a full backfill — paging through every record via the
// purpose-built /api/offline-sync/* routes — and every later pass only pulls
// what changed since last time (see those routes' own updatedAt-cursor
// comment for why edits/voids aren't missed).

function syncCursorKey(entity: string): string {
  return `syncCursor:${entity}`
}

async function getSyncCursor(entity: string): Promise<string | null> {
  const row = await offlineDB.meta.get(syncCursorKey(entity))
  return row?.value ?? null
}

async function setSyncCursor(entity: string, cursor: string): Promise<void> {
  await offlineDB.meta.put({ key: syncCursorKey(entity), value: cursor })
}

interface SyncPage<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

async function syncPagedEntity<T>(entity: string, endpoint: string, table: Table<T, string>): Promise<void> {
  let cursor = await getSyncCursor(entity)

  for (;;) {
    const url = cursor ? `${endpoint}?cursor=${encodeURIComponent(cursor)}` : endpoint
    const res = await fetch(url)
    if (!res.ok) return  // best-effort — retried on the next seed pass

    const page = await res.json() as SyncPage<T>
    if (page.items.length > 0) {
      await table.bulkPut(page.items)
    }
    if (page.nextCursor) {
      cursor = page.nextCursor
      await setSyncCursor(entity, cursor)
    }
    if (!page.hasMore) return
  }
}

async function seedPurchasesFull() {
  await syncPagedEntity<OfflinePurchase>('purchases', '/api/offline-sync/purchases', offlineDB.purchases)
}

async function seedSalesFull() {
  await syncPagedEntity<OfflineSale>('sales', '/api/offline-sync/sales', offlineDB.sales)
}

async function seedPaymentsFull() {
  await syncPagedEntity<OfflinePayment>('payments', '/api/offline-sync/payments', offlineDB.payments)
}

async function seedCashUpsFull() {
  await syncPagedEntity<OfflineCashUpSession>('cashups', '/api/offline-sync/cashups', offlineDB.cashUps)
}

async function seedCashFloatsFull() {
  await syncPagedEntity<OfflineCashFloat>('cashfloats', '/api/offline-sync/cashfloats', offlineDB.cashFloats)
}

async function seedStockMovementsFull() {
  await syncPagedEntity<OfflineStockMovement>('stockMovements', '/api/offline-sync/stock-movements', offlineDB.stockMovements)
}

async function seedProducts() {
  // No `active` filter — the offline Products list page (Phase 2) needs
  // inactive products too ("All statuses" filter); GET /api/products
  // returns its full match set in one response (no server-side pagination),
  // so this is the same single request either way.
  const res = await fetch('/api/products')
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
        createdAt: c.createdAt as string | undefined,
        dealerCategory: c.dealerCategory as string | null | undefined,
        email: c.email as string | null | undefined,
        landline: c.landline as string | null | undefined,
        blacklisted: Boolean(c.blacklisted),
        isActive: Boolean(c.isActive),
        priceGroupId: c.priceGroupId as string | undefined,
        accountCode: c.accountCode as string | null | undefined,
        blacklistReason: c.blacklistReason as string | null | undefined,
        tradeCommodities: c.tradeCommodities as string[] | null | undefined,
        zeroRated: Boolean(c.zeroRated),
        contactPerson: c.contactPerson as string | null | undefined,
        physicalAddress: c.physicalAddress as string | null | undefined,
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

interface CategoryFromAPI {
  id: string
  name: string
  colorHex: string | null
  iconName: string | null
  parentId?: string | null
  children?: CategoryFromAPI[]
  _count?: { products: number }
}

async function seedCategories() {
  const res = await fetch('/api/scale/categories')
  if (!res.ok) return
  const data = await res.json() as CategoryFromAPI[]

  // Flatten hierarchical categories into flat list
  const flat: Array<{
    id: string
    name: string
    colorHex: string | null
    iconName: string | null
    parentId: string | null
    productCount: number
  }> = []

  for (const cat of data) {
    flat.push({
      id: cat.id,
      name: cat.name,
      colorHex: cat.colorHex,
      iconName: cat.iconName,
      parentId: null,
      productCount: cat._count?.products ?? 0,
    })
    if (cat.children && cat.children.length > 0) {
      for (const child of cat.children) {
        flat.push({
          id: child.id,
          name: child.name,
          colorHex: child.colorHex ?? cat.colorHex,
          iconName: child.iconName ?? cat.iconName,
          parentId: cat.id,
          productCount: child._count?.products ?? 0,
        })
      }
    }
  }

  await offlineDB.categories.bulkPut(flat)
}

async function seedExpenseTypes() {
  const res = await fetch('/api/expense-types')
  if (!res.ok) return
  const data = await res.json() as Array<{ id: string; name: string; parentId?: string | null }>

  await offlineDB.expenseTypes.bulkPut(
    data.map((t) => ({ id: t.id, name: t.name, parentId: t.parentId ?? null }))
  )
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
    seedCategories(),
    seedExpenseTypes(),
    seedPurchasesFull(),
    seedSalesFull(),
    seedPaymentsFull(),
    seedCashUpsFull(),
    seedCashFloatsFull(),
    seedStockMovementsFull(),
  ])

  await setLastSeededAt()
}
