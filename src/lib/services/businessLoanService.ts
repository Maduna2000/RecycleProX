import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import { verifyAdminPin } from '@/lib/services/authService'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import type { Prisma } from '@prisma/client'
import type { CreateBusinessLoanInput, VoidBusinessLoanInput } from '@/lib/schemas/businessLoan'
import { todaySASTDate, todaySASTDateStr } from '@/lib/utils/dayBounds'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class BusinessLoanNotFoundError extends Error {
  constructor(id: string) { super(`Business loan "${id}" not found`); this.name = 'BusinessLoanNotFoundError' }
}

export class BusinessLoanAlreadyVoidedError extends Error {
  constructor(ref: string) { super(`Business loan "${ref}" is already voided`); this.name = 'BusinessLoanAlreadyVoidedError' }
}

export class BusinessLoanHasRepaymentsError extends Error {
  constructor(ref: string) { super(`Business loan "${ref}" has repayments and cannot be voided`); this.name = 'BusinessLoanHasRepaymentsError' }
}

export class BusinessLoanAlreadySettledError extends Error {
  constructor(ref: string) { super(`Business loan "${ref}" is already settled`); this.name = 'BusinessLoanAlreadySettledError' }
}

export class BusinessLoanRepaymentExceedsBalanceError extends Error {
  constructor(balance: string) { super(`Payment amount exceeds outstanding balance of R ${balance}`); this.name = 'BusinessLoanRepaymentExceedsBalanceError' }
}

export class CustomerBlacklistedError extends Error {
  constructor() { super('Customer is blacklisted and cannot advance a business loan'); this.name = 'CustomerBlacklistedError' }
}

export class CustomerInactiveError extends Error {
  constructor() { super('Customer account is inactive'); this.name = 'CustomerInactiveError' }
}

export class CustomerNotDealerTierError extends Error {
  constructor() { super('Only Dealer 3 accounts can have a business loan recorded'); this.name = 'CustomerNotDealerTierError' }
}

export class InvalidAdminPinError extends Error {
  constructor() { super('Incorrect admin PIN'); this.name = 'InvalidAdminPinError' }
}

// ─── Reference number generators ─────────────────────────────────────────────

