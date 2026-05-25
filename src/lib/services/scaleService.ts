import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import type { CreateScaleOrderInput, VoidScaleOrderInput } from '@/lib/schemas/scale'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class ScaleOrderNotFoundError extends Error {
  constructor(id: string) { super(`ScaleOrder "${id}" not found`); this.name = 'ScaleOrderNotFoundError' }
}

export class ScaleOrderAlreadyVoidedError extends Error {
  constructor(ref: string) { super(`ScaleOrder "${ref}" is already voided`); this.name = 'ScaleOrderAlreadyVoidedError' }
}

export class ScaleOrderAlreadyProcessedError extends Error {
  constructor(ref: string) { super(`ScaleOrder "${ref}" is already processed`); this.name = 'ScaleOrderAlreadyProcessedError' }
}

export class ScaleCustomerNotFoundError extends Error {
  constructor() { super('Customer not found'); this.name = 'ScaleCustomerNotFoundError' }
}

export class ScaleProductInactiveError extends Error {
  constructor() { super('Selected product is inactive'); this.name = 'ScaleProductInactiveError' }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export interface ScaleOrderFilters {
  dateFrom?:     string
  dateTo?:       string
  status?:       'pending' | 'processed' | 'voided'
  operatorId?:   string
  productId?:    string
  categoryId?:   string
  customerType?: 'casual' | 'account'
  search?:       string
  page?:         number
  pageSize?:     number
}

// ─── Order number generator (atomic inside transaction) ───────────────────────

async function generateOrderNumber(tx: TxClient, date: Date): Promise<string> {
  const y  = date.getFullYear()
  const m  = String(date.getMonth() + 1).padStart(2, '0')
  const d  = String(date.getDate()).padStart(2, '0')
  const prefix = `SCL-${y}${m}${d}`
  const startOfDay = new Date(y, date.getMonth(), date.getDate())
  const count = await tx.scaleOrder.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

// ─── Customer display helpers ─────────────────────────────────────────────────

type OrderWithCustomer = {
  customer:        { firstName: string; lastName: string; phone: string } | null
  casualFirstName: string | null
  casualLastName:  string | null
  casualPhone:     string | null
}

export function resolveCustomerName(o: OrderWithCustomer): string {
  if (o.customer) return `${o.customer.firstName} ${o.customer.lastName}`
  return `${o.casualFirstName ?? ''} ${o.casualLastName ?? ''}`.trim() || 'Walk-in'
}

export function resolveCustomerPhone(o: OrderWithCustomer): string {
  return o.customer?.phone ?? o.casualPhone ?? ''
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createScaleOrder(data: CreateScaleOrderInput, operatorId: string) {
  if (data.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } })
    if (!customer) throw new ScaleCustomerNotFoundError()
  }

