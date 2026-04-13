import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import type { Prisma } from '@prisma/client'
import type { CreateLoanInput, CreateRepaymentInput, VoidLoanInput } from '@/lib/schemas/loan'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class LoanNotFoundError extends Error {
  constructor(id: string) { super(`Loan "${id}" not found`); this.name = 'LoanNotFoundError' }
}

export class LoanAlreadySettledError extends Error {
  constructor(ref: string) { super(`Loan "${ref}" is already settled`); this.name = 'LoanAlreadySettledError' }
}

export class LoanAlreadyVoidedError extends Error {
  constructor(ref: string) { super(`Loan "${ref}" is already voided`); this.name = 'LoanAlreadyVoidedError' }
}

export class LoanHasRepaymentsError extends Error {
  constructor(ref: string) { super(`Loan "${ref}" has repayments and cannot be voided`); this.name = 'LoanHasRepaymentsError' }
}

export class RepaymentExceedsBalanceError extends Error {
  constructor(balance: string) { super(`Repayment amount exceeds outstanding balance of R ${balance}`); this.name = 'RepaymentExceedsBalanceError' }
}

export class CustomerBlacklistedError extends Error {
  constructor() { super('Customer is blacklisted and cannot receive a loan advance'); this.name = 'CustomerBlacklistedError' }
}

export class CustomerInactiveError extends Error {
  constructor() { super('Customer account is inactive'); this.name = 'CustomerInactiveError' }
}

// ─── Reference number generators ─────────────────────────────────────────────

