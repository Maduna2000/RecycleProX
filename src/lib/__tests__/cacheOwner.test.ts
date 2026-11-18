import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── In-memory stand-in for the Dexie database ────────────────────────────────
// vi.mock() is hoisted above ordinary top-level code, so everything its factory
// uses must be created inside vi.hoisted().
type Row = Record<string, unknown>
const { tables } = vi.hoisted(() => {
  function makeTable(initial: Row[] = []) {
    let rows = [...initial]
    return {
      rows: () => rows,
      set: (r: Row[]) => { rows = r },
      clear: vi.fn(async () => { rows = [] }),
      where: (_field: string) => ({
        anyOf: (values: string[]) => ({
          count: async () => rows.filter((r) => values.includes(r.syncStatus as string)).length,
        }),
      }),
      filter: (fn: (r: Row) => boolean) => ({ count: async () => rows.filter(fn).length }),
    }
  }
  return {
    tables: {
      products: makeTable(), customers: makeTable(), priceGroups: makeTable(), priceOverrides: makeTable(),
      categories: makeTable(), stepConfigs: makeTable(), expenseTypes: makeTable(), responseCache: makeTable(),
      scaleDraft: makeTable(), meta: makeTable(), scaleOrders: makeTable(), syncQueue: makeTable(),
      photoCache: makeTable(),
    },
  }
})

vi.mock('@/lib/offline/db', () => ({
  offlineDB: { ...tables, tables: Object.values(tables) },
}))

import { claimOfflineCache, CacheOwnedByOtherCompanyError } from '@/lib/offline/cacheOwner'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  })
  vi.stubGlobal('navigator', { onLine: true })
  for (const t of Object.values(tables)) { t.set([]); t.clear.mockClear() }
})

const OWNER = 'offline.cacheOwnerTenantId'

describe('claimOfflineCache', () => {
  it('does nothing when the same company signs in again', async () => {
    store.set(OWNER, 'tenant-a')
    tables.customers.set([{ id: 1 }])
    await claimOfflineCache('tenant-a')
    expect(tables.customers.rows()).toHaveLength(1)
    expect(tables.customers.clear).not.toHaveBeenCalled()
  })

  it('refuses a different company while the device holds unsent orders, and deletes nothing', async () => {
    store.set(OWNER, 'tenant-a')
    tables.scaleOrders.set([{ syncStatus: 'pending' }, { syncStatus: 'synced' }])
    tables.syncQueue.set([{ status: 'failed' }])
    tables.customers.set([{ id: 1 }])

    const err = await claimOfflineCache('tenant-b').catch((e) => e)
    expect(err).toBeInstanceOf(CacheOwnedByOtherCompanyError)
    expect((err as CacheOwnedByOtherCompanyError).unsentCount).toBe(2)
    expect(tables.scaleOrders.rows()).toHaveLength(2)
    expect(tables.customers.rows()).toHaveLength(1)
    expect(store.get(OWNER)).toBe('tenant-a')
  })

  it('counts "syncing" and "failed" orders as unsent but not "synced"', async () => {
    store.set(OWNER, 'tenant-a')
    tables.scaleOrders.set([{ syncStatus: 'syncing' }, { syncStatus: 'failed' }, { syncStatus: 'synced' }])
    const err = await claimOfflineCache('tenant-b').catch((e) => e)
    expect((err as CacheOwnedByOtherCompanyError).unsentCount).toBe(2)
  })

  it('wipes everything and re-claims when a different company signs in with nothing unsent', async () => {
    store.set(OWNER, 'tenant-a')
    tables.customers.set([{ id: 1 }])
    tables.products.set([{ id: 2 }])
    tables.scaleOrders.set([{ syncStatus: 'synced' }])
    tables.syncQueue.set([{ status: 'synced' }])
    tables.photoCache.set([{ id: 3 }])

    await claimOfflineCache('tenant-b')
    for (const t of Object.values(tables)) expect(t.rows()).toHaveLength(0)
    expect(store.get(OWNER)).toBe('tenant-b')
  })

  it('on a device with no recorded owner: drops reference data, KEEPS unsent orders, then claims', async () => {
    tables.customers.set([{ id: 1 }])
    tables.scaleDraft.set([{ id: 'd' }])
    tables.scaleOrders.set([{ syncStatus: 'pending' }])

    await claimOfflineCache('tenant-b')
    expect(tables.customers.rows()).toHaveLength(0)
    expect(tables.scaleDraft.rows()).toHaveLength(0)
    expect(tables.scaleOrders.rows()).toHaveLength(1)
    expect(store.get(OWNER)).toBe('tenant-b')
  })

  it('on a device with no recorded owner and offline: leaves the cache alone and does not claim', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    tables.customers.set([{ id: 1 }])
    await claimOfflineCache('tenant-b')
    expect(tables.customers.rows()).toHaveLength(1)
    expect(store.get(OWNER)).toBeUndefined()
  })
})
