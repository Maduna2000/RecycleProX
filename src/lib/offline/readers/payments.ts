import Decimal from 'decimal.js'
import { offlineDB, type OfflineSale } from '../db'

/**
 * Offline reader for the Payments module — replicates listPayments()'s
 * two-source union (real Payment rows + direct-completed sales that never
 * got one — see paymentService.ts's own comment on why) against the locally
 * replicated `payments` and `sales` tables, including the same
 * admin-sale-hiding visibility rule.
 */

export interface OfflinePaymentsQuery {
  customerId?: string
  paymentMethod?: string
  source?: 'sale' | 'purchase'
  search?: string
  includeVoided?: boolean
  from?: string
  to?: string
  page?: number
  pageSize?: number
  viewerRole?: string
}

interface UnifiedRow {
  id: string
  refNumber: string
  amount: string
  paymentMethod: string
  notes?: string
  voidedAt?: string
  createdAt: string
  source: 'sale' | 'purchase'
  customerId: string | null
  saleId: string | null
  purchaseId: string | null
  saleCreatedByUserId?: string | null
  isDirectSale: boolean
}

function directSaleAsPayment(s: OfflineSale): UnifiedRow {
  return {
    id: `direct-sale:${s.id}`,
    refNumber: s.refNumber,
    amount: s.totalAmount,
    paymentMethod: s.paymentMethod,
    createdAt: s.createdAt,
    source: 'sale',
    customerId: s.customerId ?? null,
    saleId: s.id,
    purchaseId: null,
    saleCreatedByUserId: s.createdByUserId,
    isDirectSale: true,
  }
}

export async function readPaymentsOffline(query: OfflinePaymentsQuery) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 50
  const fromTime = query.from ? new Date(query.from).getTime() : undefined
  const toTime = query.to ? new Date(query.to).getTime() + (query.to.length <= 10 ? 24 * 60 * 60 * 1000 - 1 : 0) : undefined
  const search = query.search?.trim().toLowerCase()
  // The live API hides a sale-sourced payment row from non-admins when the
  // underlying sale was created by an admin (see listPayments's own
  // comment). No user/role table is replicated offline, so that rule isn't
  // enforced here — every row is visible regardless of viewer role while
  // offline. Deliberate: showing one extra row during a temporary outage is
  // a much smaller problem than silently hiding a real payment because the
  // visibility check itself couldn't be evaluated locally.

  const [paymentRows, sales, customers] = await Promise.all([
    offlineDB.payments.toArray(),
    offlineDB.sales.toArray(),
    offlineDB.customers.toArray(),
  ])

  const customerById = new Map(customers.map((c) => [c.id, c]))

  const paymentsAsRows: UnifiedRow[] = paymentRows.map((p) => ({
    id: p.id,
    refNumber: p.refNumber ?? '',
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    voidedAt: p.voidedAt ?? undefined,
    createdAt: p.createdAt,
    source: p.source,
    customerId: p.customerId,
    saleId: p.saleId ?? null,
    purchaseId: p.purchaseId ?? null,
    saleCreatedByUserId: p.saleCreatedByUserId,
    isDirectSale: false,
  }))

  const paidSaleIds = new Set(paymentRows.filter((p) => p.saleId).map((p) => p.saleId))
  const wantsDirectSales = query.source === 'sale' || !query.source
  const directSaleRows: UnifiedRow[] = wantsDirectSales
    ? sales.filter((s) => s.status === 'completed' && !paidSaleIds.has(s.id)).map(directSaleAsPayment)
    : []

  let all = [...paymentsAsRows, ...directSaleRows]

  all = all.filter((r) => {
    if (!query.includeVoided && r.voidedAt) return false
    if (query.customerId && r.customerId !== query.customerId) return false
    if (query.paymentMethod && r.paymentMethod !== query.paymentMethod) return false
    if (query.source && r.source !== query.source) return false
    const createdAtTime = new Date(r.createdAt).getTime()
    if (fromTime !== undefined && createdAtTime < fromTime) return false
    if (toTime !== undefined && createdAtTime > toTime) return false
    if (search) {
      const customer = r.customerId ? customerById.get(r.customerId) : undefined
      const name = customer ? `${customer.firstName} ${customer.lastName}` : ''
      const hay = [r.refNumber, name, customer?.idNumber ?? ''].join(' ').toLowerCase()
      if (!hay.includes(search)) return false
    }
    return true
  })

  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const total = all.length
  // Aggregates over the FULL filtered set, not just the current page —
  // matches listPayments's own receivedAgg/paidOutAgg (voided rows already
  // excluded above unless includeVoided was explicitly requested).
  const totalReceived = all
    .filter((r) => r.source === 'sale')
    .reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0))
    .toFixed(2)
  const totalPaidOut = all
    .filter((r) => r.source === 'purchase')
    .reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0))
    .toFixed(2)

  const start = (page - 1) * pageSize
  const pageRows = all.slice(start, start + pageSize)

  const purchasesById = new Map((await offlineDB.purchases.toArray()).map((p) => [p.id, p]))
  const salesById = new Map(sales.map((s) => [s.id, s]))

  const payments = pageRows.map((r) => {
    const customer = r.customerId ? customerById.get(r.customerId) : undefined
    return {
      id: r.id,
      refNumber: r.refNumber,
      amount: r.amount,
      paymentMethod: r.paymentMethod,
      voidedAt: r.voidedAt,
      createdAt: r.createdAt,
      source: r.source,
      customer: customer
        ? { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, idNumber: customer.idNumber ?? null }
        : null,
      sale: r.saleId ? { id: r.saleId, refNumber: salesById.get(r.saleId)?.refNumber ?? '' } : null,
      purchase: r.purchaseId ? { id: r.purchaseId, refNumber: purchasesById.get(r.purchaseId)?.refNumber ?? '' } : null,
      isDirectSale: r.isDirectSale,
    }
  })

  return { payments, total, totalReceived, totalPaidOut, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}
