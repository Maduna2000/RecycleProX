import Decimal from 'decimal.js'
import { offlineDB } from '../db'
import { getPeriodBounds, type StockPeriod } from '@/lib/utils/stock-periods'

/** Offline reader for Stock → Movements — mirrors listMovements() (src/lib/services/stockService.ts). */
export interface OfflineMovementsQuery {
  productId?: string
  direction?: 'in' | 'out'
  source?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export async function readStockMovementsOffline(query: OfflineMovementsQuery) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 100
  const fromTime = query.from ? new Date(query.from).getTime() : undefined
  const toTime = query.to ? new Date(query.to).getTime() + (query.to.length <= 10 ? 24 * 60 * 60 * 1000 - 1 : 0) : undefined

  const [all, products] = await Promise.all([
    offlineDB.stockMovements.toArray(),
    offlineDB.products.toArray(),
  ])
  const productById = new Map(products.map((p) => [p.id, p]))

  const filtered = all.filter((m) => {
    if (query.productId && m.productId !== query.productId) return false
    if (query.direction && m.direction !== query.direction) return false
    if (query.source && m.source !== query.source) return false
    const t = new Date(m.createdAt).getTime()
    if (fromTime !== undefined && t < fromTime) return false
    if (toTime !== undefined && t > toTime) return false
    return true
  })

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const total = filtered.length
  const start = (page - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)

  const movements = pageRows.map((m) => {
    const product = productById.get(m.productId)
    return {
      id: m.id,
      productId: m.productId,
      direction: m.direction,
      quantity: m.quantity,
      source: m.source,
      sourceId: m.sourceId,
      createdAt: m.createdAt,
      product: product
        ? { id: product.id, code: product.code, name: product.name, unit: product.unit, category: product.category }
        : { id: m.productId, code: '', name: m.productName ?? '', unit: '', category: '' },
    }
  })

  return { movements, total, page, pageSize }
}

/**
 * Offline reader for the Stock Grid — reproduces the exact aggregation
 * GET /api/stock/grid runs (src/app/api/stock/grid/route.ts): opening
 * balance from all prior movements, period in/out/adjustments, closing =
 * opening + purchased - sold + adjusted, with voided-source movements
 * dropped first. Feasible to fully replicate (not just cache-aside) because
 * StockMovement + Purchase + Sale are all fully locally replicated — unlike
 * Float/Cash-up's live aggregates, there's no reconciliation-specific
 * business logic (MoMo matching, loan math) here, just arithmetic over
 * already-replicated raw rows.
 */
export async function readStockGridOffline(period: StockPeriod, date: string, category?: string) {
  const { periodStart, periodEnd } = getPeriodBounds(period, date)

  const [products, movements, purchases, sales] = await Promise.all([
    offlineDB.products.toArray(),
    offlineDB.stockMovements.toArray(),
    offlineDB.purchases.toArray(),
    offlineDB.sales.toArray(),
  ])

  const voidedIds = new Set([
    ...purchases.filter((p) => p.status === 'voided').map((p) => p.id),
    ...sales.filter((s) => s.status === 'voided').map((s) => s.id),
  ])

  const relevantProducts = products.filter((p) => p.isActive && (!category || p.category === category))
  const productIds = new Set(relevantProducts.map((p) => p.id))

  const liveMovements = movements.filter((m) => productIds.has(m.productId) && (!m.sourceId || !voidedIds.has(m.sourceId)))

  const grid = relevantProducts.map((p) => {
    const pMvt = liveMovements.filter((m) => m.productId === p.id)

    const openingIn = pMvt
      .filter((m) => new Date(m.createdAt) < periodStart && m.direction === 'in')
      .reduce((acc, m) => acc.plus(new Decimal(m.quantity)), new Decimal(0))
    const openingOut = pMvt
      .filter((m) => new Date(m.createdAt) < periodStart && m.direction === 'out')
      .reduce((acc, m) => acc.plus(new Decimal(m.quantity)), new Decimal(0))
    const openingQty = openingIn.minus(openingOut)

    const periodMvt = pMvt.filter((m) => {
      const t = new Date(m.createdAt)
      return t >= periodStart && t <= periodEnd
    })

    const purchasedQty = periodMvt
      .filter((m) => m.direction === 'in' && m.source === 'purchase')
      .reduce((acc, m) => acc.plus(new Decimal(m.quantity)), new Decimal(0))
    const soldQty = periodMvt
      .filter((m) => m.direction === 'out' && m.source === 'sale')
      .reduce((acc, m) => acc.plus(new Decimal(m.quantity)), new Decimal(0))
    const adjIn = periodMvt
      .filter((m) => m.direction === 'in' && m.source === 'manual_adjustment')
      .reduce((acc, m) => acc.plus(new Decimal(m.quantity)), new Decimal(0))
    const adjOut = periodMvt
      .filter((m) => m.direction === 'out' && m.source === 'manual_adjustment')
      .reduce((acc, m) => acc.plus(new Decimal(m.quantity)), new Decimal(0))
    const adjustedQty = adjIn.minus(adjOut)

    const closingQty = openingQty.plus(purchasedQty).minus(soldQty).plus(adjustedQty)
    const closingValue = closingQty.times(new Decimal(p.defaultBuyPrice))

    return {
      productId: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
      unit: p.unit,
      openingQty: openingQty.toFixed(2),
      purchasedQty: purchasedQty.toFixed(2),
      soldQty: soldQty.toFixed(2),
      adjustedQty: adjustedQty.toFixed(2),
      closingQty: closingQty.toFixed(2),
      closingValue: closingValue.toFixed(2),
      buyPrice: p.defaultBuyPrice,
    }
  })

  return { grid, period, date, periodStart, periodEnd }
}
