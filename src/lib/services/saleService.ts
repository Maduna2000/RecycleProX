import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { recordMovement, recordVoidReversal } from '@/lib/services/stockService'
import type { CreateSaleInput, VoidSaleInput } from '@/lib/schemas/sale'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class SaleNotFoundError extends Error {
  constructor(id: string) { super(`Sale "${id}" not found`); this.name = 'SaleNotFoundError' }
}

export class SaleAlreadyVoidedError extends Error {
  constructor(ref: string) { super(`Sale "${ref}" is already voided`); this.name = 'SaleAlreadyVoidedError' }
}

export class SaleNotPendingError extends Error {
  constructor(status: string) { super(`Sale is not pending (status: ${status})`); this.name = 'SaleNotPendingError' }
}

export class SalePaymentExceedsBalanceError extends Error {
  constructor(amount: string, balance: string) {
    super(`Payment amount R${amount} exceeds remaining balance R${balance}`)
    this.name = 'SalePaymentExceedsBalanceError'
  }
}

export class ProductInactiveError extends Error {
  constructor(code: string) { super(`Product "${code}" is inactive`); this.name = 'ProductInactiveError' }
}

export class InsufficientStockError extends Error {
  constructor(name: string) { super(`Insufficient stock for "${name}"`); this.name = 'InsufficientStockError' }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Reference number generated inside the transaction so it's atomic with the insert
async function generateRefNumber(tx: TxClient): Promise<string> {
  const today = new Date()
  const prefix = `SAL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const count = await tx.sale.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

// Retries on PostgreSQL serialization failures (P2034 / 40001)
async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn()
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code
      if (attempt < 3 && (code === 'P2034' || code === '40001')) continue
      throw e
    }
  }
  throw new Error('unreachable')
}

// ─── Create Sale ──────────────────────────────────────────────────────────────

export async function createSale(data: CreateSaleInput, createdByUserId?: string) {
  // Validate products outside transaction — read-only, no race risk
  const resolvedLines = await Promise.all(
    data.lines.map(async (line) => {
      const product = await prisma.product.findUnique({ where: { id: line.productId } })
      if (!product) throw new Error(`Product "${line.productId}" not found`)
      if (!product.isActive) throw new ProductInactiveError(product.code)

      const unitPrice = new Decimal(line.unitPrice)
      const quantity  = new Decimal(line.quantity)
      const lineTotal = unitPrice.times(quantity)

      return {
        productId:       line.productId,
        productName:     product.name,
        quantity,
        unitPrice,
        lineTotal,
        grossQty:        line.grossQty        ? new Decimal(line.grossQty)        : undefined,
        tareQty:         line.tareQty         ? new Decimal(line.tareQty)         : undefined,
        tareReason:      line.tareReason,
        deductionQty:    line.deductionQty    ? new Decimal(line.deductionQty)    : undefined,
        deductionReason: line.deductionReason,
      }
    })
  )

  const totalAmount = resolvedLines.reduce((sum, l) => sum.plus(l.lineTotal), new Decimal(0))

  const sale = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      // Ref number inside tx — races resolved by Serializable isolation
      const refNumber = await generateRefNumber(tx)

      // Stock check inside tx — eliminates TOCTOU window between check and write
      for (const line of resolvedLines) {
        const inAgg = await tx.stockMovement.aggregate({
          where: { productId: line.productId, direction: 'in' },
          _sum: { quantity: true },
        })
        const outAgg = await tx.stockMovement.aggregate({
          where: { productId: line.productId, direction: 'out' },
          _sum: { quantity: true },
        })
        const onHand = new Decimal(inAgg._sum.quantity?.toString() ?? '0')
          .minus(new Decimal(outAgg._sum.quantity?.toString() ?? '0'))
        if (line.quantity.gt(onHand)) throw new InsufficientStockError(line.productName)
      }

      const isPending = data.status === 'pending'

      const s = await tx.sale.create({
        data: {
          refNumber,
          customerId:           data.customerId,
          buyerId:              data.buyerId,
          buyerName:            data.buyerName,
          buyerIdNumber:        data.buyerIdNumber,
          buyerPhone:           data.buyerPhone,
          status:               isPending ? 'pending' : 'completed',
          totalAmount,
          paymentMethod:        data.paymentMethod ?? 'cash',
          amountPaid:           isPending ? new Decimal(0) : totalAmount,
          hasOutstandingBalance: isPending,
          notes:                data.notes,
          createdByUserId,
          lines: {
            create: resolvedLines.map((l) => ({
              productId:       l.productId,
              quantity:        l.quantity,
              unitPrice:       l.unitPrice,
              lineTotal:       l.lineTotal,
              grossQty:        l.grossQty,
              tareQty:         l.tareQty,
              tareReason:      l.tareReason,
              deductionQty:    l.deductionQty,
              deductionReason: l.deductionReason,
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
          quantity:  line.quantity,
          source:    'sale',
          sourceId:  s.id,
          createdByUserId,
        })
      }

      return s
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info({ saleId: sale.id, refNumber: sale.refNumber, totalAmount: totalAmount.toFixed(2), createdByUserId }, 'sale.created')
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
        quantity:  new Decimal(l.quantity.toString()),
      })),
      sourceId:       id,
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

// ─── Mark Sale Paid ───────────────────────────────────────────────────────────

export async function markSalePaid(
  id: string,
  data: { amount: string; paymentMethod: string },
  userId: string
) {
  const result = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id } })
      if (sale.status !== 'pending') throw new SaleNotPendingError(sale.status)

      const totalAmount  = new Decimal(sale.totalAmount.toString())
      const currentPaid  = new Decimal(sale.amountPaid?.toString() ?? '0')
      const outstanding  = totalAmount.minus(currentPaid)
      const settleAmount = new Decimal(data.amount)

      if (settleAmount.greaterThan(outstanding)) {
        throw new SalePaymentExceedsBalanceError(settleAmount.toFixed(2), outstanding.toFixed(2))
      }

      const isFullySettled = currentPaid.plus(settleAmount).gte(totalAmount)

      const updated = await tx.sale.update({
        where: { id },
        data: {
          amountPaid:           { increment: settleAmount },
          paymentMethod:        data.paymentMethod as Prisma.SaleUpdateInput['paymentMethod'],
          hasOutstandingBalance: !isFullySettled,
          ...(isFullySettled ? { status: 'completed' } : {}),
        },
      })

      // Payment record for cash-up
      const today = new Date()
      const prefix = `PAY-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const payCount = await tx.payment.count({ where: { createdAt: { gte: startOfDay } } })
      const refNumber = `${prefix}-${String(payCount + 1).padStart(4, '0')}`

      await tx.payment.create({
        data: {
          refNumber,
          ...(sale.customerId ? { customerId: sale.customerId } : {}),
          amount:          settleAmount,
          paymentMethod:   data.paymentMethod as 'cash' | 'eft' | 'cheque' | 'amplopay',
          notes:           `Settlement of sale ${sale.refNumber}`,
          createdByUserId: userId,
        } as Prisma.PaymentUncheckedCreateInput,
      })

      return { updated, isFullySettled }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info(
    { saleId: id, userId, settleAmount: data.amount, isFullySettled: result.isFullySettled },
    'sale.payment.recorded'
  )
  return result
}

// ─── Update Sale Photos ───────────────────────────────────────────────────────

export async function updateSalePhotos(
  id: string,
  action: { add?: string; remove?: string },
  userId: string
) {
  const sale = await prisma.sale.findUnique({ where: { id }, select: { photoR2Keys: true } })
  if (!sale) throw new SaleNotFoundError(id)

  if (!action.add && !action.remove) throw new Error('Provide add or remove')

  const keys = action.add
    ? [...(sale.photoR2Keys ?? []), action.add]
    : (sale.photoR2Keys ?? []).filter((k) => k !== action.remove)

  const updated = await prisma.sale.update({
    where:  { id },
    data:   { photoR2Keys: keys },
    select: { photoR2Keys: true },
  })

  logger.info({ saleId: id, userId, action: action.add ? 'photo_added' : 'photo_removed' }, 'sale.photos.updated')
  return updated
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
  const page     = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50
  const skip     = (page - 1) * pageSize

  const where = {
    ...(opts?.status        && { status:        opts.status        as 'completed' | 'voided' | 'pending' }),
    ...(opts?.paymentMethod && { paymentMethod: opts.paymentMethod as 'cash' | 'eft' | 'cheque' | 'amplopay' }),
    ...(opts?.from || opts?.to ? {
      createdAt: {
        ...(opts?.from && { gte: opts.from }),
        ...(opts?.to   && { lte: opts.to }),
      },
    } : {}),
    ...(opts?.search && {
      OR: [
        { refNumber:     { contains: opts.search, mode: 'insensitive' as const } },
        { buyerName:     { contains: opts.search, mode: 'insensitive' as const } },
        { buyerIdNumber: { contains: opts.search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include:  { lines: { select: { id: true } } },
      orderBy:  { createdAt: 'desc' },
      skip,
      take:     pageSize,
    }),
    prisma.sale.count({ where }),
  ])

  return { sales, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}
