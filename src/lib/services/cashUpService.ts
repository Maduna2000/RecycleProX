import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import { SubmitCashUpInput, ApproveCashUpInput, type Currency } from '@/lib/schemas/cashup'
import { getMostRecentFloatBefore, updateClosingAmount, getDrawingsReceivedForDate } from './floatService'
import { getExpenseTotalsForDate } from './expenseService'
import { getLoanTotalsForDate } from './loanService'
import { sastDateLabelToUTCDate, getDayBoundsSAST, todaySASTDateStr } from '@/lib/utils/dayBounds'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDate(dateStr: string): Date {
  return sastDateLabelToUTCDate(dateStr)
}

function todayStr(): string {
  return todaySASTDateStr()
}

// ─── Typed errors ──────────────────────────────────────────────────────────

export class CashUpNotSubmittedError extends Error {
  code = 'NOT_SUBMITTED' as const
  constructor(status: string) { super(`Cannot reject cash-up with status "${status}" — only submitted sessions can be rejected`); this.name = 'CashUpNotSubmittedError' }
}

export class CashUpNewerSessionOpenError extends Error {
  code = 'NEWER_SESSION_OPEN' as const
  constructor() { super('Cannot reject — a newer session is already open. Void this session instead if it cannot be corrected.'); this.name = 'CashUpNewerSessionOpenError' }
}

