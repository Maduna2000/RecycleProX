import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class ProductNotFoundError extends Error {
  constructor(id: string) { super(`Product "${id}" not found`); this.name = 'ProductNotFoundError' }
}

// ─── Record a stock movement (called inside transactions) ─────────────────────

export async function recordMovement(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  opts: {
    productId: string
    direction: 'in' | 'out'
    quantity: Decimal
    source: 'purchase' | 'sale' | 'manual_adjustment' | 'void_reversal' | 'stocktake_adjustment'
    sourceId?: string
    notes?: string
    createdByUserId?: string
  }
) {
  return tx.stockMovement.create({
    data: {
      tenantId: requireTenantId(),
      productId: opts.productId,
      direction: opts.direction,
      quantity: opts.quantity,
      source: opts.source,
      sourceId: opts.sourceId,
      notes: opts.notes,
      createdByUserId: opts.createdByUserId,
    },
  })
}

// ─── Stock on hand per product ────────────────────────────────────────────────

/**
 * On-hand levels from the movement ledger. `asAt` cuts the ledger off at
 * that instant — "what was on hand as at that date" — omit it for live
 * levels.
 *
 * totalIn/totalOut shown here are purchase-only / sale-only — "how much
 * came in by buying it, how much left by selling it" — not the full
 * movement ledger. onHand is still the true, complete running total
 * (includes manual/stocktake adjustments and void reversals), since those
 * genuinely change what's physically on the shelf; they just don't belong
 * in the purchase/sale narrative these two columns are meant to tell.
 */
