import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'

const D = (v: unknown) => new Decimal(String(v ?? 0))

export interface StocktakeProduct {
  productRef: string
  code: string
  name: string
  category: string
  unit: string
  buyPrice: number
  quantityIn: number
  quantityOut: number
}

function categoryLabel(p: { category: string; categoryRef: { name: string; parent: { name: string } | null } | null }): string {
  return (p.categoryRef?.parent?.name ?? p.categoryRef?.name ?? p.category).toUpperCase()
}

/**
 * Per-product breakdown for the Stocktake reconciliation feature — the same
 * StockMovement ledger stock_value_total already reads, just broken out by
 * product instead of aggregated by category, and without that metric's
 * fixed period.
 *
 * Returns every product that's either still active, or had any movement in
 * the window (covers a product deactivated mid-period that was still being
 * sold down). A product with zero movement that was already inactive
 * before the window started is correctly excluded here — the control
 * tower's own session logic is what carries forward a nonzero opening
 * balance from its own previous session regardless of what this returns.
 */
export async function computeStocktakeExport(periodStart: Date, periodEnd: Date): Promise<StocktakeProduct[]> {
  const [inAgg, outAgg, products] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { direction: 'in', createdAt: { gte: periodStart, lt: periodEnd } },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { direction: 'out', createdAt: { gte: periodStart, lt: periodEnd } },
      _sum: { quantity: true },
    }),
    prisma.product.findMany({
      select: {
        id: true, code: true, name: true, unit: true, category: true, defaultBuyPrice: true, isActive: true,
        categoryRef: { select: { name: true, parent: { select: { name: true } } } },
      },
    }),
  ])
  const inMap = new Map(inAgg.map((r) => [r.productId, D(r._sum.quantity)]))
  const outMap = new Map(outAgg.map((r) => [r.productId, D(r._sum.quantity)]))

  return products
    .filter((p) => p.isActive || inMap.has(p.id) || outMap.has(p.id))
    .map((p) => ({
      productRef: p.id,
      code: p.code,
      name: p.name,
      category: categoryLabel(p),
      unit: p.unit,
      buyPrice: D(p.defaultBuyPrice).toNumber(),
      quantityIn: (inMap.get(p.id) ?? new Decimal(0)).toNumber(),
      quantityOut: (outMap.get(p.id) ?? new Decimal(0)).toNumber(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