// ─── Open a cash-up session ───────────────────────────────────────────────────
// Only one open session at a time is allowed. Must submit previous day's first.
export async function openCashUp(openedByUserId: string, sessionDateStr?: string, currency: Currency = 'ZAR') {
  const dateStr = sessionDateStr ?? todayStr()
  const sessionDate = toDate(dateStr)

  // Check if there's an open session from a previous day that needs to be submitted first
  const openFromPrevDay = await prisma.cashUp.findFirst({
    where: { sessionDate: { lt: sessionDate }, status: 'open' },
    orderBy: { sessionDate: 'desc' },
  })
  if (openFromPrevDay) {
    logger.warn({ existing: openFromPrevDay.id }, 'Cannot open new session — previous day session still open')
    throw new Error('You must submit the previous day\'s cash-up before opening a new session')
  }

  // Fetched up front so it's available both for the early "already exists" return
  // below and for the opening-balance carry-forward logic further down.
  const prevCashUp = await prisma.cashUp.findFirst({
    where:   { sessionDate: { lt: sessionDate } },
    orderBy: { sessionDate: 'desc' },
  })

  const existing = await prisma.cashUp.findFirst({
    where: { sessionDate, status: { not: 'approved' } },
  })

  if (existing) {
    logger.warn({ existing: existing.id }, 'Cash-up session already open/submitted for this date')
    return attachCurrencyWarning(existing, prevCashUp)
  }

  // Opening balance = PREVIOUS session's closing balance (the carry-forward).
  // Priority:
  //   1. Float closingAmount (set after cashup approval)
  //   2. Previous cashup's declaredCash (submitted but not approved)
  //   3. Calculate from previous cashup's transactions (open, not submitted)
  //   4. Float openingAmount (bootstrap, no prior cashup)
  const prevFloat = await getMostRecentFloatBefore(sessionDate)

  let openingBalance: Decimal

  if (prevFloat?.closingAmount) {
    // Best case: previous session was approved and float closing was recorded
    openingBalance = new Decimal(prevFloat.closingAmount.toString())
    logger.info({ prevDate: prevFloat.floatDate, amount: openingBalance.toFixed(2) }, 'CashUp: using previous closing as opening balance')
  } else if (prevCashUp?.declaredCash && prevCashUp.status === 'submitted') {
    // Previous session was submitted but not approved — use declaredCash
    openingBalance = new Decimal(prevCashUp.declaredCash.toString())
    logger.info(
      { prevDate: prevCashUp.sessionDate, amount: openingBalance.toFixed(2) },
      'CashUp: previous session submitted but not approved — using declared cash as opening balance'
    )
  } else if (prevCashUp && prevCashUp.status === 'open') {
    // Previous session still open — calculate expected from transactions
    const prevStats   = await getLiveStats(prevCashUp.sessionDate)
    const prevOpen    = new Decimal(prevCashUp.openingBalance.toString())
    const prevDraw    = new Decimal(prevStats.floatTopUps)
    const calcClosing = prevOpen
      .plus(prevDraw)
      .plus(new Decimal(prevStats.cashSales))
      .minus(new Decimal(prevStats.cashPurchases))
      .minus(new Decimal(prevStats.cashPayments))
      .minus(new Decimal(prevStats.expenses))
      .minus(new Decimal(prevStats.loanAdvance))
      .plus(new Decimal(prevStats.loanRepayment))
    openingBalance = calcClosing.isNegative() ? new Decimal(0) : calcClosing
    logger.warn(
      { prevDate: prevCashUp.sessionDate, calcClosing: calcClosing.toFixed(2) },
      'CashUp: previous session still open — carrying forward calculated expected balance'
    )
  } else if (prevCashUp?.declaredCash) {
    // Previous session approved but float closing not found — use declaredCash
    openingBalance = new Decimal(prevCashUp.declaredCash.toString())
    logger.info(
      { prevDate: prevCashUp.sessionDate, amount: openingBalance.toFixed(2) },
      'CashUp: using previous cashup declared cash as opening balance'
    )
  } else if (prevFloat?.openingAmount) {
    // Bootstrap: no prior CashUp at all, fall back to float opening
    openingBalance = new Decimal(prevFloat.openingAmount.toString())
    logger.info({ prevDate: prevFloat.floatDate, amount: openingBalance.toFixed(2) }, 'CashUp: bootstrap — carrying forward float opening (no cashup history)')
  } else {
    openingBalance = new Decimal(0)
  }

  let cashUp
  try {
    cashUp = await prisma.cashUp.create({
      data: {
        sessionDate,
        currency,
        openedByUserId,
        status: 'open',
        openingBalance: openingBalance,
      },
    })
  } catch (err: unknown) {
    // Two concurrent requests can both pass the "existing" check above before either
    // commits; the DB's unique constraint on sessionDate is the real guard. If we lose
    // the race, just return whatever the winner created instead of erroring.
    if ((err as { code?: string })?.code === 'P2002') {
      const winner = await prisma.cashUp.findUnique({ where: { sessionDate } })
      if (winner) {
        logger.warn({ sessionDate: dateStr }, 'CashUp: lost create race — returning existing session')
        return attachCurrencyWarning(winner, prevCashUp)
      }
    }
    throw err
  }

  logger.info({ cashUpId: cashUp.id, sessionDate: dateStr }, 'Cash-up session opened')
  return attachCurrencyWarning(cashUp, prevCashUp)
}

// Non-persisted warning shown when the new session's currency differs from the
// previous day's — surfaced to the UI so a manager can double-check, but never blocks.
function attachCurrencyWarning<T extends { currency: string }>(
  cashUp: T,
  prevCashUp: { currency: string } | null
): T & { currencyWarning: string | null } {
  const currencyWarning =
    prevCashUp && prevCashUp.currency !== cashUp.currency
      ? `Previous session was in ${prevCashUp.currency}, this one is ${cashUp.currency} — confirm this is intentional.`
      : null
  return { ...cashUp, currencyWarning }
}

// ─── Get the open/submitted session for today (or a specific date) ───────────
export async function getOpenSession(sessionDateStr?: string) {
  const dateStr = sessionDateStr ?? todayStr()
  const sessionDate = toDate(dateStr)

  return prisma.cashUp.findFirst({
    where: { sessionDate, status: { in: ['open', 'submitted'] } },
    orderBy: { openedAt: 'desc' },
  })
}

