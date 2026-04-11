import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import type { CreatePaymentInput, VoidPaymentInput } from '@/lib/schemas/payment'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class PaymentNotFoundError extends Error {
  constructor(id: string) { super(`Payment "${id}" not found`); this.name = 'PaymentNotFoundError' }
}

export class PaymentAlreadyVoidedError extends Error {
  constructor(ref: string) { super(`Payment "${ref}" is already voided`); this.name = 'PaymentAlreadyVoidedError' }
}

export class CustomerNotFoundError extends Error {
  constructor(id: string) { super(`Customer "${id}" not found`); this.name = 'CustomerNotFoundError' }
}

// ─── Reference generator ─────────────────────────────────────────────────────

async function generateRefNumber(): Promise<string> {
  const today = new Date()
  const prefix = `PAY-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const count = await prisma.payment.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

// ─── Customer Balance ─────────────────────────────────────────────────────────
// Balance = total purchases (what yard owes customer) minus total payments made out.
// A positive balance means the yard still owes the customer money.

export async function getCustomerBalance(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, firstName: true, lastName: true, idNumber: true, customerType: true },
  })
  if (!customer) throw new CustomerNotFoundError(customerId)

  const [purchaseAgg, paymentAgg] = await Promise.all([
    prisma.purchase.aggregate({
      where: { customerId, status: 'completed' },
      _sum: { totalAmount: true },
    }),
    prisma.payment.aggregate({
      where: { customerId, voidedAt: null },
      _sum: { amount: true },
    }),
  ])

  const totalPurchases = new Decimal(purchaseAgg._sum.totalAmount?.toString() ?? '0')
  const totalPaid = new Decimal(paymentAgg._sum.amount?.toString() ?? '0')
  const balance = totalPurchases.minus(totalPaid)

  return {
    customer,
    totalPurchases,
    totalPaid,
    balance,
    // Positive = yard owes customer; Negative = customer overpaid (credit)
    hasOutstanding: balance.greaterThan(0),
  }
}

// ─── Create Payment ───────────────────────────────────────────────────────────

export async function createPayment(data: CreatePaymentInput, createdByUserId?: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { id: true, customerType: true, blacklisted: true, isActive: true },
  })
  if (!customer) throw new CustomerNotFoundError(data.customerId)

  const refNumber = await generateRefNumber()

  const payment = await prisma.payment.create({
    data: {
      refNumber,
      customerId: data.customerId,
      amount: new Decimal(data.amount),
      paymentMethod: data.paymentMethod ?? 'cash',
      notes: data.notes,
      createdByUserId,
    },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
    },
  })

  logger.info({ paymentId: payment.id, refNumber, customerId: data.customerId, amount: data.amount, createdByUserId }, 'payment.created')
  return payment
}

// ─── Void Payment ─────────────────────────────────────────────────────────────

export async function voidPayment(id: string, data: VoidPaymentInput, voidedById?: string) {
  const payment = await prisma.payment.findUnique({ where: { id } })
  if (!payment) throw new PaymentNotFoundError(id)
  if (payment.voidedAt) throw new PaymentAlreadyVoidedError(payment.refNumber)

  const updated = await prisma.payment.update({
    where: { id },
    data: { voidedAt: new Date(), voidedById, voidReason: data.reason },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
    },
  })

  logger.info({ paymentId: id, refNumber: payment.refNumber, voidedById }, 'payment.voided')
  return updated
}

// ─── Get Payment ──────────────────────────────────────────────────────────────

export async function getPayment(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, idNumber: true, phone: true } },
    },
  })
  if (!payment) throw new PaymentNotFoundError(id)
  return payment
}

// ─── List Payments ────────────────────────────────────────────────────────────

export async function listPayments(opts?: {
  customerId?: string
  from?: Date
  to?: Date
  search?: string
  includeVoided?: boolean
  page?: number
  pageSize?: number
}) {
  const page = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50
  const skip = (page - 1) * pageSize

  const where = {
    ...(opts?.customerId && { customerId: opts.customerId }),
    ...(!opts?.includeVoided && { voidedAt: null }),
    ...(opts?.from || opts?.to ? {
      createdAt: {
        ...(opts?.from && { gte: opts.from }),
        ...(opts?.to && { lte: opts.to }),
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

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ])

  return { payments, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}

// ─── List Customers with Balances ────────────────────────────────────────────

export async function listCustomerBalances() {
  const accountCustomers = await prisma.customer.findMany({
    where: { isActive: true },
    select: { id: true, firstName: true, lastName: true, idNumber: true, phone: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const balances = await Promise.all(
    accountCustomers.map(async (c) => {
      const [purchaseAgg, paymentAgg] = await Promise.all([
        prisma.purchase.aggregate({
          where: { customerId: c.id, status: 'completed' },
          _sum: { totalAmount: true },
        }),
        prisma.payment.aggregate({
          where: { customerId: c.id, voidedAt: null },
          _sum: { amount: true },
        }),
      ])

      const totalPurchases = new Decimal(purchaseAgg._sum.totalAmount?.toString() ?? '0')
      const totalPaid = new Decimal(paymentAgg._sum.amount?.toString() ?? '0')
      const balance = totalPurchases.minus(totalPaid)

      return { ...c, totalPurchases: totalPurchases.toFixed(2), totalPaid: totalPaid.toFixed(2), balance: balance.toFixed(2) }
    })
  )

  return balances
}