async function generateLoanRef(): Promise<string> {
  const today = new Date()
  const prefix = `LOA-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const count = await prisma.loan.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

async function generateRepaymentRef(): Promise<string> {
  const today = new Date()
  const prefix = `REP-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const count = await prisma.loanRepayment.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

// ─── Apply Repayment inside an existing transaction ───────────────────────────
// Called from purchaseService when a payout should deduct from outstanding loans.
// Uses FIFO: oldest active loan is paid down first.
// The caller supplies the Prisma transaction client (tx) so this runs atomically.

export async function applyRepaymentTx(
  tx: Prisma.TransactionClient,
  customerId: string,
  amount: string,
  createdByUserId: string | undefined,
  purchaseId?: string,
): Promise<void> {
  const today = new Date()
  const prefix = `REP-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  // Count existing repayments today (outside this tx scope) as base sequence
  const baseCount = await tx.loanRepayment.count({ where: { createdAt: { gte: startOfDay } } })

  // Fetch active loans FIFO (oldest first)
  const activeLoans = await tx.loan.findMany({
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

    await tx.loanRepayment.create({
      data: {
        refNumber,
        loanId:          loan.id,
        customerId,
        purchaseId,
        amount:          repayAmount,
        paymentMethod:   'cash',
        createdByUserId,
      },
    })

    await tx.loan.update({
      where: { id: loan.id },
      data: {
        balanceAmount: newBalance,
        status:        isNowSettled ? 'settled' : 'active',
      },
    })

    logger.info({ loanId: loan.id, refNumber, repayAmount: repayAmount.toFixed(2), newBalance: newBalance.toFixed(2), settled: isNowSettled, purchaseId, createdByUserId }, 'loan.repayment.from_purchase')
    remaining = remaining.minus(repayAmount)
  }
}

// ─── Create Loan ──────────────────────────────────────────────────────────────

export async function createLoan(data: CreateLoanInput, createdByUserId?: string) {
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } })
  if (!customer) throw new Error('Customer not found')
  if (customer.blacklisted) throw new CustomerBlacklistedError()
  if (!customer.isActive) throw new CustomerInactiveError()

  const principal = new Decimal(data.principalAmount)
  const refNumber = await generateLoanRef()

  const loan = await prisma.$transaction(async (tx) => {
    return tx.loan.create({
      data: {
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

  logger.info({ loanId: loan.id, refNumber, customerId: data.customerId, principal: principal.toFixed(2), createdByUserId }, 'loan.created')
  return loan
}

// ─── Create Repayment ─────────────────────────────────────────────────────────

export async function createRepayment(data: CreateRepaymentInput, createdByUserId?: string) {
  const loan = await prisma.loan.findUnique({
    where: { id: data.loanId },
    include: { customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } } },
  })
  if (!loan) throw new LoanNotFoundError(data.loanId)
  if (loan.status === 'voided') throw new LoanAlreadyVoidedError(loan.refNumber)
  if (loan.status === 'settled') throw new LoanAlreadySettledError(loan.refNumber)

  const repayAmount = new Decimal(data.amount)
  const currentBalance = new Decimal(loan.balanceAmount.toString())

  if (repayAmount.greaterThan(currentBalance)) {
    throw new RepaymentExceedsBalanceError(currentBalance.toFixed(2))
  }

  const newBalance = currentBalance.minus(repayAmount)
  const isNowSettled = newBalance.isZero()
  const refNumber = await generateRepaymentRef()

  const result = await prisma.$transaction(async (tx) => {
    const repayment = await tx.loanRepayment.create({
      data: {
        refNumber,
        loanId:          data.loanId,
        customerId:      loan.customerId,
        amount:          repayAmount,
        paymentMethod:   data.paymentMethod ?? 'cash',
        notes:           data.notes,
        createdByUserId,
      },
    })

    await tx.loan.update({
      where: { id: data.loanId },
      data: {
        balanceAmount: newBalance,
        status:        isNowSettled ? 'settled' : 'active',
      },
    })

    return repayment
  })

  logger.info({ repaymentId: result.id, refNumber, loanId: data.loanId, amount: repayAmount.toFixed(2), newBalance: newBalance.toFixed(2), settled: isNowSettled, createdByUserId }, 'loan.repayment.created')
  return result
}

// ─── Void Loan ────────────────────────────────────────────────────────────────

export async function voidLoan(id: string, data: VoidLoanInput, voidedById?: string) {
  const loan = await prisma.loan.findUnique({
    where: { id },
    include: { _count: { select: { repayments: true } } },
  })
  if (!loan) throw new LoanNotFoundError(id)
  if (loan.status === 'voided') throw new LoanAlreadyVoidedError(loan.refNumber)
  if (loan._count.repayments > 0) throw new LoanHasRepaymentsError(loan.refNumber)

  const updated = await prisma.loan.update({
    where: { id },
    data: { status: 'voided', voidedAt: new Date(), voidedById, voidReason: data.reason },
    include: { customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } } },
  })

  logger.info({ loanId: id, refNumber: loan.refNumber, voidedById }, 'loan.voided')
  return updated
}

// ─── Get Loan ─────────────────────────────────────────────────────────────────

export async function getLoan(id: string) {
  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, idNumber: true, phone: true } },
      repayments: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!loan) throw new LoanNotFoundError(id)
  return loan
}

// ─── List Loans ───────────────────────────────────────────────────────────────

export async function listLoans(opts?: {
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
    prisma.loan.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        _count: { select: { repayments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.loan.count({ where }),
  ])

  return { loans, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}

// ─── Customer Loan Summary ────────────────────────────────────────────────────

export async function getCustomerLoanSummary(customerId: string) {
  const [loanAgg, repayAgg] = await Promise.all([
    prisma.loan.aggregate({
      where: { customerId, status: { not: 'voided' } },
      _sum: { principalAmount: true, balanceAmount: true },
    }),
    prisma.loanRepayment.aggregate({
      where: { customerId },
      _sum: { amount: true },
    }),
  ])

  const totalAdvanced = new Decimal(loanAgg._sum.principalAmount?.toString() ?? '0')
  const outstanding   = new Decimal(loanAgg._sum.balanceAmount?.toString()  ?? '0')
  const totalRepaid   = new Decimal(repayAgg._sum.amount?.toString()         ?? '0')

  return {
    totalAdvanced: totalAdvanced.toFixed(2),
    totalRepaid:   totalRepaid.toFixed(2),
    outstanding:   outstanding.toFixed(2),
    hasOutstanding: outstanding.greaterThan(0),
  }
}

// ─── Daily loan totals (for CashUp auto-calculation) ─────────────────────────

export async function getLoanTotalsForDate(date: Date) {
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end   = new Date(date); end.setHours(23, 59, 59, 999)

  const [advancedAgg, repaidAgg] = await Promise.all([
    prisma.loan.aggregate({
      where: { status: { not: 'voided' }, createdAt: { gte: start, lte: end } },
      _sum: { principalAmount: true },
    }),
    prisma.loanRepayment.aggregate({
      where: { createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ])

  const advanced = new Decimal(advancedAgg._sum.principalAmount?.toString() ?? '0')
  const repaid   = new Decimal(repaidAgg._sum.amount?.toString()             ?? '0')
  // Net cash impact: advances paid out minus repayments received back
  // Positive = net cash went out as loans (reduces drawer cash)
  const netCashOut = advanced.minus(repaid)

  return {
    advanced:   advanced.toFixed(2),
    repaid:     repaid.toFixed(2),
    netCashOut: netCashOut.toFixed(2),
  }
}
