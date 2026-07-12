import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import { getStockOnHand, recordMovement } from './stockService'
import { Prisma } from '@prisma/client'
import { withSerializableRetry } from '@/lib/db/withSerializableRetry'
import { encodeJsonField } from '@/lib/db/queryHelpers'

// ─── Ref number ───────────────────────────────────────────────────────────────

async function nextRef(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.stocktake.count()
  return `STK-${String(count + 1).padStart(5, '0')}`
}

// ─── Build stock snapshot ─────────────────────────────────────────────────────
// Captures system quantities for all active products at stocktake creation time

async function buildStockSnapshot(): Promise<Record<string, string>> {
  const stockRows = await getStockOnHand()
  const snapshot: Record<string, string> = {}
  for (const row of stockRows) {
    snapshot[row.product.id] = row.onHand
  }
  return snapshot
}

// ─── Create a new stocktake ───────────────────────────────────────────────────

export async function createStocktake(userId: string, notes?: string) {
  // Capture system quantities for all products at this moment
  const stockSnapshot = await buildStockSnapshot()

  const stocktake = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      // Only one open stocktake at a time — prevents split system-qty snapshots.
      // Check + create run inside the same Serializable transaction so two
      // near-simultaneous "New Stocktake" requests can't both pass the check.
      const existing = await tx.stocktake.findFirst({ where: { status: 'open' } })
      if (existing) {
        throw new Error(`A stocktake (${existing.refNumber}) is already open. Complete it before starting a new one.`)
      }

      const refNumber = await nextRef(tx)
      return tx.stocktake.create({
        data: {
          refNumber,
          notes,
          createdByUserId: userId,
          stockSnapshot: encodeJsonField(stockSnapshot),
        },
        include: { entries: { include: { product: true } } },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 })
  )
  logger.info({ stocktakeId: stocktake.id, userId, snapshotProductCount: Object.keys(stockSnapshot).length }, 'Stocktake created with snapshot')
  return stocktake
}

// ─── List stocktakes ──────────────────────────────────────────────────────────

export async function listStocktakes(opts: { skip?: number; take?: number } = {}) {
  const { skip = 0, take = 30 } = opts
  const [items, total] = await Promise.all([
    prisma.stocktake.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { entries: true } },
        createdBy: { select: { fullName: true } },
        voidedBy: { select: { fullName: true } },
      },
    }),
    prisma.stocktake.count(),
  ])
  return { items, total }
}

// ─── Get single stocktake with entries ───────────────────────────────────────

export async function getStocktake(id: string) {
  return prisma.stocktake.findUniqueOrThrow({
    where: { id },
    include: {
      entries: {
        include: { product: true },
        orderBy: { createdAt: 'asc' },
      },
      createdBy: { select: { fullName: true } },
      voidedBy: { select: { fullName: true } },
    },
  })
}

// ─── Add / update an entry ────────────────────────────────────────────────────

export async function upsertEntry(
  stocktakeId: string,
  productId: string,
  countedQty: string,
  opts?: { grossQty?: string; tareQty?: string; photoR2Key?: string }
) {
  const stocktake = await prisma.stocktake.findUniqueOrThrow({ where: { id: stocktakeId } })
  if (stocktake.status !== 'open') throw new Error('Stocktake is not open')

  // Use snapshot if available, otherwise fall back to live query (for backward compat)
  let systemQty: Decimal
  const snapshot = stocktake.stockSnapshot as Record<string, string> | null
  if (snapshot && snapshot[productId] !== undefined) {
    systemQty = new Decimal(snapshot[productId])
  } else {
    // Fallback: product added after stocktake started or no snapshot (legacy)
    const stockRows = await getStockOnHand(productId)
    const systemRow = stockRows.find((r) => r.product.id === productId)
    systemQty = new Decimal(systemRow?.onHand ?? '0')
    logger.warn({ stocktakeId, productId }, 'Product not in snapshot, using live stock query')
  }

  const counted  = new Decimal(countedQty)
  const variance = counted.minus(systemQty)

  const scaleData = {
    grossQty: opts?.grossQty ? new Decimal(opts.grossQty) : undefined,
    tareQty:  opts?.tareQty  ? new Decimal(opts.tareQty)  : undefined,
  }

  const entry = await prisma.stocktakeEntry.upsert({
    where: { stocktakeId_productId: { stocktakeId, productId } },
    create: {
      stocktakeId,
      productId,
      systemQty:  systemQty,
      countedQty: counted,
      variance:   variance,
      ...scaleData,
      ...(opts?.photoR2Key ? { photoR2Key: opts.photoR2Key } : {}),
    },
    update: {
      systemQty:  systemQty,
      countedQty: counted,
      variance:   variance,
      ...scaleData,
      ...(opts?.photoR2Key ? { photoR2Key: opts.photoR2Key } : {}),
    },
    include: { product: true },
  })
  logger.info({ stocktakeId, productId, variance: variance.toFixed(4) }, 'Stocktake entry upserted')
  return entry
}

