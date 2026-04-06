import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import { getStockOnHand } from './stockService'

// ─── Ref number ───────────────────────────────────────────────────────────────

async function nextRef(): Promise<string> {
  const count = await prisma.stocktake.count()
  return `STK-${String(count + 1).padStart(5, '0')}`
}

// ─── Create a new stocktake ───────────────────────────────────────────────────

export async function createStocktake(userId: string, notes?: string) {
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
  countedQty: string
) {
  const stocktake = await prisma.stocktake.findUniqueOrThrow({ where: { id: stocktakeId } })
  if (stocktake.status !== 'open') throw new Error('Stocktake is not open')

  // Look up system on-hand for this product
  const stockRows = await getStockOnHand(productId)
  const systemRow = stockRows.find((r) => r.product.id === productId)
  const systemQty = new Decimal(systemRow?.onHand ?? '0')
  const counted = new Decimal(countedQty)
  const variance = counted.minus(systemQty)

  const entry = await prisma.stocktakeEntry.upsert({
    where: { stocktakeId_productId: { stocktakeId, productId } },
    create: {
      stocktakeId,
      productId,
      systemQty: systemQty.toFixed(4),
      countedQty: counted.toFixed(4),
      variance: variance.toFixed(4),
    },
    update: {
      systemQty: systemQty.toFixed(4),
      countedQty: counted.toFixed(4),
      variance: variance.toFixed(4),
    },
    include: { product: true },
  })
  logger.info({ stocktakeId, productId, variance: variance.toFixed(4) }, 'Stocktake entry upserted')
  return entry
}

// ─── Complete a stocktake ─────────────────────────────────────────────────────

export async function completeStocktake(id: string, userId: string) {
  const stocktake = await prisma.stocktake.findUniqueOrThrow({ where: { id } })
  if (stocktake.status !== 'open') throw new Error('Stocktake is already completed')

  const updated = await prisma.stocktake.update({
    where: { id },
    data: { status: 'completed', completedAt: new Date() },
    include: {
      entries: { include: { product: true } },
      createdBy: { select: { fullName: true } },
    },
  })
  logger.info({ stocktakeId: id, userId }, 'Stocktake completed')
  return updated
}