async function generateBusinessLoanRef(): Promise<string> {
  const prefix = `BLN-${todaySASTDateStr().replace(/-/g, '')}`
  const startOfDay = todaySASTDate()
  const count = await prisma.businessLoan.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

// ─── Apply Repayment inside an existing transaction ───────────────────────────
// Called from saleService when sale proceeds should net against a business
// loan instead of being paid to the customer. FIFO: oldest active loan for
// this customer is paid down first, mirroring applyRepaymentTx in loanService.

export async function applyBusinessLoanRepaymentTx(
  tx: Prisma.TransactionClient,
  customerId: string,
  amount: string,
  createdByUserId: string | undefined,
  saleId?: string,
): Promise<void> {
  const prefix = `BRP-${todaySASTDateStr().replace(/-/g, '')}`
  const startOfDay = todaySASTDate()

  const baseCount = await tx.businessLoanRepayment.count({ where: { createdAt: { gte: startOfDay } } })

  const activeLoans = await tx.businessLoan.findMany({
    where: { customerId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  })

  let remaining = new Decimal(amount)
  let seqOffset = 0

  for (const loan of activeLoans) {
    if (remaining.isZero()) break

    const balance = new Decimal(loan.balanceAmount.toString())
    const repayAmount = Decimal.min(remaining, balance)
    const newBalance = balance.minus(repayAmount)
    const isNowSettled = newBalance.isZero()
    const refNumber = `${prefix}-${String(baseCount + seqOffset + 1).padStart(4, '0')}`
    seqOffset++

    await tx.businessLoanRepayment.create({
      data: {
        tenantId:        requireTenantId(),
        refNumber,
        businessLoanId:  loan.id,
        customerId,
        saleId,
        amount:          repayAmount,
        paymentMethod:   'cash',
        createdByUserId,
      },
    })

    await tx.businessLoan.update({
      where: { id: loan.id },
      data: {
        balanceAmount: newBalance,
        status:        isNowSettled ? 'settled' : 'active',
      },
    })

    logger.info({ businessLoanId: loan.id, refNumber, repayAmount: repayAmount.toFixed(2), newBalance: newBalance.toFixed(2), settled: isNowSettled, saleId, createdByUserId }, 'businessLoan.repayment.from_sale')
    remaining = remaining.minus(repayAmount)
  }
}

// ─── Reverse repayments tied to a voided sale ─────────────────────────────────
// Mirrors loanService.ts's reverseRepaymentsForPurchase — see its comment for
// why this writes an offsetting negative-amount repayment rather than
// mutating/deleting the original.
export async function reverseRepaymentsForSale(
  tx: Prisma.TransactionClient,
  saleId: string,
  saleRefNumber: string,
  voidedById: string | undefined,
  actionLabel: string = 'voided',
): Promise<void> {
  const repayments = await tx.businessLoanRepayment.findMany({ where: { saleId } })
  if (repayments.length === 0) return

  const prefix = `BRP-${todaySASTDateStr().replace(/-/g, '')}`
  const startOfDay = todaySASTDate()

  for (const r of repayments) {
    const loan = await tx.businessLoan.findUniqueOrThrow({ where: { id: r.businessLoanId } })
    const restoredBalance = new Decimal(loan.balanceAmount.toString()).plus(r.amount.toString())

    await tx.businessLoan.update({
      where: { id: r.businessLoanId },
      data: { balanceAmount: restoredBalance, status: 'active' },
    })

    const count = await tx.businessLoanRepayment.count({ where: { createdAt: { gte: startOfDay } } })
    await tx.businessLoanRepayment.create({
      data: {
        tenantId:        requireTenantId(),
        refNumber:       `${prefix}-${String(count + 1).padStart(4, '0')}`,
        businessLoanId:  r.businessLoanId,
        customerId:      r.customerId,
        amount:          new Decimal(r.amount.toString()).negated(),
        paymentMethod:   r.paymentMethod,
        notes:           `Reversal — sale ${saleRefNumber} ${actionLabel}`,
        createdByUserId: voidedById,
      },
    })

    logger.info({ businessLoanId: r.businessLoanId, reversedRepaymentId: r.id, amount: r.amount.toString(), restoredBalance: restoredBalance.toFixed(2), saleId, voidedById }, 'businessLoan.repayment.reversed')
  }
}

// ─── Record a manual repayment ────────────────────────────────────────────────
// The "Record Payment" action on the Business Loan tab — pays down ONE
// specific loan directly, unlike applyBusinessLoanRepaymentTx above (which
// nets a sale's proceeds FIFO across every active loan a customer has).
// Split across cash/EFT in one action, mirroring the Purchases module's
// split-payment modal — but "vice versa": that modal pays the pending
// balance up to exactly zero in one mandatory full settlement, while this
// one pays the outstanding balanceAmount DOWN and allows a partial amount,
// since a loan owed to a dealer is naturally repaid over several visits.
// Writes one BusinessLoanRepayment row per non-zero leg so each keeps its
// own payment method on record.

export async function recordBusinessLoanRepayment(
  businessLoanId: string,
  payments: { cash: string; eft: string },
  createdByUserId?: string,
  notes?: string,
) {
  const loan = await prisma.businessLoan.findUnique({ where: { id: businessLoanId } })
  if (!loan) throw new BusinessLoanNotFoundError(businessLoanId)
  if (loan.status === 'voided')  throw new BusinessLoanAlreadyVoidedError(loan.refNumber)
  if (loan.status === 'settled') throw new BusinessLoanAlreadySettledError(loan.refNumber)

  const cash  = new Decimal(payments.cash || '0')
  const eft   = new Decimal(payments.eft  || '0')
  const total = cash.plus(eft)

  const currentBalance = new Decimal(loan.balanceAmount.toString())
  if (total.greaterThan(currentBalance)) {
    throw new BusinessLoanRepaymentExceedsBalanceError(currentBalance.toFixed(2))
  }

  const newBalance   = currentBalance.minus(total)
  const isNowSettled = newBalance.isZero()

  const prefix     = `BRP-${todaySASTDateStr().replace(/-/g, '')}`
  const startOfDay = todaySASTDate()

  const legs: { method: 'cash' | 'eft'; amount: Decimal }[] = []
  if (cash.greaterThan(0)) legs.push({ method: 'cash', amount: cash })
  if (eft.greaterThan(0))  legs.push({ method: 'eft', amount: eft })

  const repayments = await prisma.$transaction(async (tx) => {
    const baseCount = await tx.businessLoanRepayment.count({ where: { createdAt: { gte: startOfDay } } })

    const created = []
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i]!
      const refNumber = `${prefix}-${String(baseCount + i + 1).padStart(4, '0')}`
      created.push(await tx.businessLoanRepayment.create({
        data: {
          tenantId:        requireTenantId(),
          refNumber,
          businessLoanId:  loan.id,
          customerId:      loan.customerId,
          amount:          leg.amount,
          paymentMethod:   leg.method,
          notes,
          createdByUserId,
        },
      }))
    }

    await tx.businessLoan.update({
      where: { id: businessLoanId },
      data: {
        balanceAmount: newBalance,
        status:        isNowSettled ? 'settled' : 'active',
      },
    })

    return created
  })

  logger.info(
    {
      businessLoanId,
      refNumbers: repayments.map((r) => r.refNumber),
      total:      total.toFixed(2),
      newBalance: newBalance.toFixed(2),
      settled:    isNowSettled,
      createdByUserId,
    },
    'businessLoan.repayment.recorded'
  )
  return repayments
}

