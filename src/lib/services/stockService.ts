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
 */
export async function getStockOnHand(productId?: string, asAt?: Date) {
  // Aggregate IN movements
  const inAgg = await prisma.stockMovement.groupBy({
    by: ['productId'],
    where: {
      direction: 'in',
      ...(productId && { productId }),
      ...(asAt && { createdAt: { lte: asAt } }),
    },
    _sum: { quantity: true },
  })

  // Aggregate OUT movements
  const outAgg = await prisma.stockMovement.groupBy({
    by: ['productId'],
    where: {
      direction: 'out',
      ...(productId && { productId }),
      ...(asAt && { createdAt: { lte: asAt } }),
    },
    _sum: { quantity: true },
  })

  const inMap = new Map(inAgg.map((r) => [r.productId, new Decimal(r._sum.quantity?.toString() ?? '0')]))
  const outMap = new Map(outAgg.map((r) => [r.productId, new Decimal(r._sum.quantity?.toString() ?? '0')]))

  // All product IDs that have any movement
  const allIds = new Set([...Array.from(inMap.keys()), ...Array.from(outMap.keys())])

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(productId ? { id: productId } : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return products.map((p) => {
    const totalIn = inMap.get(p.id) ?? new Decimal(0)
    const totalOut = outMap.get(p.id) ?? new Decimal(0)
    const onHand = totalIn.minus(totalOut)
    return {
      product: p,
      totalIn: totalIn.toFixed(2),
      totalOut: totalOut.toFixed(2),
      onHand: onHand.toFixed(2),
      hasMovements: allIds.has(p.id),
    }
  })
}

// ─── Stock on hand for a period (opening / in / out / closing) ────────────────

/**
 * Period-scoped stock tracking: opening balance before `start`, in/out
 * within [start, end], closing = opening + in − out. Drives the Day/Week/
 * Month/Year filter on the Stock On Hand page.
 */
export async function getStockOnHandForPeriod(start: Date, end: Date, productId?: string) {
  const sum = (direction: 'in' | 'out', createdAt: { lt?: Date; gte?: Date; lte?: Date }) =>
    prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { direction, createdAt, ...(productId && { productId }) },
      _sum: { quantity: true },
    }).then((rows) => new Map(rows.map((r) => [r.productId, new Decimal(r._sum.quantity?.toString() ?? '0')])))

  const [openIn, openOut, periodIn, periodOut, products] = await Promise.all([
    sum('in', { lt: start }),
    sum('out', { lt: start }),
    sum('in', { gte: start, lte: end }),
    sum('out', { gte: start, lte: end }),
    prisma.product.findMany({
      where: { isActive: true, ...(productId ? { id: productId } : {}) },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
  ])

  const zero = new Decimal(0)
  return products.map((p) => {
    const opening = (openIn.get(p.id) ?? zero).minus(openOut.get(p.id) ?? zero)
    const totalIn = periodIn.get(p.id) ?? zero
    const totalOut = periodOut.get(p.id) ?? zero
    const onHand = opening.plus(totalIn).minus(totalOut)
    return {
      product: p,
      opening: opening.toFixed(2),
      totalIn: totalIn.toFixed(2),
      totalOut: totalOut.toFixed(2),
      onHand: onHand.toFixed(2),
      hasMovements: openIn.has(p.id) || openOut.has(p.id) || periodIn.has(p.id) || periodOut.has(p.id),
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
