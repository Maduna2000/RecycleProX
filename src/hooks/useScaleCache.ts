'use client'

import { useCallback } from 'react'
import { offlineDB, type OfflineCustomer, type OfflineCategory } from '@/lib/offline/db'
import { useOfflineStore } from '@/stores/offlineStore'

/**
 * Hook for accessing cached scale station data.
 * When offline, uses local Dexie cache.
 * When online, fetches from API and updates cache in background.
 */
export function useScaleCache() {
  const { isOnline } = useOfflineStore()

  /**
   * Search customers - uses local cache when offline
   */
  const searchCustomers = useCallback(async (query: string): Promise<OfflineCustomer[]> => {
    const q = query.toLowerCase().trim()
    if (q.length < 2) return []

    if (!isOnline) {
      // Search local cache
      const all = await offlineDB.customers
        .where('isActive').equals(1)
        .toArray()

      return all.filter(c => {
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase()
        const idMatch = c.idNumber?.toLowerCase().includes(q)
        const nameMatch = fullName.includes(q)
        const phoneMatch = c.phone?.toLowerCase().includes(q)
        return (idMatch || nameMatch || phoneMatch) && c.customerType === 'account'
      }).slice(0, 20)
    }

    // Online - fetch from API and update cache
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(query)}&type=account&limit=20`)
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      const customers = data.customers ?? []

      // Update cache in background
      if (customers.length > 0) {
        offlineDB.customers.bulkPut(
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
        ).catch(() => { /* ignore cache errors */ })
      }

      return customers.map((c: Record<string, string>) => ({
        id: c.id,
        idNumber: c.idNumber,
        firstName: c.firstName,
        lastName: c.lastName,
        companyName: c.companyName,
        phone: c.phone,
        customerType: c.customerType,
        primaryFunction: c.primaryFunction,
        blacklisted: false,
        isActive: true,
        priceGroupId: c.priceGroupId,
      }))
    } catch {
      // Fall back to cache on error
      const all = await offlineDB.customers.toArray()
      return all.filter(c => {
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase()
        return (fullName.includes(q) || c.idNumber?.toLowerCase().includes(q)) && c.customerType === 'account'
      }).slice(0, 20)
    }
  }, [isOnline])

  /**
   * Get categories with children structure
   */
  const getCategories = useCallback(async (): Promise<CategoryWithChildren[]> => {
    if (!isOnline) {
      // Build from local cache
      const all = await offlineDB.categories.toArray()
      return buildCategoryTree(all)
    }

    // Online - fetch from API
    try {
      const res = await fetch('/api/scale/categories')
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      return data as CategoryWithChildren[]
    } catch {
      // Fall back to cache
      const all = await offlineDB.categories.toArray()
      return buildCategoryTree(all)
    }
  }, [isOnline])

  /**
   * Get products by category name
   */
  const getProducts = useCallback(async (categoryName: string): Promise<ProductBasic[]> => {
    if (!isOnline) {
      // Search local cache by category
      const products = await offlineDB.products
        .where('category').equals(categoryName)
        .filter(p => p.isActive)
        .toArray()

      return products.map(p => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        category: p.category,
      }))
    }

    // Online - fetch from API
    try {
      const res = await fetch(`/api/scale/products?category=${encodeURIComponent(categoryName)}`)
      if (!res.ok) throw new Error('API error')
      return await res.json() as ProductBasic[]
    } catch {
      // Fall back to cache
      const products = await offlineDB.products
        .where('category').equals(categoryName)
        .filter(p => p.isActive)
        .toArray()

      return products.map(p => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        category: p.category,
      }))
    }
  }, [isOnline])

  return {
    isOnline,
    searchCustomers,
    getCategories,
    getProducts,
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductBasic {
  id: string
  name: string
  unit: string
  category: string
}

interface CategoryWithChildren {
  id: string
  name: string
  colorHex: string | null
  iconName: string | null
  children: CategoryWithChildren[]
  _count?: { products: number }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildCategoryTree(flat: OfflineCategory[]): CategoryWithChildren[] {
  const parentCats = flat.filter(c => !c.parentId)
  const childMap = new Map<string, OfflineCategory[]>()

  for (const c of flat) {
    if (c.parentId) {
      const existing = childMap.get(c.parentId) ?? []
      existing.push(c)
      childMap.set(c.parentId, existing)
    }
  }

  return parentCats.map(parent => ({
    id: parent.id,
    name: parent.name,
    colorHex: parent.colorHex,
    iconName: parent.iconName,
    _count: { products: parent.productCount },
    children: (childMap.get(parent.id) ?? []).map(child => ({
      id: child.id,
      name: child.name,
      colorHex: child.colorHex,
      iconName: child.iconName,
      _count: { products: child.productCount },
      children: [],
    })),
  }))
}