// ─── Create Business Loan ─────────────────────────────────────────────────────

export async function createBusinessLoan(data: CreateBusinessLoanInput, createdByUserId?: string) {
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } })
  if (!customer) throw new Error('Customer not found')
  if (customer.blacklisted) throw new CustomerBlacklistedError()
  if (!customer.isActive) throw new CustomerInactiveError()
  if (customer.dealerCategory !== 'dealer_3') throw new CustomerNotDealerTierError()

  const principal = new Decimal(data.principalAmount)
  const refNumber = await generateBusinessLoanRef()

  const loan = await prisma.$transaction(async (tx) => {
    return tx.businessLoan.create({
      data: {
        tenantId:        requireTenantId(),
        refNumber,
        customerId:      data.customerId,
        principalAmount: principal,
        balanceAmount:   principal,
        paymentMethod:   data.paymentMethod ?? 'cash',
        notes:           data.notes,
        status:          'active',
        createdByUserId,
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
      },
    })
  })

  logger.info({ businessLoanId: loan.id, refNumber, customerId: data.customerId, principal: principal.toFixed(2), createdByUserId }, 'businessLoan.created')
  return loan
}

// ─── Void Business Loan ────────────────────────────────────────────────────────

export async function voidBusinessLoan(id: string, data: VoidBusinessLoanInput, voidedById?: string) {
  const loan = await prisma.businessLoan.findUnique({
    where: { id },
    include: { _count: { select: { repayments: true } } },
  })
  if (!loan) throw new BusinessLoanNotFoundError(id)
  if (loan.status === 'voided') throw new BusinessLoanAlreadyVoidedError(loan.refNumber)
  if (loan._count.repayments > 0) throw new BusinessLoanHasRepaymentsError(loan.refNumber)

  const updated = await prisma.businessLoan.update({
    where: { id },
    data: { status: 'voided', voidedAt: new Date(), voidedById, voidReason: data.reason },
    include: { customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } } },
  })

  logger.info({ businessLoanId: id, refNumber: loan.refNumber, voidedById }, 'businessLoan.voided')
  return updated
}

// ─── Get Business Loan ─────────────────────────────────────────────────────────

