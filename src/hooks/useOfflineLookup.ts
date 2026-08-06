'use client'

import { useCallback } from 'react'
import { offlineDB, type OfflineCustomer, type OfflineExpenseType } from '@/lib/offline/db'
import { useOfflineStore } from '@/stores/offlineStore'

/**
 * Cache-aside lookups for the main till forms (Purchases/Sales-new,
 * customer selector panels) — modeled directly on useScaleCache.ts's
 * pattern (try live fetch + write-through to Dexie when online, fall back
 * to Dexie when offline or on fetch failure). Only covers the "critical
 * till path": customer lookup/search and product/price resolution — see
 * the offline-operation plan for what's deliberately out of scope.
 */
export function useOfflineLookup() {
  const { isOnline } = useOfflineStore()

  /** Exact ID-number lookup — mirrors CasualSelectorPanel's /api/customers/lookup */
  const lookupCustomerByIdNumber = useCallback(async (idNumber: string): Promise<OfflineCustomer | null> => {
    if (isOnline) {
      try {
        const res = await fetch(`/api/customers/lookup?idNumber=${encodeURIComponent(idNumber)}`)
        if (res.ok) {
          const data = await res.json()
          if (data) {
            const cached = toOfflineCustomer(data)
            offlineDB.customers.put(cached).catch(() => {})
            return cached
          }
          return null
        }
      } catch {
        // fall through to cache
      }
    }

    const match = await offlineDB.customers.where('idNumber').equals(idNumber).first()
    return match ?? null
  }, [isOnline])

  /** Live-search account customers — mirrors AccountSelectorPanel's /api/customers?search=&type=account */
  const searchAccountCustomers = useCallback(async (query: string): Promise<OfflineCustomer[]> => {
    const q = query.toLowerCase().trim()
    if (q.length < 2) return []

    if (isOnline) {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(query)}&type=account&limit=8`)
        if (res.ok) {
          const data = await res.json() as { customers: Record<string, unknown>[] }
          const customers = (data.customers ?? []).map(toOfflineCustomer)
          if (customers.length > 0) offlineDB.customers.bulkPut(customers).catch(() => {})
          return customers
        }
      } catch {
        // fall through to cache
      }
    }

    const all = (await offlineDB.customers.toArray()).filter(c => c.isActive)
    return all.filter(c => {
      const fullName = `${c.firstName} ${c.lastName}`.toLowerCase()
      const codeMatch  = c.accountCode?.toLowerCase().includes(q)
      const nameMatch  = fullName.includes(q)
      const phoneMatch = c.phone?.toLowerCase().includes(q)
      return (codeMatch || nameMatch || phoneMatch) && c.customerType === 'account'
    }).slice(0, 8)
  }, [isOnline])

  /** Active product list — mirrors the /api/products?active=true fetch on both new-purchase/new-sale */
  const getActiveProducts = useCallback(async (): Promise<OfflineProductRow[]> => {
    if (isOnline) {
      try {
        const res = await fetch('/api/products?active=true')
        if (res.ok) {
          const data = await res.json()
          const products = Array.isArray(data) ? data : data.products ?? []
          if (products.length > 0) {
            offlineDB.products.bulkPut(products.map((p: Record<string, unknown>) => ({
              id: p.id as string,
              code: p.code as string,
              name: p.name as string,
              category: p.category as string,
              unit: p.unit as string,
              defaultBuyPrice: String(p.defaultBuyPrice),
              defaultSellPrice: String(p.defaultSellPrice),
              isActive: Boolean(p.isActive),
              sortOrder: Number(p.sortOrder ?? 0),
            }))).catch(() => {})
          }
          return products
        }
      } catch {
        // fall through to cache
      }
    }

    const cached = await offlineDB.products.filter(p => p.isActive).toArray()
    return cached.map(p => ({
      id: p.id, code: p.code, name: p.name, category: p.category, unit: p.unit,
      defaultBuyPrice: p.defaultBuyPrice, defaultSellPrice: p.defaultSellPrice,
    }))
  }, [isOnline])

  /**
   * Resolves what a customer actually pays/is paid for a product — mirrors
   * the now-fixed GET /api/products/:id?priceGroupId= (see resolvePrice()
   * in productService.ts, whose override-then-default fallback this
   * replicates against the cached tables).
   */
  const resolveProductPrice = useCallback(async (
    productId: string,
    priceGroupId: string | null | undefined,
    side: 'buy' | 'sell' = 'buy',
  ): Promise<string | null> => {
    if (isOnline) {
      try {
        const url = priceGroupId
          ? `/api/products/${productId}?priceGroupId=${priceGroupId}`
          : `/api/products/${productId}`
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json() as { defaultBuyPrice: string; defaultSellPrice: string }
          return side === 'buy' ? data.defaultBuyPrice : data.defaultSellPrice
        }
      } catch {
        // fall through to cache
      }
    }

    if (priceGroupId) {
      const override = await offlineDB.priceOverrides
        .where('[priceGroupId+productId]').equals([priceGroupId, productId])
        .first()
      if (override) return side === 'buy' ? override.buyPrice : override.sellPrice
    }
    const product = await offlineDB.products.get(productId)
    if (!product) return null
    return side === 'buy' ? product.defaultBuyPrice : product.defaultSellPrice
  }, [isOnline])

  /** Expense type list — mirrors the /api/expense-types fetch on the Expenses page */
  const getExpenseTypes = useCallback(async (): Promise<OfflineExpenseType[]> => {
    if (isOnline) {
      try {
        const res = await fetch('/api/expense-types')
        if (res.ok) {
          const data = await res.json() as Array<{ id: string; name: string; parentId?: string | null }>
          const types = data.map((t) => ({ id: t.id, name: t.name, parentId: t.parentId ?? null }))
          if (types.length > 0) offlineDB.expenseTypes.bulkPut(types).catch(() => {})
          return types
        }
      } catch {
        // fall through to cache
      }
    }
    return offlineDB.expenseTypes.toArray()
  }, [isOnline])

  return { isOnline, lookupCustomerByIdNumber, searchAccountCustomers, getActiveProducts, resolveProductPrice, getExpenseTypes }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OfflineProductRow {
  id: string
  code: string
  name: string
  category: string
  unit: string
  defaultBuyPrice: string
  defaultSellPrice: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toOfflineCustomer(c: Record<string, unknown>): OfflineCustomer {
  return {
    id: c.id as string,
    idNumber: c.idNumber as string,
    firstName: c.firstName as string,
    lastName: c.lastName as string,
    companyName: c.companyName as string | undefined,
    phone: c.phone as string,
    customerType: (c.customerType as string) ?? 'account',
    primaryFunction: (c.primaryFunction as string) ?? 'supplier',
    blacklisted: Boolean(c.blacklisted),
    isActive: c.isActive === undefined ? true : Boolean(c.isActive),
    priceGroupId: c.priceGroupId as string | undefined,
    accountCode: c.accountCode as string | null | undefined,
    blacklistReason: c.blacklistReason as string | null | undefined,
    tradeCommodities: c.tradeCommodities as string[] | null | undefined,
    zeroRated: Boolean(c.zeroRated),
    contactPerson: c.contactPerson as string | null | undefined,
    physicalAddress: c.physicalAddress as string | null | undefined,
  }
}
