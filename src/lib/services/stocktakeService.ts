import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import { getStockOnHand, recordMovement } from './stockService'

// ─── Ref number ───────────────────────────────────────────────────────────────

async function nextRef(): Promise<string> {
  const count = await prisma.stocktake.count()
  return `STK-${String(count + 1).padStart(5, '0')}`
}

// ─── Create a new stocktake ───────────────────────────────────────────────────

export async function createStocktake(userId: string, notes?: string) {
  // Only one open stocktake at a time — prevents split system-qty snapshots
  const existing = await prisma.stocktake.findFirst({ where: { status: 'open' } })
  if (existing) {
    throw new Error(`A stocktake (${existing.refNumber}) is already open. Complete it before starting a new one.`)
  }

  const refNumber = await nextRef()
  const stocktake = await prisma.stocktake.create({
    data: { refNumber, notes, createdByUserId: userId },
    include: { entries: { include: { product: true } } },
  })
  logger.info({ stocktakeId: stocktake.id, userId }, 'Stocktake created')
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

  const stockRows = await getStockOnHand(productId)
  const systemRow = stockRows.find((r) => r.product.id === productId)
  const systemQty = new Decimal(systemRow?.onHand ?? '0')
  const counted   = new Decimal(countedQty)
  const variance  = counted.minus(systemQty)

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
  const stocktake = await prisma.stocktake.findUniqueOrThrow({
    where: { id },
    include: { entries: true },
  })
  if (stocktake.status !== 'open') throw new Error('Stocktake is already completed')

  const updated = await prisma.$transaction(async (tx) => {
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
        source:          'manual_adjustment',
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
  })

  logger.info({ stocktakeId: id, userId, entryCount: stocktake.entries.length }, 'Stocktake completed')
  return updated
}