// ─── Get any open session (regardless of date) ────────────────────────────────
// Used to check if there's an unsubmitted session from a previous day
export async function getAnyOpenSession() {
  return prisma.cashUp.findFirst({
    where: { status: 'open' },
    orderBy: { sessionDate: 'desc' },
  })
}

// ─── Get all open sessions ────────────────────────────────────────────────────
// Returns all sessions that are still 'open' (not submitted), ordered by date
export async function getAllOpenSessions() {
  return prisma.cashUp.findMany({
    where: { status: 'open' },
    orderBy: { sessionDate: 'desc' },
  })
}

// ─── Void/cancel a session ─────────────────────────────────────────────────────
// Used to clean up sessions that can't be reconciled at all (e.g., too old, or
// data lost). Allowed from 'open' (stale, never submitted) or 'submitted'
// (genuinely unreconcilable, as opposed to rejectCashUp which sends it back to
// the cashier for correction). Terminal — once voided, this date is closed for good.
export async function voidCashUp(cashUpId: string, voidedByUserId: string, reason: string) {
  const cashUp = await prisma.cashUp.findUniqueOrThrow({ where: { id: cashUpId } })

  if (!['open', 'submitted'].includes(cashUp.status)) {
    throw new Error(`Cannot void cash-up with status "${cashUp.status}"`)
  }

  const updated = await prisma.cashUp.update({
    where: { id: cashUpId },
    data: {
      status: 'voided',
      notes: `VOIDED: ${reason}`,
      closedByUserId: voidedByUserId,
      closedAt: new Date(),
    },
  })

  logger.warn({ cashUpId, voidedByUserId, reason }, 'Cash-up session voided')
  return updated
}

// ─── Reject a submitted session (send back to cashier for correction) ────────
// Unlike voidCashUp, this reopens the session rather than terminating it — for
// cases like a fat-fingered declared-cash entry where the day should still be
// reconciled, just recounted. Blocked if a later date's session is already open,
// since that would leave two 'open' sessions at once and getAnyOpenSession()
// would silently hide this one from the cashup page (it always shows the
// latest-dated open session).
export async function rejectCashUp(cashUpId: string, rejectedByUserId: string, reason: string) {
  const cashUp = await prisma.cashUp.findUniqueOrThrow({ where: { id: cashUpId } })

  if (cashUp.status !== 'submitted') {
    throw new CashUpNotSubmittedError(cashUp.status)
  }

  const newerOpen = await prisma.cashUp.findFirst({
    where: { sessionDate: { gt: cashUp.sessionDate }, status: 'open' },
  })
  if (newerOpen) {
    throw new CashUpNewerSessionOpenError()
  }

  const updated = await prisma.cashUp.update({
    where: { id: cashUpId },
    data: {
      status: 'open',
      rejectedByUserId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  })

  logger.warn({ cashUpId, rejectedByUserId, reason }, 'Cash-up rejected — returned to cashier')
  return updated
}

// ─── Calculate system totals for a date ──────────────────────────────────────
// Sums completed transactions for the session date (midnight to midnight).
async function calcSystemTotals(sessionDate: Date, drawingsReceived = new Decimal(0), loansTotal = new Decimal(0)) {
  const { start, end } = getDayBoundsSAST(sessionDate)

  const [salesCashAgg, salesEftAgg, purchasesAgg, paymentsAgg] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: 'cash', status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: { in: ['eft', 'cheque'] }, status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    prisma.purchase.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: 'cash', status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paymentMethod: 'cash', voidedAt: null, createdAt: { gte: start, lte: end } },
    }),
  ])

  const cashSales       = new Decimal(salesCashAgg._sum.totalAmount?.toString() ?? '0')
  const cardPayments    = new Decimal(salesEftAgg._sum.totalAmount?.toString() ?? '0')
  const cashPurchases   = new Decimal(purchasesAgg._sum.totalAmount?.toString() ?? '0')
  const cashPayments    = new Decimal(paymentsAgg._sum.amount?.toString() ?? '0')
  const expensesTotal   = await getExpenseTotalsForDate(sessionDate)

  // Expected in drawer = opening + drawings + cash sales - cash purchases - cash payments - expenses - loan advances + loan repayments
  // "Drawings Received" = additional cash injected into drawer by management (positive, like RecyclePro X).
  // openingBalance is stored on the cashUp record; here we return the variable components only.
  const cashExpected = cashSales.minus(cashPurchases).minus(cashPayments).minus(expensesTotal).plus(drawingsReceived).plus(loansTotal)

  return { cashSales, cashPurchases, cashPayments, cashExpected, cardPayments, expensesTotal }
}