export async function getBusinessLoan(id: string) {
  const loan = await prisma.businessLoan.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, idNumber: true, phone: true } },
      repayments: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!loan) throw new BusinessLoanNotFoundError(id)
  return loan
}

// ─── List Business Loans ───────────────────────────────────────────────────────

export async function listBusinessLoans(opts?: {
  customerId?: string
  status?: string
  search?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}) {
  const page     = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50
  const skip     = (page - 1) * pageSize

  const where = {
    ...(opts?.customerId && { customerId: opts.customerId }),
    ...(opts?.status && { status: opts.status as 'active' | 'settled' | 'voided' }),
    ...(opts?.from || opts?.to ? {
      createdAt: {
        ...(opts?.from && { gte: opts.from }),
        ...(opts?.to  && { lte: opts.to }),
      },
    } : {}),
    ...(opts?.search && {
      OR: [
        { refNumber: { contains: opts.search, mode: 'insensitive' as const } },
        { customer: { firstName: { contains: opts.search, mode: 'insensitive' as const } } },
        { customer: { lastName:  { contains: opts.search, mode: 'insensitive' as const } } },
        { customer: { idNumber:  { contains: opts.search, mode: 'insensitive' as const } } },
      ],
    }),
  }

  const [loans, total] = await Promise.all([
    prisma.businessLoan.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        _count: { select: { repayments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.businessLoan.count({ where }),
  ])

  return { loans, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}

// ─── Customer Business Loan Summary ────────────────────────────────────────────
// Full figures — callers must gate this behind an admin check (role check in
// the API route, or a passed admin PIN) before returning it to a client.

async function getCustomerBusinessLoanSummary(customerId: string) {
  const [loanAgg, repayAgg, loans] = await Promise.all([
    prisma.businessLoan.aggregate({
      where: { customerId, status: { not: 'voided' } },
      _sum: { principalAmount: true, balanceAmount: true },
    }),
    prisma.businessLoanRepayment.aggregate({
      where: { customerId },
      _sum: { amount: true },
    }),
    prisma.businessLoan.findMany({
      where: { customerId },
      include: { _count: { select: { repayments: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const totalAdvanced = new Decimal(loanAgg._sum.principalAmount?.toString() ?? '0')
  const outstanding   = new Decimal(loanAgg._sum.balanceAmount?.toString()  ?? '0')
  const totalRepaid   = new Decimal(repayAgg._sum.amount?.toString()         ?? '0')

  return {
    hasOutstanding: outstanding.greaterThan(0),
    totalAdvanced:  totalAdvanced.toFixed(2),
    totalRepaid:    totalRepaid.toFixed(2),
    outstanding:    outstanding.toFixed(2),
    loans,
  }
}

// Existence-only check — safe to expose to any role. Never returns an amount.
async function customerHasOutstandingBusinessLoan(customerId: string): Promise<boolean> {
  const count = await prisma.businessLoan.count({
    where: { customerId, status: 'active', balanceAmount: { gt: 0 } },
  })
  return count > 0
}

// ─── Masking boundary ──────────────────────────────────────────────────────────
// The one place role → visibility is decided. Any role gets the boolean; only
// 'admin' gets the actual figures and loan list.

export async function getCustomerBusinessLoanSummaryForRole(customerId: string, role: string) {
  if (role === 'admin') return getCustomerBusinessLoanSummary(customerId)
  const hasOutstanding = await customerHasOutstandingBusinessLoan(customerId)
  return { hasOutstanding }
}

// ─── Admin-PIN-gated reveal ─────────────────────────────────────────────────────
// Used from the sale Split Payment flow: a manager without loan visibility
// enters a PIN that must belong to an admin who has personally set one (never
// the shared tenant-wide default — see verifyAdminPin). On success, returns
// the same full summary an admin would see directly, in the same call — no
// separate token/grant, the caller holds the figures in local state only.

export async function verifyAdminPinForBusinessLoan(customerId: string, pin: string) {
  const valid = await verifyAdminPin(pin)
  if (!valid) throw new InvalidAdminPinError()
  return getCustomerBusinessLoanSummary(customerId)
}
