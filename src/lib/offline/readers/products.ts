import { offlineDB } from '../db'

/** Offline reader for the Products module — mirrors listProducts() (src/lib/services/productService.ts). */
export interface OfflineProductsQuery {
  category?: string
  isActive?: boolean
  search?: string
}

export async function readProductsOffline(query: OfflineProductsQuery) {
  const q = query.search?.trim().toLowerCase()
  const all = await offlineDB.products.toArray()

  const filtered = all.filter((p) => {
    if (query.category && p.category !== query.category) return false
    if (query.isActive !== undefined && p.isActive !== query.isActive) return false
    if (q && !p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) return false
    return true
  })

  filtered.sort((a, b) =>
    (a.sortOrder - b.sortOrder) ||
    a.category.localeCompare(b.category) ||
    a.name.localeCompare(b.name)
  )

  return { products: filtered }
}