// ─── Submit (cashier declares cash) ──────────────────────────────────────────
export async function submitCashUp(
  cashUpId: string,
  closedByUserId: string,
  input: SubmitCashUpInput
) {
  const cashUp = await prisma.cashUp.findUniqueOrThrow({ where: { id: cashUpId } })

  if (cashUp.status !== 'open') {
    throw new Error(`Cannot submit cash-up with status "${cashUp.status}"`)
  }

  // Both drawingsReceived and loansTotal are fully server-derived — never from user input.
  // drawingsReceived = only mid-day top-ups (FloatMovements), NOT the opening float.
  const drawingsReceived = await getDrawingsReceivedForDate(cashUp.sessionDate)
  const loanTotals = await getLoanTotalsForDate(cashUp.sessionDate)
  // netCashOut is positive = cash went out as advances (reduces drawer), so we subtract it
  const loansTotal = new Decimal(loanTotals.netCashOut).negated()
  const totals = await calcSystemTotals(cashUp.sessionDate, drawingsReceived, loansTotal)

  const openingBalance = new Decimal(cashUp.openingBalance.toString())
  const declared  = new Decimal(input.declaredCash)
  // Full expected = opening + operational net
  const fullExpected = openingBalance.plus(totals.cashExpected)
  const variance = declared.minus(fullExpected)

  // Cumulative variance = sum of all previously approved cash-up variances + this one
  const priorApproved = await prisma.cashUp.aggregate({
    where: { status: 'approved' },
    _sum: { variance: true },
  })
  const priorCumulative = new Decimal(priorApproved._sum.variance?.toString() ?? '0')
  const finPeriodCumulative = priorCumulative.plus(variance)

  const updated = await prisma.cashUp.update({
    where: { id: cashUpId },
    data: {
      status:              'submitted',
      closedByUserId,
      closedAt:            new Date(),
      systemCashSales:     totals.cashSales,
      systemCashPurchases: totals.cashPurchases,
      systemCashPayments:  totals.cashPayments,
      systemCashExpected:  fullExpected,
      expensesTotal:       totals.expensesTotal,
      cardPaymentsTotal:   totals.cardPayments,
      drawingsReceived,
      loansTotal,
      declaredCash:        declared,
      variance,
      finPeriodCumulative,
      denominations:       input.denominations ?? {},
      notes:               input.notes ?? null,
    },
  })

  logger.info(
    { cashUpId, variance: variance.toFixed(2), userId: closedByUserId },
    'Cash-up submitted'
  )
  return updated
}

// ─── Approve (manager signs off) ─────────────────────────────────────────────
export async function approveCashUp(
  cashUpId: string,
  approvedByUserId: string,
  input: ApproveCashUpInput
) {
  const cashUp = await prisma.cashUp.findUniqueOrThrow({ where: { id: cashUpId } })

  if (cashUp.status !== 'submitted') {
    throw new Error(`Cannot approve cash-up with status "${cashUp.status}"`)
  }

  const updated = await prisma.cashUp.update({
    where: { id: cashUpId },
    data: {
      status:          'approved',
      approvedByUserId,
      approvedAt:      new Date(),
      notes:           input.notes !== undefined ? input.notes : cashUp.notes,
    },
  })

  // Write declaredCash as closing amount on the float record for this day
  if (cashUp.declaredCash) {
    await updateClosingAmount(
      cashUp.sessionDate,
      new Decimal(cashUp.declaredCash.toString())
    )
  }

  logger.info({ cashUpId, userId: approvedByUserId }, 'Cash-up approved')
  return updated
}