export async function getStockOnHand(productId?: string, asAt?: Date) {
  // Grouping by source (not just productId) in the same two queries this
  // always needed — one per direction — gets both the true all-sources sum
  // and the purchase-only/sale-only sum without extra DB round trips.
  const byProductAndSource = (direction: 'in' | 'out') =>
    prisma.stockMovement.groupBy({
      by: ['productId', 'source'],
      where: {
        direction,
        ...(productId && { productId }),
        ...(asAt && { createdAt: { lte: asAt } }),
      },
      _sum: { quantity: true },
    })

  const [inRows, outRows] = await Promise.all([byProductAndSource('in'), byProductAndSource('out')])

  const zero = new Decimal(0)
  const totals = new Map<string, { allIn: Decimal; allOut: Decimal; purchaseIn: Decimal; saleOut: Decimal }>()
  const get = (id: string) => {
    let t = totals.get(id)
    if (!t) { t = { allIn: zero, allOut: zero, purchaseIn: zero, saleOut: zero }; totals.set(id, t) }
    return t
  }
  for (const r of inRows) {
    const qty = new Decimal(r._sum.quantity?.toString() ?? '0')
    const t = get(r.productId)
    t.allIn = t.allIn.plus(qty)
    if (r.source === 'purchase') t.purchaseIn = t.purchaseIn.plus(qty)
  }
  for (const r of outRows) {
    const qty = new Decimal(r._sum.quantity?.toString() ?? '0')
    const t = get(r.productId)
    t.allOut = t.allOut.plus(qty)
    if (r.source === 'sale') t.saleOut = t.saleOut.plus(qty)
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(productId ? { id: productId } : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return products.map((p) => {
    const t = totals.get(p.id)
    const onHand = (t?.allIn ?? zero).minus(t?.allOut ?? zero)
    return {
      product: p,
      totalIn: (t?.purchaseIn ?? zero).toFixed(2),
      totalOut: (t?.saleOut ?? zero).toFixed(2),
      onHand: onHand.toFixed(2),
      hasMovements: totals.has(p.id),
    }
  })
}

// ─── Stock on hand for a period (opening / in / out / closing) ────────────────

/**
 * Period-scoped stock tracking: opening balance before `start`, in/out
 * within [start, end], closing = opening + in − out. Drives the Day/Week/
 * Month/Year filter on the Stock On Hand page.
 *
 * The displayed totalIn/totalOut are purchase-only / sale-only (see
 * getStockOnHand's comment for why) — onHand/closing is still computed from
 * every movement in the period, including adjustments and void reversals,
 * so it stays the true physical figure even though it won't always equal
 * opening + displayed-in − displayed-out.
 */
export async function getStockOnHandForPeriod(start: Date, end: Date, productId?: string) {
  // Opening balance (before start) needs only the true all-sources sum, so
  // it stays grouped by productId alone. The in-period sums are grouped by
  // source too, the same way getStockOnHand does it, so the purchase-only/
  // sale-only display figures come out of the same query as the true sums
  // feeding onHand — no extra round trips per breakdown.
  const openSum = (direction: 'in' | 'out') =>
    prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { direction, createdAt: { lt: start }, ...(productId && { productId }) },
      _sum: { quantity: true },
    }).then((rows) => new Map(rows.map((r) => [r.productId, new Decimal(r._sum.quantity?.toString() ?? '0')])))

  const periodSum = (direction: 'in' | 'out') =>
    prisma.stockMovement.groupBy({
      by: ['productId', 'source'],
      where: { direction, createdAt: { gte: start, lte: end }, ...(productId && { productId }) },
      _sum: { quantity: true },
    })

  const [openIn, openOut, periodInRows, periodOutRows, products] = await Promise.all([
    openSum('in'),
    openSum('out'),
    periodSum('in'),
    periodSum('out'),
    prisma.product.findMany({
      where: { isActive: true, ...(productId ? { id: productId } : {}) },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
  ])

  const zero = new Decimal(0)
  const periodTotals = new Map<string, { allIn: Decimal; allOut: Decimal; purchaseIn: Decimal; saleOut: Decimal }>()
  const get = (id: string) => {
    let t = periodTotals.get(id)
    if (!t) { t = { allIn: zero, allOut: zero, purchaseIn: zero, saleOut: zero }; periodTotals.set(id, t) }
    return t
  }
  for (const r of periodInRows) {
    const qty = new Decimal(r._sum.quantity?.toString() ?? '0')
    const t = get(r.productId)
    t.allIn = t.allIn.plus(qty)
    if (r.source === 'purchase') t.purchaseIn = t.purchaseIn.plus(qty)
  }
  for (const r of periodOutRows) {
    const qty = new Decimal(r._sum.quantity?.toString() ?? '0')
    const t = get(r.productId)
    t.allOut = t.allOut.plus(qty)
    if (r.source === 'sale') t.saleOut = t.saleOut.plus(qty)
  }

  return products.map((p) => {
    const opening = (openIn.get(p.id) ?? zero).minus(openOut.get(p.id) ?? zero)
    const t = periodTotals.get(p.id)
    const onHand = opening.plus(t?.allIn ?? zero).minus(t?.allOut ?? zero)
    return {
      product: p,
      opening: opening.toFixed(2),
      totalIn: (t?.purchaseIn ?? zero).toFixed(2),
      totalOut: (t?.saleOut ?? zero).toFixed(2),
      onHand: onHand.toFixed(2),
      hasMovements: openIn.has(p.id) || openOut.has(p.id) || periodTotals.has(p.id),
    }
  })
}

// ─── Manual stock adjustment ──────────────────────────────────────────────────

export async function manualAdjustment(opts: {
  productId: string
  direction: 'in' | 'out'
  quantity: string
  notes: string
  createdByUserId?: string
}) {
  const product = await prisma.product.findUnique({ where: { id: opts.productId } })
  if (!product) throw new ProductNotFoundError(opts.productId)

  const movement = await prisma.$transaction(async (tx) => {
    return recordMovement(tx, {
      productId: opts.productId,
      direction: opts.direction,
      quantity: new Decimal(opts.quantity),
      source: 'manual_adjustment',
      notes: opts.notes,
      createdByUserId: opts.createdByUserId,
    })
  })

  logger.info({
    movementId: movement.id,
    productId: opts.productId,
    direction: opts.direction,
    quantity: opts.quantity,
    createdByUserId: opts.createdByUserId,
  }, 'stock.manualAdjustment')

  return movement
}

// ─── List movements (with pagination) ────────────────────────────────────────

export async function listMovements(opts?: {
  productId?: string
  direction?: 'in' | 'out'
  source?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}) {
  const page = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 100
  const skip = (page - 1) * pageSize

  const where = {
    ...(opts?.productId && { productId: opts.productId }),
    ...(opts?.direction && { direction: opts.direction }),
    ...(opts?.source && { source: opts.source }),
    ...(opts?.from || opts?.to ? {
      createdAt: {
        ...(opts?.from && { gte: opts.from }),
        ...(opts?.to && { lte: opts.to }),
      },
    } : {}),
  }

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: { product: { select: { id: true, code: true, name: true, unit: true, category: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ])

  return { movements, total, page, pageSize }
}

// ─── Stock transfer between two products ─────────────────────────────────────

export async function stockTransfer(opts: {
  sourceProductId: string
  destProductId:   string
  quantity:        string
  notes?:          string
  createdByUserId?: string
}) {
  const [source, dest] = await Promise.all([
    prisma.product.findUnique({ where: { id: opts.sourceProductId } }),
    prisma.product.findUnique({ where: { id: opts.destProductId } }),
  ])
  if (!source) throw new ProductNotFoundError(opts.sourceProductId)
  if (!dest)   throw new ProductNotFoundError(opts.destProductId)

  const qty = new Decimal(opts.quantity)
  if (qty.lte(0)) throw new Error('Quantity must be positive')

  const [outMovement, inMovement] = await prisma.$transaction(async (tx) => {
    const out = await recordMovement(tx, {
      productId: opts.sourceProductId,
      direction: 'out',
      quantity:  qty,
      source:    'manual_adjustment',
      notes:     opts.notes ?? `Transfer to ${dest.name}`,
      createdByUserId: opts.createdByUserId,
    })
    const inMov = await recordMovement(tx, {
      productId: opts.destProductId,
      direction: 'in',
      quantity:  qty,
      source:    'manual_adjustment',
      notes:     opts.notes ?? `Transfer from ${source.name}`,
      createdByUserId: opts.createdByUserId,
    })
    return [out, inMov]
  })

  logger.info({ sourceProductId: opts.sourceProductId, destProductId: opts.destProductId, quantity: qty.toFixed(2), createdByUserId: opts.createdByUserId }, 'stock.transfer')
  return { outMovement, inMovement, quantity: qty.toFixed(2), sourceProduct: source, destProduct: dest }
}

// ─── Void reversal — called when purchase or sale is voided ──────────────────

export async function recordVoidReversal(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  opts: {
    originalMovements: { productId: string; direction: 'in' | 'out'; quantity: Decimal }[]
    sourceId: string
    createdByUserId?: string
  }
) {
  for (const m of opts.originalMovements) {
    await recordMovement(tx, {
      productId: m.productId,
      direction: m.direction === 'in' ? 'out' : 'in', // reverse direction
      quantity: m.quantity,
      source: 'void_reversal',
      sourceId: opts.sourceId,
      notes: `Void reversal for ${opts.sourceId}`,
      createdByUserId: opts.createdByUserId,
    })
  }
}
