import { offlineDB } from '../db'

/**
 * Offline reader for the Sales module — mirrors listSales()'s filter/sort/
 * paginate logic (src/lib/services/saleService.ts). See readers/purchases.ts
 * for the general approach.
 */

export interface OfflineSalesQuery {
  status?: string
  paymentMethod?: string
  search?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export async function readSalesOffline(query: OfflineSalesQuery) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 30
  const fromTime = query.from ? new Date(query.from).getTime() : undefined
  const toTime = query.to ? new Date(query.to).getTime() + (query.to.length <= 10 ? 24 * 60 * 60 * 1000 - 1 : 0) : undefined
  const search = query.search?.trim().toLowerCase()

  const all = await offlineDB.sales.toArray()

  const filtered = all.filter((s) => {
    if (query.status && s.status !== query.status) return false
    if (query.paymentMethod && s.paymentMethod !== query.paymentMethod) return false
    const createdAtTime = new Date(s.createdAt).getTime()
    if (fromTime !== undefined && createdAtTime < fromTime) return false
    if (toTime !== undefined && createdAtTime > toTime) return false
    if (search) {
      const hay = [s.refNumber, s.buyerName ?? '', s.buyerIdNumber ?? ''].join(' ').toLowerCase()
      if (!hay.includes(search)) return false
    }
    return true
  })

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const total = filtered.length
  const start = (page - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)

  const sales = pageRows.map((s) => ({
    id: s.id,
    refNumber: s.refNumber,
    status: s.status,
    totalAmount: s.totalAmount,
    amountPaid: s.amountPaid,
    paymentMethod: s.paymentMethod,
    buyerName: s.buyerName ?? '',
    buyerIdNumber: s.buyerIdNumber,
    createdAt: s.createdAt,
    lines: (s.lines ?? []).map((l) => ({ id: l.id })),
  }))

  return { sales, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}

export async function readSaleDetailOffline(id: string) {
  const s = await offlineDB.sales.get(id)
  if (!s) return null

  return {
    id: s.id,
    refNumber: s.refNumber,
    status: s.status,
    totalAmount: s.totalAmount,
    vatAmount: s.vatAmount,
    amountPaid: s.amountPaid,
    paymentMethod: s.paymentMethod,
    buyerName: s.buyerName,
    buyerIdNumber: s.buyerIdNumber,
    buyerPhone: s.buyerPhone,
    notes: s.notes,
    createdAt: s.createdAt,
    lines: (s.lines ?? []).map((l) => ({
      id: l.id,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      product: { id: l.productId, code: l.productCode ?? '', name: l.productName ?? '', unit: l.unit ?? '' },
    })),
  }
}