// ─── Live stats for the cash-up page ─────────────────────────────────────────
// Returns real-time transaction totals for a given session date.
export async function getLiveStats(sessionDate: Date) {
  const { start, end } = getDayBoundsSAST(sessionDate)

  const [
    salesCashAgg,
    salesCardAgg,
    salesCardOnlyAgg,
    purchasesAgg,
    paymentsAgg,
    loanTotals,
    expenses,
    unpaidTodayAgg,
    unpaidAllTimeAgg,
    approvedVariances,
    floatTopUpsAgg,
  ] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: 'cash', status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: { in: ['eft', 'cheque'] }, status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    // True card-swipe sales only — distinct from the EFT/cheque total above.
    // Kept separate (not persisted) so it can be shown alongside the "Card Sales"
    // report, which uses this same filter, without renaming the existing
    // cardPaymentsTotal column (which has always meant EFT+cheque).
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: 'card', status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    prisma.purchase.aggregate({
      _sum: { totalAmount: true },
      where: { paymentMethod: 'cash', status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paymentMethod: 'cash', voidedAt: null, createdAt: { gte: start, lte: end } },
    }),
    getLoanTotalsForDate(sessionDate),
    getExpenseTotalsForDate(sessionDate),
    prisma.$queryRaw<{ total: string; count: bigint }[]>`
      SELECT COALESCE(SUM("totalAmount" - COALESCE("loanDeductionAmount", 0) - "amountPaid"), 0)::text AS total,
             COUNT(*)::bigint AS count
      FROM "Purchase"
      WHERE status = 'pending' AND "createdAt" >= ${start} AND "createdAt" <= ${end}
    `,
    prisma.$queryRaw<{ total: string; count: bigint }[]>`
      SELECT COALESCE(SUM("totalAmount" - COALESCE("loanDeductionAmount", 0) - "amountPaid"), 0)::text AS total,
             COUNT(*)::bigint AS count
      FROM "Purchase"
      WHERE status = 'pending'
    `,
    prisma.cashUp.aggregate({
      _sum: { variance: true },
      where: { status: 'approved' },
    }),
    // Drawings Received = only mid-day top-ups (FloatMovements), NOT the CashFloat.openingAmount
    // CashFloat.openingAmount is the drawer starting cash which is already in CashUp.openingBalance
    prisma.floatMovement.aggregate({
      _sum: { amount: true },
      where: { movementType: 'top_up', createdAt: { gte: start, lte: end } },
    }),
  ])

  return {
    cashSales:     new Decimal(salesCashAgg._sum.totalAmount?.toString()  ?? '0').toFixed(2),
    cardSales:     new Decimal(salesCardAgg._sum.totalAmount?.toString()  ?? '0').toFixed(2),
    cardOnlySales: new Decimal(salesCardOnlyAgg._sum.totalAmount?.toString() ?? '0').toFixed(2),
    cashPurchases: new Decimal(purchasesAgg._sum.totalAmount?.toString()  ?? '0').toFixed(2),
    cashPayments:  new Decimal(paymentsAgg._sum.amount?.toString()        ?? '0').toFixed(2),
    expenses:      expenses.toFixed(2),
    loanAdvance:   loanTotals.advanced,
    loanRepayment: loanTotals.repaid,
    nonCashAdvanced: loanTotals.nonCashAdvanced,
    // Drawings received = only mid-day top-ups, not the float opening amount
    floatTopUps:   new Decimal(floatTopUpsAgg._sum.amount?.toString() ?? '0').toFixed(2),
    unpaidToday: {
      total: new Decimal(unpaidTodayAgg[0]?.total   ?? '0').toFixed(2),
      count: Number(unpaidTodayAgg[0]?.count   ?? 0),
    },
    unpaidAllTime: {
      total: new Decimal(unpaidAllTimeAgg[0]?.total ?? '0').toFixed(2),
      count: Number(unpaidAllTimeAgg[0]?.count ?? 0),
    },
    finPeriodCumulative: new Decimal(approvedVariances._sum.variance?.toString() ?? '0').toFixed(2),
  }
}

