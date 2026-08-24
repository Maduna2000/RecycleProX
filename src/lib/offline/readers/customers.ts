import { offlineDB } from '../db'

/** Offline reader for the Customers module — mirrors searchCustomers() (src/lib/services/customerService.ts). */
export interface OfflineCustomersQuery {
  search?: string
  type?: string
  blacklisted?: boolean
  isActive?: boolean
  dealerCategory?: string
  primaryFunction?: string
  priceGroupId?: string
  page?: number
  limit?: number
}

export async function readCustomersOffline(query: OfflineCustomersQuery) {
  const page = query.page ?? 1
  const limit = query.limit ?? 20
  const q = query.search?.trim().toLowerCase()

  const [all, priceGroups] = await Promise.all([
    offlineDB.customers.toArray(),
    offlineDB.priceGroups.toArray(),
  ])
  const priceGroupById = new Map(priceGroups.map((g) => [g.id, g]))

  const filtered = all.filter((c) => {
    if (query.type && c.customerType !== query.type) return false
    if (query.blacklisted !== undefined && c.blacklisted !== query.blacklisted) return false
    if (query.isActive !== undefined && c.isActive !== query.isActive) return false
    if (query.dealerCategory && c.dealerCategory !== query.dealerCategory) return false
    if (query.primaryFunction && c.primaryFunction !== query.primaryFunction) return false
    if (query.priceGroupId && c.priceGroupId !== query.priceGroupId) return false
    if (q) {
      const hay = [
        c.lastName, c.firstName, c.companyName ?? '', c.contactPerson ?? '',
        c.idNumber, c.phone, c.accountCode ?? '',
      ].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  filtered.sort((a, b) => a.lastName.localeCompare(b.lastName))

  const total = filtered.length
  const start = (page - 1) * limit
  const pageRows = filtered.slice(start, start + limit)

  const customers = pageRows.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    idNumber: c.idNumber,
    phone: c.phone,
    landline: c.landline ?? null,
    email: c.email ?? null,
    customerType: c.customerType,
    primaryFunction: c.primaryFunction,
    isActive: c.isActive,
    blacklisted: c.blacklisted,
    createdAt: c.createdAt ?? '',
    priceGroup: c.priceGroupId ? (() => {
      const g = priceGroupById.get(c.priceGroupId!)
      return g ? { id: g.id, name: g.name } : null
    })() : null,
    dealerCategory: c.dealerCategory ?? null,
    companyName: c.companyName ?? null,
    zeroRated: c.zeroRated ?? false,
    accountCode: c.accountCode ?? null,
    physicalAddress: c.physicalAddress ?? null,
  }))

  return { customers, total, page, totalPages: Math.ceil(total / limit) }
}