// ─── Update photo on an existing entry ───────────────────────────────────────

export async function updateEntryPhoto(
  stocktakeId: string,
  productId: string,
  photoR2Key: string
) {
  const stocktake = await prisma.stocktake.findUniqueOrThrow({ where: { id: stocktakeId } })
  if (stocktake.status !== 'open') throw new Error('Stocktake is not open')

  const entry = await prisma.stocktakeEntry.update({
    where: { stocktakeId_productId: { stocktakeId, productId } },
    data: { photoR2Key },
    include: { product: true },
  })
  logger.info({ stocktakeId, productId, photoR2Key }, 'stocktake.entry.photo-updated')
  return entry
}

// ─── Complete a stocktake ─────────────────────────────────────────────────────
// Marks the stocktake completed AND applies non-zero variances as StockMovement
// records (source: 'stocktake_adjustment') so live stock is corrected.

export async function completeStocktake(id: string, userId: string) {
  const updated = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    // Load stocktake with entries INSIDE the transaction for isolation
    const stocktake = await tx.stocktake.findUniqueOrThrow({
      where: { id },
      include: { entries: true },
    })
    if (stocktake.status !== 'open') throw new Error('Stocktake is already completed')

    const result = await tx.stocktake.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
      include: {
        entries: { include: { product: true } },
        createdBy: { select: { fullName: true } },
      },
    })

    // Apply each non-zero variance as a correcting stock movement
    for (const entry of stocktake.entries) {
      const variance = new Decimal(entry.variance.toString())
      if (variance.isZero()) continue

      // Positive variance = counted more than system → stock IN adjustment
      // Negative variance = counted less than system → stock OUT adjustment
      await recordMovement(tx, {
        productId:       entry.productId,
        direction:       variance.isPositive() ? 'in' : 'out',
        quantity:        variance.abs(),
        source:          'stocktake_adjustment',
        sourceId:        id,
        notes:           `Stocktake adjustment (${result.refNumber}): variance ${variance.toFixed(4)}`,
        createdByUserId: userId,
      })

      logger.info(
        { stocktakeId: id, productId: entry.productId, variance: variance.toFixed(4), userId },
        'stocktake.variance.applied'
      )
    }

    return result
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 }))

  logger.info({ stocktakeId: id, userId, entryCount: updated.entries.length }, 'Stocktake completed')
  return updated
}

// ─── Void a completed stocktake ───────────────────────────────────────────────
// Reverses all stock movements created by the stocktake completion.

export async function voidStocktake(id: string, userId: string, reason: string) {
  const voided = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    // Load stocktake with entries inside transaction
    const stocktake = await tx.stocktake.findUniqueOrThrow({
      where: { id },
      include: { entries: true },
    })

    if (stocktake.status === 'open') {
      throw new Error('Cannot void an open stocktake. Complete or delete it instead.')
    }
    if (stocktake.status === 'voided') {
      throw new Error('Stocktake is already voided')
    }

    // Reverse all stock movements created by this stocktake
    for (const entry of stocktake.entries) {
      const variance = new Decimal(entry.variance.toString())
      if (variance.isZero()) continue

      // Reverse: if original was IN, void is OUT; if original was OUT, void is IN
      await recordMovement(tx, {
        productId:       entry.productId,
        direction:       variance.isPositive() ? 'out' : 'in',
        quantity:        variance.abs(),
        source:          'void_reversal',
        sourceId:        id,
        notes:           `Void stocktake (${stocktake.refNumber}): reversing variance ${variance.toFixed(4)}. Reason: ${reason}`,
        createdByUserId: userId,
      })

      logger.info(
        { stocktakeId: id, productId: entry.productId, variance: variance.toFixed(4), userId },
        'stocktake.variance.reversed'
      )
    }

    // Update stocktake status
    const result = await tx.stocktake.update({
      where: { id },
      data: {
        status: 'voided',
        voidedAt: new Date(),
        voidedByUserId: userId,
        voidReason: reason,
      },
      include: {
        entries: { include: { product: true } },
        createdBy: { select: { fullName: true } },
        voidedBy: { select: { fullName: true } },
      },
    })

    return result
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 }))

  logger.info({ stocktakeId: id, userId, reason, entryCount: voided.entries.length }, 'Stocktake voided')
  return voided
}
