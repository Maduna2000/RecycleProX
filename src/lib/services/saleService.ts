import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { recordMovement, recordVoidReversal, getStockOnHand } from '@/lib/services/stockService'
import type { CreateSaleInput, VoidSaleInput } from '@/lib/schemas/sale'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class SaleNotFoundError extends Error {
  constructor(id: string) { super(`Sale "${id}" not found`); this.name = 'SaleNotFoundError' }
}

export class SaleAlreadyVoidedError extends Error {
  constructor(ref: string) { super(`Sale "${ref}" is already voided`); this.name = 'SaleAlreadyVoidedError' }
}

export class ProductInactiveError extends Error {
  constructor(code: string) { super(`Product "${code}" is inactive`); this.name = 'ProductInactiveError' }
}

export class InsufficientStockError extends Error {
  constructor(name: string) { super(`Insufficient stock for "${name}"`); this.name = 'InsufficientStockError' }
}

// ─── Reference number generator ───────────────────────────────────────────────

async function generateRefNumber(): Promise<string> {
  const today = new Date()
  const prefix = `SAL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const count = await prisma.sale.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

// ─── Create Sale ──────────────────────────────────────────────────────────────

export async function createSale(data: CreateSaleInput, createdByUserId?: string) {
  // Validate all products
  const resolvedLines = await Promise.all(
    data.lines.map(async (line) => {
      const product = await prisma.product.findUnique({ where: { id: line.productId } })
      if (!product) throw new Error(`Product "${line.productId}" not found`)
      if (!product.isActive) throw new ProductInactiveError(product.code)

      const unitPrice = new Decimal(line.unitPrice)
      const quantity = new Decimal(line.quantity)
      const lineTotal = unitPrice.times(quantity)

      return { productId: line.productId, quantity, unitPrice, lineTotal }
    })
  )

  // Stock availability check — prevent selling more than on hand
  for (const line of resolvedLines) {
    const stockRows = await getStockOnHand(line.productId)
    const onHand = stockRows[0] ? new Decimal(stockRows[0].onHand) : new Decimal(0)
    if (line.quantity.gt(onHand)) {
      const product = await prisma.product.findUnique({ where: { id: line.productId }, select: { name: true } })
      throw new InsufficientStockError(product?.name ?? line.productId)
    }
  }

  const totalAmount = resolvedLines.reduce((sum, l) => sum.plus(l.lineTotal), new Decimal(0))
  const refNumber = await generateRefNumber()

  const sale = await prisma.$transaction(async (tx) => {
    const s = await tx.sale.create({
      data: {
        refNumber,
        customerId: data.customerId,
        buyerId: data.buyerId,
        buyerName: data.buyerName,
        buyerIdNumber: data.buyerIdNumber,
        buyerPhone: data.buyerPhone,
        status: 'completed',
        totalAmount,
        paymentMethod: data.paymentMethod ?? 'cash',
        notes: data.notes,
        createdByUserId,
        lines: {
          create: resolvedLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { lines: { include: { product: true } } },
    })

    // Stock OUT: yard sold material to buyer
    for (const line of resolvedLines) {
      await recordMovement(tx, {
        productId: line.productId,
        direction: 'out',
        quantity: line.quantity,
        source: 'sale',
        sourceId: s.id,
        createdByUserId,
      })
    }

    return s
  })

  logger.info({ saleId: sale.id, refNumber, totalAmount: totalAmount.toFixed(2), createdByUserId }, 'sale.created')
  return sale
}

// ─── Void Sale ────────────────────────────────────────────────────────────────

export async function voidSale(id: string, data: VoidSaleInput, voidedById?: string) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: { lines: true } })
  if (!sale) throw new SaleNotFoundError(id)
  if (sale.status === 'voided') throw new SaleAlreadyVoidedError(sale.refNumber)

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.sale.update({
      where: { id },
      data: { status: 'voided', voidedAt: new Date(), voidedById, voidReason: data.reason },
      include: { lines: { include: { product: true } } },
    })

    // Reverse the stock OUT movements from this sale
    await recordVoidReversal(tx, {
      originalMovements: sale.lines.map((l) => ({
        productId: l.productId,
        direction: 'out' as const,
        quantity: new Decimal(l.quantity.toString()),
      })),
      sourceId: id,
      createdByUserId: voidedById,
    })

    return s
  })

  logger.info({ saleId: id, refNumber: sale.refNumber, voidedById }, 'sale.voided')
  return updated
}

// ─── Get Sale ─────────────────────────────────────────────────────────────────

export async function getSale(id: string) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { lines: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
  })
  if (!sale) throw new SaleNotFoundError(id)
  return sale
}

// ─── List Sales ───────────────────────────────────────────────────────────────

export async function listSales(opts?: {
  status?: string
  from?: Date
  to?: Date
  search?: string
  paymentMethod?: string
  page?: number
  pageSize?: number
}) {
  const page = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50
  const skip = (page - 1) * pageSize

  const where = {
    ...(opts?.status && { status: opts.status as 'completed' | 'voided' | 'pending' }),
    ...(opts?.paymentMethod && { paymentMethod: opts.paymentMethod as 'cash' | 'eft' | 'cheque' | 'amplopay' }),
    ...(opts?.from || opts?.to ? {
      createdAt: {
        ...(opts?.from && { gte: opts.from }),
        ...(opts?.to && { lte: opts.to }),
      },
    } : {}),
    ...(opts?.search && {
      OR: [
        { refNumber: { contains: opts.search, mode: 'insensitive' as const } },
        { buyerName: { contains: opts.search, mode: 'insensitive' as const } },
        { buyerIdNumber: { contains: opts.search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { lines: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.sale.count({ where }),
  ])

  return { sales, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}
