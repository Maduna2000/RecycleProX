import Decimal from 'decimal.js'
import { offlineDB } from '../db'

/**
 * Offline reader for the Purchases module — replicates listPurchases()'s
 * filter/sort/paginate logic (src/lib/services/purchaseService.ts) against
 * the locally-replicated `purchases` table, and returns the exact shape the
 * live API does so the page's own render code needs no changes. See the
 * "Desktop offline mode" plan.
 */

export interface OfflinePurchasesQuery {
  status?: string
  paymentMethod?: string
  search?: string
  from?: string  // YYYY-MM-DD or ISO
  to?: string
  page?: number
  pageSize?: number
}

export async function readPurchasesOffline(query: OfflinePurchasesQuery) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 30
  const fromTime = query.from ? new Date(query.from).getTime() : undefined
  // Inclusive end-of-day, matching the server's `lte: to` against a
  // datetime column when `to` is a bare date.
  const toTime = query.to ? new Date(query.to).getTime() + (query.to.length <= 10 ? 24 * 60 * 60 * 1000 - 1 : 0) : undefined
  const search = query.search?.trim().toLowerCase()

  const all = await offlineDB.purchases.toArray()

  const filtered = all.filter((p) => {
    if (query.status && p.status !== query.status) return false
    if (query.paymentMethod && p.paymentMethod !== query.paymentMethod) return false
    const createdAtTime = new Date(p.createdAt).getTime()
    if (fromTime !== undefined && createdAtTime < fromTime) return false
    if (toTime !== undefined && createdAtTime > toTime) return false
    if (search) {
      const name = `${p.customerFirstName ?? ''} ${p.customerLastName ?? ''}`.toLowerCase()
      const hay = [p.refNumber, name, p.customerIdNumber ?? ''].join(' ').toLowerCase()
      if (!hay.includes(search)) return false
    }
    return true
  })

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const total = filtered.length
  const totalSum = filtered
    .filter((p) => query.status ? true : p.status !== 'voided')
    .reduce((acc, p) => acc.plus(new Decimal(p.totalAmount)), new Decimal(0))
    .toFixed(2)

  const start = (page - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)

  const purchases = pageRows.map((p) => ({
    id: p.id,
    refNumber: p.refNumber,
    status: p.status,
    totalAmount: p.totalAmount,
    amountPaid: p.amountPaid ?? '0',
    paymentMethod: p.paymentMethod,
    createdAt: p.createdAt,
    customer: {
      id: p.customerId,
      firstName: p.customerFirstName ?? '',
      lastName: p.customerLastName ?? '',
      idNumber: p.customerIdNumber ?? null,
    },
    lines: (p.lines ?? []).map((l) => ({ id: l.id })),
  }))

  return { purchases, total, totalSum, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}

export async function readPurchaseDetailOffline(id: string) {
  const p = await offlineDB.purchases.get(id)
  if (!p) return null
  const customer = await offlineDB.customers.get(p.customerId)

  return {
    id: p.id,
    refNumber: p.refNumber,
    status: p.status,
    totalAmount: p.totalAmount,
    loanDeductionAmount: p.loanDeductionAmount,
    paymentMethod: p.paymentMethod,
    notes: p.notes,
    createdAt: p.createdAt,
    customer: {
      id: p.customerId,
      firstName: p.customerFirstName ?? customer?.firstName ?? '',
      lastName: p.customerLastName ?? customer?.lastName ?? '',
      idNumber: p.customerIdNumber ?? customer?.idNumber ?? '',
      phone: customer?.phone ?? '',
    },
    lines: (p.lines ?? []).map((l) => ({
      id: l.id,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      product: { id: l.productId, code: l.productCode ?? '', name: l.productName ?? '', unit: l.unit ?? '' },
    })),
  }
}