  for (const line of data.lines) {
    const product = await prisma.scaleProduct.findUnique({ where: { id: line.productId } })
    if (!product || !product.isActive) throw new ScaleProductInactiveError()
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const firstLine   = data.lines[0]!
  const firstWeight = new Decimal(firstLine.weight)

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await generateOrderNumber(tx, new Date())
    const created = await tx.scaleOrder.create({
      data: {
        orderNumber,
        customerId:      data.customerId ?? null,
        casualFirstName: data.customerId ? null : (data.casualFirstName ?? null),
        casualLastName:  data.customerId ? null : (data.casualLastName  ?? null),
        casualPhone:     data.customerId ? null : (data.casualPhone     ?? null),
        productId:       firstLine.productId,
        weight:          firstWeight.toDecimalPlaces(3),
        photoR2Keys:     firstLine.photoR2Keys,
        lineCount:       data.lines.length,
        status:          'pending',
        operatorId,
        notes:           data.notes,
      },
    })

    await tx.scaleOrderLine.createMany({
      data: data.lines.map(line => ({
        orderId:     created.id,
        productId:   line.productId,
        weight:      new Decimal(line.weight).toDecimalPlaces(3),
        photoR2Keys: line.photoR2Keys,
      })),
    })

    return tx.scaleOrder.findUniqueOrThrow({
      where:   { id: created.id },
      include: {
        customer: true,
        product:  { include: { category: true } },
        operator: true,
        lines:    { include: { product: { include: { category: true } } }, orderBy: { createdAt: 'asc' } },
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  logger.info({ orderId: order.id, orderNumber: order.orderNumber, operatorId, lineCount: data.lines.length }, 'scaleOrder.created')
  return order
}

// ─── Void ─────────────────────────────────────────────────────────────────────

export async function voidScaleOrder(id: string, data: VoidScaleOrderInput, voidedById: string) {
  const order = await prisma.scaleOrder.findUnique({ where: { id } })
  if (!order) throw new ScaleOrderNotFoundError(id)
  if (order.status === 'voided') throw new ScaleOrderAlreadyVoidedError(order.orderNumber)

  const updated = await prisma.scaleOrder.update({
    where: { id },
    data: { status: 'voided', voidedAt: new Date(), voidedById, voidReason: data.voidReason },
    include: { customer: true, product: { include: { category: true } }, operator: true },
  })
  logger.info({ orderId: id, voidedById }, 'scaleOrder.voided')
  return updated
}

// ─── Mark Processed ───────────────────────────────────────────────────────────

export async function markProcessed(id: string, userId: string) {
  const order = await prisma.scaleOrder.findUnique({ where: { id } })
  if (!order) throw new ScaleOrderNotFoundError(id)
  if (order.status === 'voided') throw new ScaleOrderAlreadyVoidedError(order.orderNumber)
  if (order.status === 'processed') throw new ScaleOrderAlreadyProcessedError(order.orderNumber)

  const updated = await prisma.scaleOrder.update({
    where: { id },
    data: { status: 'processed' },
    include: { customer: true, product: { include: { category: true } }, operator: true },
  })
  logger.info({ orderId: id, userId }, 'scaleOrder.processed')
  return updated
}

// ─── Save slip R2 key ─────────────────────────────────────────────────────────

export async function saveSlipKey(id: string, slipR2Key: string) {
  return prisma.scaleOrder.update({ where: { id }, data: { slipR2Key } })
}

// ─── List with filters ────────────────────────────────────────────────────────

export async function listScaleOrders(filters: ScaleOrderFilters) {
  const page     = filters.page     ?? 1
  const pageSize = filters.pageSize ?? 50
  const skip     = (page - 1) * pageSize

  const where: Prisma.ScaleOrderWhereInput = {}

  const andConditions: Prisma.ScaleOrderWhereInput[] = []

  if (filters.status)     where.status     = filters.status
  if (filters.operatorId) where.operatorId = filters.operatorId
  if (filters.productId)  where.productId  = filters.productId
  if (filters.categoryId) where.product    = { categoryId: filters.categoryId }

  if (filters.customerType === 'account') {
    andConditions.push({ customerId: { not: null } })
    andConditions.push({ customer: { customerType: 'account' } })
  } else if (filters.customerType === 'casual') {
    andConditions.push({
      OR: [
        { customerId: null },
        { customer: { customerType: 'casual' } },
      ],
    })
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo   ? { lte: new Date(filters.dateTo + 'T23:59:59.999Z') } : {}),
    }
  }

  if (filters.search) {
    const s = filters.search.trim()
    andConditions.push({
      OR: [
        { orderNumber:      { contains: s, mode: 'insensitive' } },
        { casualFirstName:  { contains: s, mode: 'insensitive' } },
        { casualLastName:   { contains: s, mode: 'insensitive' } },
        { customer: { firstName: { contains: s, mode: 'insensitive' } } },
        { customer: { lastName:  { contains: s, mode: 'insensitive' } } },
      ],
    })
  }

  if (andConditions.length > 0) where.AND = andConditions

  const [orders, total] = await prisma.$transaction([
    prisma.scaleOrder.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, customerType: true } },
        product:  { include: { category: true } },
        operator: { select: { id: true, fullName: true } },
        lines:    { include: { product: { select: { name: true, unit: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.scaleOrder.count({ where }),
  ])

  return { orders, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

// ─── Get single order (with photos) ──────────────────────────────────────────

export async function getScaleOrderById(id: string) {
  const order = await prisma.scaleOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      product:  { include: { category: true } },
      operator: { select: { id: true, fullName: true } },
      voidedBy: { select: { id: true, fullName: true } },
      lines:    { include: { product: { include: { category: true } } }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!order) throw new ScaleOrderNotFoundError(id)
  return order
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export async function getScaleStats() {
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const [todayTotal, todayPending, todayProcessed, todayVoided, totalWeightResult] = await prisma.$transaction([
    prisma.scaleOrder.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.scaleOrder.count({ where: { createdAt: { gte: startOfDay }, status: 'pending' } }),
    prisma.scaleOrder.count({ where: { createdAt: { gte: startOfDay }, status: 'processed' } }),
    prisma.scaleOrder.count({ where: { createdAt: { gte: startOfDay }, status: 'voided' } }),
    prisma.scaleOrder.aggregate({
      where: { createdAt: { gte: startOfDay }, status: { not: 'voided' } },
      _sum: { weight: true },
    }),
  ])

  return {
    todayTotal,
    todayPending,
    todayProcessed,
    todayVoided,
    todayWeightKg: totalWeightResult._sum.weight
      ? new Decimal(totalWeightResult._sum.weight.toString()).toFixed(3)
      : '0.000',
  }
}

// ─── Export data (CSV/Excel) ──────────────────────────────────────────────────

export async function getAllScaleOrdersForExport(filters: Omit<ScaleOrderFilters, 'page' | 'pageSize'>) {
  const result = await listScaleOrders({ ...filters, page: 1, pageSize: 10000 })
  return result.orders
}
