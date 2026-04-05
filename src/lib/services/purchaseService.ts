import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { resolvePrice } from '@/lib/services/productService'
import { recordMovement, recordVoidReversal } from '@/lib/services/stockService'
import type { CreatePurchaseInput, VoidPurchaseInput } from '@/lib/schemas/purchase'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class PurchaseNotFoundError extends Error {
  constructor(id: string) { super(`Purchase "${id}" not found`); this.name = 'PurchaseNotFoundError' }
}

export class PurchaseAlreadyVoidedError extends Error {
  constructor(ref: string) { super(`Purchase "${ref}" is already voided`); this.name = 'PurchaseAlreadyVoidedError' }
}

export class CustomerBlacklistedError extends Error {
  constructor() { super('Customer is blacklisted and cannot complete a purchase'); this.name = 'CustomerBlacklistedError' }
}

export class CustomerInactiveError extends Error {
  constructor() { super('Customer account is inactive'); this.name = 'CustomerInactiveError' }
}

export class ProductInactiveError extends Error {
  constructor(code: string) { super(`Product "${code}" is inactive`); this.name = 'ProductInactiveError' }
}

// ─── Reference number generator ───────────────────────────────────────────────

async function generateRefNumber(): Promise<string> {
  const today = new Date()
  const prefix = `PUR-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  // Count purchases today for sequence
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const count = await prisma.purchase.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

// ─── Create Purchase ──────────────────────────────────────────────────────────

export async function createPurchase(data: CreatePurchaseInput, createdByUserId?: string) {
  // Validate customer
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } })
  if (!customer) throw new Error('Customer not found')
  if (customer.blacklisted) throw new CustomerBlacklistedError()
  if (!customer.isActive) throw new CustomerInactiveError()

  // Validate all products and resolve prices
  const resolvedLines = await Promise.all(
    data.lines.map(async (line) => {
      const product = await prisma.product.findUnique({ where: { id: line.productId } })
      if (!product) throw new Error(`Product "${line.productId}" not found`)
      if (!product.isActive) throw new ProductInactiveError(product.code)

      // Use submitted unit price (cashier may override) but resolve default for reference
      const resolved = await resolvePrice(line.productId, customer.priceGroupId)
      const unitPrice = new Decimal(line.unitPrice)
      const quantity = new Decimal(line.quantity)
      const lineTotal = unitPrice.times(quantity)

      return {
        productId: line.productId,
        quantity,
        unitPrice,
        lineTotal,
        priceSource: resolved.source,
      }
    })
  )

  const totalAmount = resolvedLines.reduce((sum, l) => sum.plus(l.lineTotal), new Decimal(0))
  const refNumber = await generateRefNumber()

  const purchase = await prisma.$transaction(async (tx) => {
    const p = await tx.purchase.create({
      data: {
        refNumber,
        customerId: data.customerId,
        status: data.status ?? 'completed',
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
            priceSource: l.priceSource,
          })),
        },
      },
      include: { lines: { include: { product: true } }, customer: true },
    })

    // Stock IN: yard received material from customer
    for (const line of resolvedLines) {
      await recordMovement(tx, {
        productId: line.productId,
        direction: 'in',
        quantity: line.quantity,
        source: 'purchase',
        sourceId: p.id,
        createdByUserId,
      })
    }

    return p
  })

  logger.info({ purchaseId: purchase.id, refNumber, customerId: data.customerId, totalAmount: totalAmount.toFixed(2), createdByUserId }, 'purchase.created')
  return purchase
}

// ─── Void Purchase ────────────────────────────────────────────────────────────

export async function voidPurchase(id: string, data: VoidPurchaseInput, voidedById?: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!purchase) throw new PurchaseNotFoundError(id)
  if (purchase.status === 'voided') throw new PurchaseAlreadyVoidedError(purchase.refNumber)

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.purchase.update({
      where: { id },
      data: { status: 'voided', voidedAt: new Date(), voidedById, voidReason: data.reason },
      include: { lines: { include: { product: true } }, customer: true },
    })

    // Reverse stock: remove the IN movements that came from this purchase
    await recordVoidReversal(tx, {
      originalMovements: purchase.lines.map((l) => ({
        productId: l.productId,
        direction: 'in' as const,
        quantity: new Decimal(l.quantity.toString()),
      })),
      sourceId: id,
      createdByUserId: voidedById,
    })

    return p
  })

  logger.info({ purchaseId: id, refNumber: purchase.refNumber, voidedById }, 'purchase.voided')
  return updated
}

// ─── Get Purchase ─────────────────────────────────────────────────────────────

export async function getPurchase(id: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: {
        include: { product: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!purchase) throw new PurchaseNotFoundError(id)
  return purchase
}

// ─── List Purchases ───────────────────────────────────────────────────────────

export async function listPurchases(opts?: {
  customerId?: string
  status?: string
  from?: Date
  to?: Date
  search?: string
  page?: number
  pageSize?: number
}) {
  const page = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50
  const skip = (page - 1) * pageSize

  const where = {
    ...(opts?.customerId && { customerId: opts.customerId }),
    ...(opts?.status && { status: opts.status as 'completed' | 'voided' | 'pending' }),
    ...(opts?.from || opts?.to ? {
      createdAt: {
        ...(opts.from && { gte: opts.from }),
        ...(opts.to && { lte: opts.to }),
      },
    } : {}),
    ...(opts?.search && {
      OR: [
        { refNumber: { contains: opts.search, mode: 'insensitive' as const } },
        { customer: { firstName: { contains: opts.search, mode: 'insensitive' as const } } },
        { customer: { lastName: { contains: opts.search, mode: 'insensitive' as const } } },
        { customer: { idNumber: { contains: opts.search, mode: 'insensitive' as const } } },
      ],
    }),
  }

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        lines: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.purchase.count({ where }),
  ])

  return { purchases, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}