// ─── Get by ID ────────────────────────────────────────────────────────────────
export async function getCashUp(id: string) {
  return prisma.cashUp.findUnique({ where: { id } })
}

// ─── List with pagination ─────────────────────────────────────────────────────
export async function listCashUps(opts: { skip?: number; take?: number } = {}) {
  const { skip = 0, take = 30 } = opts
  const [items, total] = await Promise.all([
    prisma.cashUp.findMany({
      skip,
      take,
      orderBy: { sessionDate: 'desc' },
    }),
    prisma.cashUp.count(),
  ])
  return { items, total }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT DATA FUNCTIONS
// These functions fetch detailed records for PDF report generation
// ─────────────────────────────────────────────────────────────────────────────

export interface CashSaleRecord {
  refNumber: string
  createdAt: Date
  customerName: string | null
  description: string
  totalAmount: string
}

export async function getCashSalesForDate(sessionDate: Date): Promise<CashSaleRecord[]> {
  const { start, end } = getDayBoundsSAST(sessionDate)

  const sales = await prisma.sale.findMany({
    where: { paymentMethod: 'cash', status: 'completed', createdAt: { gte: start, lte: end } },
    include: {
      customer: { select: { firstName: true, lastName: true } },
      lines: { select: { product: { select: { name: true } }, quantity: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return sales.map(s => ({
    refNumber: s.refNumber,
    createdAt: s.createdAt,
    customerName: s.customer ? `${s.customer.firstName} ${s.customer.lastName}` : s.buyerName ?? null,
    description: s.lines.map((l: { product: { name: string }; quantity: unknown }) => `${l.product.name} x${l.quantity}`).join(', ') || 'N/A',
    totalAmount: new Decimal(s.totalAmount.toString()).toFixed(2),
  }))
}

export interface CashPurchaseRecord {
  refNumber: string
  createdAt: Date
  supplierName: string
  supplierId: string | null
  items: string
  totalAmount: string
}

export async function getCashPurchasesForDate(sessionDate: Date): Promise<CashPurchaseRecord[]> {
  const { start, end } = getDayBoundsSAST(sessionDate)

  const purchases = await prisma.purchase.findMany({
    where: { paymentMethod: 'cash', status: 'completed', createdAt: { gte: start, lte: end } },
    include: {
      customer: { select: { firstName: true, lastName: true, idNumber: true } },
      lines: { select: { product: { select: { name: true } }, quantity: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return purchases.map(p => ({
    refNumber: p.refNumber,
    createdAt: p.createdAt,
    supplierName: `${p.customer.firstName} ${p.customer.lastName}`,
    supplierId: p.customer.idNumber,
    items: p.lines.map((l: { product: { name: string }; quantity: unknown }) => `${l.product.name} x${l.quantity}`).join(', ') || 'N/A',
    totalAmount: new Decimal(p.totalAmount.toString()).toFixed(2),
  }))
}

export interface AccountPaymentRecord {
  refNumber: string
  createdAt: Date
  customerName: string
  notes: string | null
  amount: string
}

export async function getAccountPaymentsForDate(sessionDate: Date): Promise<AccountPaymentRecord[]> {
  const { start, end } = getDayBoundsSAST(sessionDate)

  const payments = await prisma.payment.findMany({
    where: { paymentMethod: 'cash', voidedAt: null, createdAt: { gte: start, lte: end } },
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return payments.map(p => ({
    refNumber: p.refNumber,
    createdAt: p.createdAt,
    customerName: p.customer ? `${p.customer.firstName} ${p.customer.lastName}` : 'Unknown',
    notes: p.notes,
    amount: new Decimal(p.amount.toString()).toFixed(2),
  }))
}

export interface ExpenseRecord {
  refNumber: string
  createdAt: Date
  typeName: string
  description: string | null
  paymentMethod: string
  amount: string
}

export async function getExpensesForDateReport(sessionDate: Date): Promise<ExpenseRecord[]> {
  const { start, end } = getDayBoundsSAST(sessionDate)

  const expenses = await prisma.expense.findMany({
    where: {
      status: { in: ['pending', 'approved'] },
      createdAt: { gte: start, lte: end },
    },
    include: { expenseType: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return expenses.map(e => ({
    refNumber: e.refNumber,
    createdAt: e.createdAt,
    typeName: e.expenseType.name,
    description: e.description,
    paymentMethod: e.paymentMethod,
    amount: new Decimal(e.amount.toString()).toFixed(2),
  }))
}

export interface LoanAdvanceRecord {
  refNumber: string
  createdAt: Date
  customerName: string
  customerId: string | null
  principalAmount: string
}

export async function getLoanAdvancesForDate(sessionDate: Date): Promise<LoanAdvanceRecord[]> {
  const { start, end } = getDayBoundsSAST(sessionDate)

  const loans = await prisma.loan.findMany({
    where: {
      status: { not: 'voided' },
      createdAt: { gte: start, lte: end },
    },
    include: { customer: { select: { firstName: true, lastName: true, idNumber: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return loans.map(l => ({
    refNumber: l.refNumber,
    createdAt: l.createdAt,
    customerName: `${l.customer.firstName} ${l.customer.lastName}`,
    customerId: l.customer.idNumber,
    principalAmount: new Decimal(l.principalAmount.toString()).toFixed(2),
  }))
}

export interface LoanRepaymentRecord {
  id: string
  createdAt: Date
  customerName: string
  loanRefNumber: string
  amount: string
}

export async function getLoanRepaymentsForDate(sessionDate: Date): Promise<LoanRepaymentRecord[]> {
  const { start, end } = getDayBoundsSAST(sessionDate)

  const repayments = await prisma.loanRepayment.findMany({
    where: { createdAt: { gte: start, lte: end } },
    include: {
      loan: {
        select: {
          refNumber: true,
          customer: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return repayments.map(r => ({
    id: r.id,
    createdAt: r.createdAt,
    customerName: `${r.loan.customer.firstName} ${r.loan.customer.lastName}`,
    loanRefNumber: r.loan.refNumber,
    amount: new Decimal(r.amount.toString()).toFixed(2),
  }))
}

export interface UnpaidPurchaseRecord {
  refNumber: string
  createdAt: Date
  supplierName: string
  totalAmount: string
  amountPaid: string
  balance: string
}

export async function getUnpaidPurchases(scope: 'today' | 'all', sessionDate?: Date): Promise<UnpaidPurchaseRecord[]> {
  const whereClause: { status: 'pending'; createdAt?: { gte: Date; lte: Date } } = { status: 'pending' }

  if (scope === 'today' && sessionDate) {
    const { start, end } = getDayBoundsSAST(sessionDate)
    whereClause.createdAt = { gte: start, lte: end }
  }

  const purchases = await prisma.purchase.findMany({
    where: whereClause,
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return purchases.map(p => {
    const total = new Decimal(p.totalAmount.toString())
    const loanDeduction = new Decimal(p.loanDeductionAmount?.toString() ?? '0')
    const paid = new Decimal(p.amountPaid.toString())
    const balance = total.minus(loanDeduction).minus(paid)
    return {
      refNumber: p.refNumber,
      createdAt: p.createdAt,
      supplierName: `${p.customer.firstName} ${p.customer.lastName}`,
      totalAmount: total.toFixed(2),
      amountPaid: paid.plus(loanDeduction).toFixed(2),
      balance: balance.toFixed(2),
    }
  })
}

export interface CardSaleRecord {
  refNumber: string
  createdAt: Date
  customerName: string | null
  paymentMethod: string
  totalAmount: string
}

export async function getCardSalesForDate(sessionDate: Date): Promise<CardSaleRecord[]> {
  const { start, end } = getDayBoundsSAST(sessionDate)

  const sales = await prisma.sale.findMany({
    where: { paymentMethod: 'card', status: 'completed', createdAt: { gte: start, lte: end } },
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return sales.map(s => ({
    refNumber: s.refNumber,
    createdAt: s.createdAt,
    customerName: s.customer ? `${s.customer.firstName} ${s.customer.lastName}` : s.buyerName ?? null,
    paymentMethod: s.paymentMethod,
    totalAmount: new Decimal(s.totalAmount.toString()).toFixed(2),
  }))
}

export interface TransferredPurchaseRecord {
  refNumber: string
  createdAt: Date
  supplierName: string
  bankRef: string | null
  totalAmount: string
}

export async function getTransferredPurchasesForDate(sessionDate: Date): Promise<TransferredPurchaseRecord[]> {
  const { start, end } = getDayBoundsSAST(sessionDate)

  const purchases = await prisma.purchase.findMany({
    where: { paymentMethod: 'eft', status: 'completed', createdAt: { gte: start, lte: end } },
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return purchases.map(p => ({
    refNumber: p.refNumber,
    createdAt: p.createdAt,
    supplierName: `${p.customer.firstName} ${p.customer.lastName}`,
    bankRef: p.notes,
    totalAmount: new Decimal(p.totalAmount.toString()).toFixed(2),
  }))
}

export interface DrawingsReceivedRecord {
  id: string
  createdAt: Date
  movementType: string
  notes: string | null
  amount: string
}

export async function getDrawingsReceivedForDateReport(sessionDate: Date): Promise<DrawingsReceivedRecord[]> {
  const { start, end } = getDayBoundsSAST(sessionDate)

  // Drawings Received = only mid-day top-ups (additional cash injected during the session)
  // CashFloat.openingAmount is NOT included because it's the starting cash,
  // which is already represented in CashUp.openingBalance
  const topUps = await prisma.floatMovement.findMany({
    where: {
      movementType: 'top_up',
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: 'asc' },
  })

  return topUps.map(t => ({
    id: t.id,
    createdAt: t.createdAt,
    movementType: 'Top-Up',
    notes: t.referenceNote,
    amount: new Decimal(t.amount.toString()).toFixed(2),
  }))
}

export interface CashUpHistoryRecord {
  id: string
  sessionDate: Date
  status: string
  currency: string
  variance: string | null
  openingBalance: string
  declaredCash: string | null
  submittedAt: Date | null
  approvedAt: Date | null
}

export async function getCashUpHistory(opts: {
  skip?: number
  take?: number
  status?: string[]
} = {}): Promise<{ items: CashUpHistoryRecord[]; total: number }> {
  const { skip = 0, take = 50, status = ['submitted', 'approved'] } = opts

  const whereClause = { status: { in: status as ('submitted' | 'approved')[] } }

  const [items, total] = await Promise.all([
    prisma.cashUp.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: { sessionDate: 'desc' },
    }),
    prisma.cashUp.count({ where: whereClause }),
  ])

  return {
    items: items.map(c => ({
      id: c.id,
      sessionDate: c.sessionDate,
      status: c.status,
      currency: c.currency,
      variance: c.variance ? new Decimal(c.variance.toString()).toFixed(2) : null,
      openingBalance: new Decimal(c.openingBalance.toString()).toFixed(2),
      declaredCash: c.declaredCash ? new Decimal(c.declaredCash.toString()).toFixed(2) : null,
      submittedAt: c.closedAt,
      approvedAt: c.approvedAt,
    })),
    total,
  }
}
