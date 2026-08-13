import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import type { Prisma } from '@prisma/client'
import type { CreateLoanInput, CreateRepaymentInput, VoidLoanInput } from '@/lib/schemas/loan'
import { todaySASTDate, todaySASTDateStr, getRangeBoundsSAST, sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'
import type { DateWindow } from '@/lib/services/cashUpWindow'
import type { CreateManualRepaymentInput } from '@/lib/schemas/loan'

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

export class NoActiveLoansError extends Error {
  constructor() { super('Customer has no active loans to repay'); this.name = 'NoActiveLoansError' }
}

export class RepaymentNotFoundError extends Error {
  constructor(id: string) { super(`Repayment "${id}" not found`); this.name = 'RepaymentNotFoundError' }
}

export class RepaymentNotLastEntryError extends Error {
  constructor() { super('Only the most recent loan or repayment entry can be reversed'); this.name = 'RepaymentNotLastEntryError' }
}

// Marks a manually-reversed repayment's notes so getCustomerLoanStatement can
// tell it apart from reverseRepaymentsForPurchase's own reversal entries
// (which read "Reversal — purchase X voided") — same negative-amount,
// no-purchaseId shape, different real-world cause.
const MANUAL_REVERSAL_PREFIX = 'Reversal (manual)'

export function formatTransactionMethod(method: string): string {
  if (method === 'eft') return 'EFT'
  return method.charAt(0).toUpperCase() + method.slice(1)
}

// ─── Reference number generators ─────────────────────────────────────────────

async function generateLoanRef(): Promise<string> {
  const prefix = `LOA-${todaySASTDateStr().replace(/-/g, '')}`
  const startOfDay = todaySASTDate()
  const count = await prisma.loan.count({ where: { createdAt: { gte: startOfDay } } })
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

async function generateRepaymentRef(): Promise<string> {
  const prefix = `REP-${todaySASTDateStr().replace(/-/g, '')}`
  const startOfDay = todaySASTDate()
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
  const prefix = `REP-${todaySASTDateStr().replace(/-/g, '')}`
  const startOfDay = todaySASTDate()

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
        tenantId:        requireTenantId(),
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

// ─── Reverse repayments tied to a voided purchase ─────────────────────────────
// Called from voidPurchase. A purchase's loan deduction can have paid down
// more than one loan FIFO (applyRepaymentTx above), so every LoanRepayment
// row carrying this purchaseId needs its own reversal. Never mutates or
// deletes the original repayment row (matches this codebase's established
// "never delete a financial record" convention, e.g.
// scripts/production-clear-transaction-data.ts) — instead writes an
// offsetting negative-amount LoanRepayment, which nets to zero in any
// SUM-based aggregate (getLoanTotalsForDate) without losing the audit trail
// of what was originally repaid and why it was reversed.
export async function reverseRepaymentsForPurchase(
  tx: Prisma.TransactionClient,
  purchaseId: string,
  purchaseRefNumber: string,
  voidedById: string | undefined,
  actionLabel: string = 'voided',
): Promise<void> {
  const repayments = await tx.loanRepayment.findMany({ where: { purchaseId } })
  if (repayments.length === 0) return

  const prefix = `REP-${todaySASTDateStr().replace(/-/g, '')}`
  const startOfDay = todaySASTDate()

  for (const r of repayments) {
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: r.loanId } })
    const restoredBalance = new Decimal(loan.balanceAmount.toString()).plus(r.amount.toString())

    await tx.loan.update({
      where: { id: r.loanId },
      data: { balanceAmount: restoredBalance, status: 'active' },
    })

    const count = await tx.loanRepayment.count({ where: { createdAt: { gte: startOfDay } } })
    await tx.loanRepayment.create({
      data: {
        tenantId:        requireTenantId(),
        refNumber:       `${prefix}-${String(count + 1).padStart(4, '0')}`,
        loanId:          r.loanId,
        customerId:      r.customerId,
        // purchaseId carried over from the repayment being reversed — the
        // original was excluded from getLoanTotalsForDate's drawer-cash sum
        // because no cash actually crossed the drawer (it was withheld from
        // the payout instead); reversing a non-cash-event is itself a
        // non-cash-event, so this row needs the same exclusion. Omitting it
        // let this reversal alone pass that filter, understating drawer cash
        // by the deducted amount on the day of the void/reversal/edit.
        purchaseId:      r.purchaseId,
        amount:          new Decimal(r.amount.toString()).negated(),
        paymentMethod:   r.paymentMethod,
        notes:           `Reversal — purchase ${purchaseRefNumber} ${actionLabel}`,
        createdByUserId: voidedById,
      },
    })

    logger.info({ loanId: r.loanId, reversedRepaymentId: r.id, amount: r.amount.toString(), restoredBalance: restoredBalance.toFixed(2), purchaseId, voidedById }, 'loan.repayment.reversed')
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
        tenantId:        requireTenantId(),
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

export async function getLoanTotalsForDate(window: DateWindow) {
  const { start, end } = window

  // Only cash-method loans/repayments affect the drawer. Advances are
  // genuinely reachable as EFT via the Create Loan dialog, so filtering
  // matters there: an EFT advance never touches the physical drawer and must
  // not reduce the day's expected cash.
  //
  // Repayments additionally exclude purchaseId != null rows even though
  // applyRepaymentTx stamps them paymentMethod: 'cash' — that stamp is a
  // mislabel, not a fact. A purchase-deducted repayment is a withheld
  // payout: the customer never received cash for their stock and never
  // handed cash back, so no money crossed the drawer in either direction.
  // Counting it here would tell cashup to expect cash that was never
  // physically received (see getLoanRepaymentsForDate below, which still
  // lists these — unfiltered — for visibility; only the drawer-cash total
  // excludes them).
  const [advancedAgg, nonCashAdvancedAgg, repaidAgg, repaidViaStockAgg] = await Promise.all([
    prisma.loan.aggregate({
      where: { status: { not: 'voided' }, paymentMethod: 'cash', createdAt: { gte: start, lte: end } },
      _sum: { principalAmount: true },
    }),
    prisma.loan.aggregate({
      where: { status: { not: 'voided' }, paymentMethod: { not: 'cash' }, createdAt: { gte: start, lte: end } },
      _sum: { principalAmount: true },
    }),
    prisma.loanRepayment.aggregate({
      where: { paymentMethod: 'cash', purchaseId: null, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    // Purely informational — surfaced on the cash-up page and the
    // loan-repayments report so a repayment settled via stock stays visible
    // ("R12,150 repaid via stock") even though it correctly never enters the
    // cash total above.
    prisma.loanRepayment.aggregate({
      where: { purchaseId: { not: null }, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ])

  const advanced        = new Decimal(advancedAgg._sum.principalAmount?.toString() ?? '0')
  const nonCashAdvanced  = new Decimal(nonCashAdvancedAgg._sum.principalAmount?.toString() ?? '0')
  const repaid           = new Decimal(repaidAgg._sum.amount?.toString() ?? '0')
  const repaidViaStock   = new Decimal(repaidViaStockAgg._sum.amount?.toString() ?? '0')
  // Net cash impact: advances paid out minus repayments received back
  // Positive = net cash went out as loans (reduces drawer cash)
  const netCashOut = advanced.minus(repaid)

  return {
    advanced:       advanced.toFixed(2),
    nonCashAdvanced: nonCashAdvanced.toFixed(2),
    repaid:         repaid.toFixed(2),
    repaidViaStock: repaidViaStock.toFixed(2),
    netCashOut:     netCashOut.toFixed(2),
  }
}

// ─── Manual Repayment (customer-level, FIFO) ─────────────────────────────────
// Unlike createRepayment (targets one specific loan), this is what the Loans-
// tab ledger's "Add Repayment" button calls — the legacy tool it mirrors has
// no per-loan picker, it just pays down whatever the customer owes, oldest
// loan first, same order applyRepaymentTx already uses for purchase-deducted
// repayments.
export async function createManualRepayment(
  customerId: string,
  data: CreateManualRepaymentInput,
  createdByUserId?: string,
) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new Error('Customer not found')

  const activeLoans = await prisma.loan.findMany({
    where: { customerId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  })
  if (activeLoans.length === 0) throw new NoActiveLoansError()

  const totalOutstanding = activeLoans.reduce((sum, l) => sum.plus(l.balanceAmount.toString()), new Decimal(0))
  const repayAmount = new Decimal(data.amount)
  if (repayAmount.greaterThan(totalOutstanding)) {
    throw new RepaymentExceedsBalanceError(totalOutstanding.toFixed(2))
  }

  const prefix = `REP-${todaySASTDateStr().replace(/-/g, '')}`
  const startOfDay = todaySASTDate()

  const created = await prisma.$transaction(async (tx) => {
    const baseCount = await tx.loanRepayment.count({ where: { createdAt: { gte: startOfDay } } })
    let remaining = repayAmount
    let seqOffset = 0
    const repayments = []

    for (const loan of activeLoans) {
      if (remaining.isZero()) break
      const balance = new Decimal(loan.balanceAmount.toString())
      const repayAmt = Decimal.min(remaining, balance)
      const newBalance = balance.minus(repayAmt)
      const isNowSettled = newBalance.isZero()
      const refNumber = `${prefix}-${String(baseCount + seqOffset + 1).padStart(4, '0')}`
      seqOffset++

      const repayment = await tx.loanRepayment.create({
        data: {
          tenantId:        requireTenantId(),
          refNumber,
          loanId:          loan.id,
          customerId,
          amount:          repayAmt,
          paymentMethod:   data.paymentMethod ?? 'cash',
          notes:           data.notes,
          createdByUserId,
        },
      })
      await tx.loan.update({
        where: { id: loan.id },
        data: { balanceAmount: newBalance, status: isNowSettled ? 'settled' : 'active' },
      })
      repayments.push(repayment)
      remaining = remaining.minus(repayAmt)
    }
    return repayments
  })

  logger.info(
    { customerId, amount: repayAmount.toFixed(2), paymentMethod: data.paymentMethod, repaymentCount: created.length, createdByUserId },
    'loan.manual_repayment.created'
  )
  return created
}

// ─── Reverse a Repayment ──────────────────────────────────────────────────────
// "Delete Last" on the ledger, when the last entry is a repayment. Mirrors
// reverseRepaymentsForPurchase's own approach exactly — never mutates or
// deletes the original row, writes an offsetting negative-amount entry
// instead, so the audit trail keeps both what happened and that it was
// undone. Restricted to the customer's single most recent entry (loan or
// repayment) — a targeted undo of a just-made mistake, not a general
// historical edit.
export async function reverseRepayment(repaymentId: string, reason: string, userId?: string) {
  const repayment = await prisma.loanRepayment.findUnique({ where: { id: repaymentId } })
  if (!repayment) throw new RepaymentNotFoundError(repaymentId)

  const [laterLoan, laterRepayment] = await Promise.all([
    prisma.loan.findFirst({ where: { customerId: repayment.customerId, createdAt: { gt: repayment.createdAt } } }),
    prisma.loanRepayment.findFirst({ where: { customerId: repayment.customerId, createdAt: { gt: repayment.createdAt }, id: { not: repayment.id } } }),
  ])
  if (laterLoan || laterRepayment) throw new RepaymentNotLastEntryError()

  const loan = await prisma.loan.findUniqueOrThrow({ where: { id: repayment.loanId } })
  const restoredBalance = new Decimal(loan.balanceAmount.toString()).plus(repayment.amount.toString())
  const refNumber = await generateRepaymentRef()

  const reversal = await prisma.$transaction(async (tx) => {
    await tx.loan.update({ where: { id: repayment.loanId }, data: { balanceAmount: restoredBalance, status: 'active' } })
    return tx.loanRepayment.create({
      data: {
        tenantId:        requireTenantId(),
        refNumber,
        loanId:          repayment.loanId,
        customerId:      repayment.customerId,
        amount:          new Decimal(repayment.amount.toString()).negated(),
        paymentMethod:   repayment.paymentMethod,
        notes:           `${MANUAL_REVERSAL_PREFIX} — ${reason}`,
        createdByUserId: userId,
      },
    })
  })

  logger.info(
    { reversedRepaymentId: repayment.id, loanId: repayment.loanId, amount: repayment.amount.toString(), restoredBalance: restoredBalance.toFixed(2), userId },
    'loan.repayment.manually_reversed'
  )
  return reversal
}

// ─── Customer Loan Statement (ledger) ────────────────────────────────────────
// Backs the Loans-tab ledger view and the "Print Statement" PDF — one
// chronological statement merging advances and repayments (including
// reversals) for a single customer, scoped to a calendar month ("Fin
// Period"), with a running balance carried forward from everything before
// that month. Sign convention matches the legacy tool being replicated: an
// advance makes the balance more NEGATIVE (the customer owes more), a
// repayment brings it back toward zero — the opposite of buildLoanPayments'
// (Reports module) accounts-receivable-style positive-outstanding
// convention, which is a different, unrelated document.
export interface LoanLedgerRow {
  id:          string
  date:        string // ISO
  description: string
  transaction: string
  advance:     string | null
  repayment:   string | null
  balance:     string
}

function monthBounds(period: string): { from: string; to: string } {
  const [yearStr, monthStr] = period.split('-')
  const year  = Number(yearStr)
  const month = Number(monthStr) // 1-indexed
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, '0')}` }
}

export async function getCustomerLoanStatement(customerId: string, periodStr?: string) {
  const period = periodStr ?? todaySASTDateStr().slice(0, 7)
  const { from, to } = monthBounds(period)
  const { start, end } = getRangeBoundsSAST(from, to)

  const [openingLoans, openingRepayments, loansInPeriod, repaymentsInPeriod] = await Promise.all([
    prisma.loan.aggregate({
      where: { customerId, status: { not: 'voided' }, createdAt: { lt: start } },
      _sum: { principalAmount: true },
    }),
    prisma.loanRepayment.aggregate({
      where: { customerId, createdAt: { lt: start } },
      _sum: { amount: true },
    }),
    prisma.loan.findMany({
      where: { customerId, status: { not: 'voided' }, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.loanRepayment.findMany({
      where: { customerId, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const advancedBefore = new Decimal(openingLoans._sum.principalAmount?.toString() ?? '0')
  const repaidBefore   = new Decimal(openingRepayments._sum.amount?.toString() ?? '0')
  let balance = advancedBefore.negated().plus(repaidBefore)
  const openingBalance = balance

  interface Entry {
    id: string; createdAt: Date; description: string; transaction: string
    advance: Decimal | null; repayment: Decimal | null
  }
  const entries: Entry[] = []

  for (const loan of loansInPeriod) {
    entries.push({
      id:          loan.id,
      createdAt:   loan.createdAt,
      description: 'Advance - loan',
      transaction: formatTransactionMethod(loan.paymentMethod),
      advance:     new Decimal(loan.principalAmount.toString()),
      repayment:   null,
    })
  }
  for (const r of repaymentsInPeriod) {
    const amount = new Decimal(r.amount.toString())
    const isReversal = amount.isNegative()
    const isManualReversal = isReversal && (r.notes ?? '').startsWith(MANUAL_REVERSAL_PREFIX)
    const description = r.purchaseId
      ? 'Loan Repayment - Purchase'
      : isManualReversal
        ? 'Loan Repayment - Reversal'
        : isReversal
          ? 'Loan Repayment - Reversal (Purchase Voided)'
          : 'Loan Repayment - Manual'
    entries.push({
      id:          r.id,
      createdAt:   r.createdAt,
      description,
      transaction: r.purchaseId ? 'Stock' : formatTransactionMethod(r.paymentMethod),
      advance:     null,
      repayment:   amount,
    })
  }

  entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  const rows: LoanLedgerRow[] = [{
    id:          'opening',
    date:        sastDateLabelToUTCDate(from).toISOString(),
    description: 'OPEN BALANCE',
    transaction: '',
    advance:     null,
    repayment:   null,
    balance:     openingBalance.toFixed(2),
  }]

  for (const e of entries) {
    if (e.advance)   balance = balance.minus(e.advance)
    if (e.repayment) balance = balance.plus(e.repayment)
    rows.push({
      id:          e.id,
      date:        e.createdAt.toISOString(),
      description: e.description,
      transaction: e.transaction,
      advance:     e.advance   ? e.advance.toFixed(2)   : null,
      repayment:   e.repayment ? e.repayment.toFixed(2) : null,
      balance:     balance.toFixed(2),
    })
  }

  // The single most recent entry across all history (not just this period) —
  // the ledger's "Delete Last" button needs to know what it would undo even
  // when viewing a past, already-closed period.
  const [lastLoan, lastRepayment] = await Promise.all([
    prisma.loan.findFirst({ where: { customerId, status: { not: 'voided' } }, orderBy: { createdAt: 'desc' } }),
    prisma.loanRepayment.findFirst({ where: { customerId }, orderBy: { createdAt: 'desc' } }),
  ])
  const lastEntry = (() => {
    if (!lastLoan && !lastRepayment) return null
    if (!lastRepayment || (lastLoan && lastLoan.createdAt > lastRepayment.createdAt)) {
      return { kind: 'loan' as const, id: lastLoan!.id, description: 'Advance - loan', amount: lastLoan!.principalAmount.toString(), date: lastLoan!.createdAt.toISOString() }
    }
    return { kind: 'repayment' as const, id: lastRepayment.id, description: 'Repayment', amount: lastRepayment.amount.toString(), date: lastRepayment.createdAt.toISOString() }
  })()

  return {
    period,
    openingBalance: openingBalance.toFixed(2),
    closingBalance: balance.toFixed(2),
    rows,
    lastEntry,
  }
}
