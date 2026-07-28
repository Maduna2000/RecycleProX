import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import { Prisma } from '@prisma/client'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import type { CreateScaleOrderInput, VoidScaleOrderInput } from '@/lib/schemas/scale'
import { ciContains } from '@/lib/db/queryHelpers'
import { encodePhotoKeys } from '@/lib/offline/photoKeysCodec'
import { quickCreate } from './customerService'

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

export class GateQueueNumberAlreadyUsedError extends Error {
  constructor() { super('This gate visit has already been used to start an order'); this.name = 'GateQueueNumberAlreadyUsedError' }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export interface ScaleOrderFilters {
  dateFrom?:     string
  dateTo?:       string
  status?:       'pending' | 'processed' | 'voided'
  operatorId?:   string
  productId?:    string
  categoryName?: string
  customerType?: 'casual' | 'account'
  customerId?:   string
  /** Only orders with no linked Purchase yet — used by the "Load from Scale Order" picker. */
  unlinkedOnly?: boolean
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
  customer:        { firstName: string; lastName: string; phone: string; idNumber?: string | null } | null
  casualFirstName: string | null
  casualLastName:  string | null
  casualPhone:     string | null
  casualIdNumber:  string | null
}

export function resolveCustomerName(o: OrderWithCustomer): string {
  if (o.customer) return `${o.customer.firstName} ${o.customer.lastName}`
  return `${o.casualFirstName ?? ''} ${o.casualLastName ?? ''}`.trim() || 'Walk-in'
}

export function resolveCustomerPhone(o: OrderWithCustomer): string {
  return o.customer?.phone ?? o.casualPhone ?? ''
}

export function resolveCustomerIdNumber(o: OrderWithCustomer): string {
  return o.customer?.idNumber ?? o.casualIdNumber ?? ''
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createScaleOrder(data: CreateScaleOrderInput, operatorId: string) {
  // Auto-save casual customer to Customer table if idNumber is provided
  if (!data.customerId && data.casualIdNumber && data.casualFirstName && data.casualLastName && data.casualPhone) {
    const savedCustomer = await quickCreate({
      idNumber: data.casualIdNumber,
      firstName: data.casualFirstName,
      lastName: data.casualLastName,
      phone: data.casualPhone,
      physicalAddress: data.casualAddress,
    }, operatorId)

    // Link saved customer to scale order
    data.customerId = savedCustomer.id
    // Clear casual fields since we now have customerId
    data.casualFirstName = undefined
    data.casualLastName = undefined
    data.casualPhone = undefined
    data.casualIdNumber = undefined
    data.casualAddress = undefined
  }

  if (data.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } })
    if (!customer) throw new ScaleCustomerNotFoundError()
  }

  for (const line of data.lines) {
    const product = await prisma.product.findUnique({ where: { id: line.productId } })
    if (!product || !product.isActive) throw new ScaleProductInactiveError()
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const firstLine   = data.lines[0]!
  const firstWeight = firstLine.weight ? new Decimal(firstLine.weight).toDecimalPlaces(3) : null

  const order = await prisma.$transaction(async (tx) => {
    const tenantId = requireTenantId()

    // Consuming a queue number is atomic with the order it produces — a
    // lookup alone (getGateEntryByQueueNumber) never marks anything used;
    // only an order that actually gets created here does. Re-checked here
    // (not just at lookup time) so two operators can't race the same number.
    if (data.gateEntryId) {
      const gateEntry = await tx.gateEntry.findUnique({ where: { id: data.gateEntryId } })
      if (gateEntry?.queueNumberUsedAt) throw new GateQueueNumberAlreadyUsedError()
      await tx.gateEntry.update({ where: { id: data.gateEntryId }, data: { queueNumberUsedAt: new Date() } })
    }

    const orderNumber = await generateOrderNumber(tx, new Date())
    const created = await tx.scaleOrder.create({
      data: {
        tenantId,
        orderNumber,
        customerId:      data.customerId ?? null,
        casualFirstName: data.customerId ? null : (data.casualFirstName ?? null),
        casualLastName:  data.customerId ? null : (data.casualLastName  ?? null),
        casualPhone:     data.customerId ? null : (data.casualPhone     ?? null),
        casualIdNumber:  data.customerId ? null : (data.casualIdNumber  ?? null),
        productId:       firstLine.productId,
        weight:          firstWeight,
        photoR2Keys:     encodePhotoKeys(firstLine.photoR2Keys ?? []),
        lineCount:       data.lines.length,
        status:          'pending',
        operatorId,
        notes:           data.notes,
        gateEntryId:     data.gateEntryId ?? null,
      },
    })

    await tx.scaleOrderLine.createMany({
      data: data.lines.map(line => ({
        tenantId,
        orderId:     created.id,
        productId:   line.productId,
        weight:      line.weight ? new Decimal(line.weight).toDecimalPlaces(3) : null,
        photoR2Keys: encodePhotoKeys(line.photoR2Keys ?? []),
      })),
    })

    return tx.scaleOrder.findUniqueOrThrow({
      where:   { id: created.id },
      include: {
        customer: true,
        product:  true,
        operator: true,
        lines:    { include: { product: true }, orderBy: { createdAt: 'asc' } },
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
    include: { customer: true, product: true, operator: true },
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
    include: { customer: true, product: true, operator: true },
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
  if (filters.customerId) where.customerId = filters.customerId
  if (filters.unlinkedOnly) where.purchase = null

  // Category must match ANY line of the order (orders can carry multiple
  // products); a parent category also matches its sub-categories. Legacy
  // orders without line rows fall back to the header product.
  if (filters.categoryName) {
    const categoryMatch: Prisma.ProductWhereInput = {
      OR: [
        { category: filters.categoryName },
        { categoryRef: { parent: { name: filters.categoryName } } },
      ],
    }
    andConditions.push({
      OR: [
        { lines: { some: { product: categoryMatch } } },
        { lines: { none: {} }, product: categoryMatch },
      ],
    })
  }

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
        { orderNumber:      ciContains(s) },
        { casualFirstName:  ciContains(s) },
        { casualLastName:   ciContains(s) },
        { customer: { firstName: ciContains(s) } },
        { customer: { lastName:  ciContains(s) } },
      ],
    })
  }

  if (andConditions.length > 0) where.AND = andConditions

  const [orders, total] = await prisma.$transaction(async (tx) => [
    await tx.scaleOrder.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, customerType: true } },
        product:  { select: { id: true, name: true, unit: true, category: true } },
        operator: { select: { id: true, fullName: true } },
        lines:    { include: { product: { select: { name: true, unit: true, category: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    await tx.scaleOrder.count({ where }),
  ])

  return { orders, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

// ─── Get single order (with photos) ──────────────────────────────────────────

export async function getScaleOrderById(id: string) {
  const order = await prisma.scaleOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      product:  true,
      operator: { select: { id: true, fullName: true } },
      voidedBy: { select: { id: true, fullName: true } },
      lines:    { include: { product: true }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!order) throw new ScaleOrderNotFoundError(id)
  return order
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export async function getScaleStats() {
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const [todayTotal, todayPending, todayProcessed, todayVoided, lineWeightSum, legacyWeightSum] = await prisma.$transaction(async (tx) => [
    await tx.scaleOrder.count({ where: { createdAt: { gte: startOfDay } } }),
    await tx.scaleOrder.count({ where: { createdAt: { gte: startOfDay }, status: 'pending' } }),
    await tx.scaleOrder.count({ where: { createdAt: { gte: startOfDay }, status: 'processed' } }),
    await tx.scaleOrder.count({ where: { createdAt: { gte: startOfDay }, status: 'voided' } }),
    // Sum EVERY line's weight — the order header only carries the first line
    await tx.scaleOrderLine.aggregate({
      where: { order: { createdAt: { gte: startOfDay }, status: { not: 'voided' } } },
      _sum: { weight: true },
    }),
    // Legacy orders created before per-line rows existed
    await tx.scaleOrder.aggregate({
      where: { createdAt: { gte: startOfDay }, status: { not: 'voided' }, lines: { none: {} } },
      _sum: { weight: true },
    }),
  ])

  const todayWeight = new Decimal(lineWeightSum._sum.weight?.toString() ?? '0')
    .plus(legacyWeightSum._sum.weight?.toString() ?? '0')

  return {
    todayTotal,
    todayPending,
    todayProcessed,
    todayVoided,
    todayWeightKg: todayWeight.toFixed(2),
  }
}

// ─── Export data (CSV/Excel) ──────────────────────────────────────────────────

export async function getAllScaleOrdersForExport(filters: Omit<ScaleOrderFilters, 'page' | 'pageSize'>) {
  const result = await listScaleOrders({ ...filters, page: 1, pageSize: 10000 })
  return result.orders
}
