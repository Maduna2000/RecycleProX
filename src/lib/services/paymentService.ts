import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import { Prisma } from '@prisma/client'
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

export class PaymentExceedsBalanceError extends Error {
  constructor(amount: string, balance: string) { super(`Payment amount (R ${amount}) exceeds outstanding balance (R ${balance})`); this.name = 'PaymentExceedsBalanceError' }
}

// ─── Reference generator ─────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Generated inside the transaction so it's atomic with the insert
async function generateRefNumber(tx: TxClient): Promise<string> {
  const today = new Date()
  const prefix = `PAY-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const count = await tx.payment.count({ where: { createdAt: { gte: startOfDay } } })
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
    // source: 'purchase' only — a customer who is also a buyer (has Sales)
    // can have source:'sale' Payment rows too (money they paid IN to settle
    // a sale). Those are the opposite direction and must not net against
    // "what the yard owes this customer for purchases".
    prisma.payment.aggregate({
      where: { customerId, voidedAt: null, source: 'purchase' },
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
  const tenantId = requireTenantId()
  const amount = new Decimal(data.amount)

  const payment = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: data.customerId },
        select: { id: true, customerType: true, blacklisted: true, isActive: true },
      })
      if (!customer) throw new CustomerNotFoundError(data.customerId)

      // Balance check re-read inside the Serializable transaction — mirrors
      // getCustomerBalance()'s aggregate logic (including the source:
      // 'purchase' filter — see its own comment), scoped to tx so a
      // concurrent payment can't both pass the check against stale totals.
      const [purchaseAgg, paymentAgg] = await Promise.all([
        tx.purchase.aggregate({
          where: { customerId: data.customerId, status: 'completed' },
          _sum: { totalAmount: true },
        }),
        tx.payment.aggregate({
          where: { customerId: data.customerId, voidedAt: null, source: 'purchase' },
          _sum: { amount: true },
        }),
      ])
      const totalPurchases = new Decimal(purchaseAgg._sum.totalAmount?.toString() ?? '0')
      const totalPaid = new Decimal(paymentAgg._sum.amount?.toString() ?? '0')
      const balance = totalPurchases.minus(totalPaid)

      if (amount.greaterThan(balance)) {
        throw new PaymentExceedsBalanceError(amount.toFixed(2), balance.toFixed(2))
      }

      const refNumber = await generateRefNumber(tx)

      return tx.payment.create({
        data: {
          tenantId,
          refNumber,
          customerId: data.customerId,
          amount,
          paymentMethod: data.paymentMethod ?? 'cash',
          notes: data.notes,
          // Manual "Record Payment" always settles what the yard owes a
          // customer from purchases — see the Payment.source field comment.
          source: 'purchase',
          createdByUserId,
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )

  logger.info({ paymentId: payment.id, refNumber: payment.refNumber, customerId: data.customerId, amount: data.amount, createdByUserId }, 'payment.created')
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

export interface UnifiedPaymentRow {
  id: string
  refNumber: string
  amount: string
  paymentMethod: string
  notes: string | null
  voidedAt: string | null
  createdAt: Date
  source: 'sale' | 'purchase'
  customer: { id: string; firstName: string; lastName: string; idNumber: string | null } | null
  sale: { id: string; refNumber: string } | null
  purchase: { id: string; refNumber: string } | null
  // True for a sale that was paid in full at creation and never went
  // through markSalePaid/processSaleSplitPayment — see the comment below on
  // why these need to be synthesized rather than read off the Payment table.
  isDirectSale: boolean
}

export async function listPayments(opts?: {
  customerId?: string
  from?: Date
  to?: Date
  search?: string
  includeVoided?: boolean
  paymentMethod?: string
  source?: 'sale' | 'purchase'
  page?: number
  pageSize?: number
  // Same admin-sale-hiding rule as listSales (saleService.ts) — a sale-
  // sourced payment or direct-sale row is invisible to everyone but the
  // admin who made the underlying sale (or another admin). Purchase-sourced
  // rows are never affected. Omitting this hides nothing.
  viewerRole?: string
}) {
  const page = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50
  const skip = (page - 1) * pageSize

  const hideAdminSales = !!opts?.viewerRole && opts.viewerRole !== 'admin'
  const adminUserIds = hideAdminSales
    ? (await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } })).map((u) => u.id)
    : []

  const where = {
    ...(opts?.customerId && { customerId: opts.customerId }),
    ...(!opts?.includeVoided && { voidedAt: null }),
    ...(opts?.paymentMethod && { paymentMethod: opts.paymentMethod as 'cash' | 'eft' }),
    ...(opts?.source && { source: opts.source }),
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
    // Only bites sale-sourced rows whose linked sale was made by an admin —
    // purchase-sourced rows (sale: null) are untouched.
    ...(hideAdminSales && adminUserIds.length > 0 && {
      NOT: { source: 'sale' as const, sale: { createdByUserId: { in: adminUserIds } } },
    }),
  }

  // A sale paid in full at creation time (the common, direct-completion
  // case) never gets a Payment row — only markSalePaid/processSaleSplitPayment
  // (settling a sale that started 'pending') create one, see Payment.source's
  // own comment. Querying the Payment table alone therefore silently drops
  // most cash sales from a "sales payments" view. Union in the direct sales
  // (status:'completed', no linked Payment) whenever this is a sales-scoped
  // request, and merge them with the real Payment rows below.
  const wantsDirectSales = opts?.source === 'sale' || !opts?.source

  const directSaleWhere = {
    status: 'completed' as const,
    payments: { none: {} },
    ...(opts?.customerId && { customerId: opts.customerId }),
    ...(opts?.paymentMethod && { paymentMethod: opts.paymentMethod as 'cash' | 'eft' }),
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
        { buyerName: { contains: opts.search, mode: 'insensitive' as const } },
      ],
    }),
    ...(hideAdminSales && adminUserIds.length > 0 && {
      createdByUserId: { notIn: adminUserIds },
    }),
  }

  // Enough rows from EACH source to guarantee the merged, sorted list's
  // first `skip + pageSize` entries are correct, regardless of how the two
  // sources interleave chronologically.
  const fetchLimit = skip + pageSize

  const [paymentRows, paymentTotal, directSales, directSalesTotal, receivedAgg, paidOutAgg, directReceivedAgg] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        sale: { select: { id: true, refNumber: true } },
        purchase: { select: { id: true, refNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
    }),
    prisma.payment.count({ where }),
    wantsDirectSales
      ? prisma.sale.findMany({
          where: directSaleWhere,
          include: { customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } } },
          orderBy: { createdAt: 'desc' },
          take: fetchLimit,
        })
      : Promise.resolve([]),
    wantsDirectSales ? prisma.sale.count({ where: directSaleWhere }) : Promise.resolve(0),
    prisma.payment.aggregate({ where: { ...where, source: 'sale' }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { ...where, source: 'purchase' }, _sum: { amount: true } }),
    wantsDirectSales
      ? prisma.sale.aggregate({ where: directSaleWhere, _sum: { totalAmount: true } })
      : Promise.resolve({ _sum: { totalAmount: null } }),
  ])

  const paymentUnified: UnifiedPaymentRow[] = payments_toUnified(paymentRows)
  const directUnified: UnifiedPaymentRow[] = directSales.map((s) => ({
    id: s.id,
    refNumber: s.refNumber,
    amount: s.totalAmount.toString(),
    paymentMethod: s.paymentMethod,
    notes: s.notes,
    voidedAt: null,
    createdAt: s.createdAt,
    source: 'sale' as const,
    customer: s.customer ?? (s.buyerName ? { id: '', firstName: s.buyerName, lastName: '', idNumber: s.buyerIdNumber } : null),
    sale: { id: s.id, refNumber: s.refNumber },
    purchase: null,
    isDirectSale: true,
  }))

  const merged = [...paymentUnified, ...directUnified].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const total = paymentTotal + directSalesTotal

  return {
    payments: merged.slice(skip, skip + pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
    totalReceived: new Decimal(receivedAgg._sum.amount?.toString() ?? '0')
      .plus(directReceivedAgg._sum.totalAmount?.toString() ?? '0').toFixed(2),
    totalPaidOut: paidOutAgg._sum.amount?.toString() ?? '0',
  }
}

function payments_toUnified(rows: Array<{
  id: string; refNumber: string; amount: unknown; paymentMethod: string; notes: string | null
  voidedAt: Date | null; createdAt: Date; source: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string | null } | null
  sale: { id: string; refNumber: string } | null; purchase: { id: string; refNumber: string } | null
}>): UnifiedPaymentRow[] {
  return rows.map((p) => ({
    id: p.id,
    refNumber: p.refNumber,
    amount: String(p.amount),
    paymentMethod: p.paymentMethod,
    notes: p.notes,
    voidedAt: p.voidedAt?.toISOString() ?? null,
    createdAt: p.createdAt,
    source: p.source as 'sale' | 'purchase',
    customer: p.customer,
    sale: p.sale,
    purchase: p.purchase,
    isDirectSale: false,
  }))
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
        // source: 'purchase' only — see getCustomerBalance's identical comment.
        prisma.payment.aggregate({
          where: { customerId: c.id, voidedAt: null, source: 'purchase' },
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
