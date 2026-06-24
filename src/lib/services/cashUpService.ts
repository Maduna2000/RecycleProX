import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import { SubmitCashUpInput, ApproveCashUpInput } from '@/lib/schemas/cashup'
import { getMostRecentFloatBefore, updateClosingAmount, getDrawingsReceivedForDate } from './floatService'
import { getExpenseTotalsForDate } from './expenseService'
import { getLoanTotalsForDate } from './loanService'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDate(dateStr: string): Date {
  // Parse YYYY-MM-DD as local midnight — avoids UTC off-by-one
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

function todayStr(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// ─── Open a cash-up session ───────────────────────────────────────────────────
// Only one open session at a time is allowed. Must submit previous day's first.
export async function openCashUp(openedByUserId: string, sessionDateStr?: string) {
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

  const existing = await prisma.cashUp.findFirst({
    where: { sessionDate, status: { not: 'approved' } },
  })

  if (existing) {
    logger.warn({ existing: existing.id }, 'Cash-up session already open/submitted for this date')
    return existing
  }

  // Opening balance = PREVIOUS session's closing balance (the carry-forward).
  // Priority:
  //   1. Float closingAmount (set after cashup approval)
  //   2. Previous cashup's declaredCash (submitted but not approved)
  //   3. Calculate from previous cashup's transactions (open, not submitted)
  //   4. Float openingAmount (bootstrap, no prior cashup)
  const prevFloat = await getMostRecentFloatBefore(sessionDate)
  const prevCashUp = await prisma.cashUp.findFirst({
    where:   { sessionDate: { lt: sessionDate } },
    orderBy: { sessionDate: 'desc' },
  })

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

  const cashUp = await prisma.cashUp.create({
    data: {
      sessionDate,
      openedByUserId,
      status: 'open',
      openingBalance: openingBalance,
    },
  })

  logger.info({ cashUpId: cashUp.id, sessionDate: dateStr }, 'Cash-up session opened')
  return cashUp
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

// ─── Void/cancel an old session ───────────────────────────────────────────────
// Used to clean up sessions that can't be reconciled (e.g., too old)
export async function voidCashUp(cashUpId: string, voidedByUserId: string, reason: string) {
  const cashUp = await prisma.cashUp.findUniqueOrThrow({ where: { id: cashUpId } })

  if (cashUp.status !== 'open') {
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

// ─── Calculate system totals for a date ──────────────────────────────────────
// Sums completed transactions for the session date (midnight to midnight).
async function calcSystemTotals(sessionDate: Date, drawingsReceived = new Decimal(0), loansTotal = new Decimal(0)) {
  const start = new Date(sessionDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(sessionDate)
  end.setHours(23, 59, 59, 999)

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
  // drawingsReceived = today's opening float + any top-ups during the day.
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
  const start = new Date(sessionDate); start.setHours(0, 0, 0, 0)
  const end   = new Date(sessionDate); end.setHours(23, 59, 59, 999)

  const [
    salesCashAgg,
    salesCardAgg,
    purchasesAgg,
    paymentsAgg,
    loanTotals,
    expenses,
    unpaidTodayAgg,
    unpaidAllTimeAgg,
    approvedVariances,
    floatTopUpsAgg,
    todayFloatRecord,
  ] = await Promise.all([
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
    prisma.floatMovement.aggregate({
      _sum: { amount: true },
      where: { movementType: 'top_up', createdAt: { gte: start, lte: end } },
    }),
    prisma.cashFloat.findUnique({ where: { floatDate: start } }),
  ])

  return {
    cashSales:     new Decimal(salesCashAgg._sum.totalAmount?.toString()  ?? '0').toFixed(2),
    cardSales:     new Decimal(salesCardAgg._sum.totalAmount?.toString()  ?? '0').toFixed(2),
    cashPurchases: new Decimal(purchasesAgg._sum.totalAmount?.toString()  ?? '0').toFixed(2),
    cashPayments:  new Decimal(paymentsAgg._sum.amount?.toString()        ?? '0').toFixed(2),
    expenses:      expenses.toFixed(2),
    loanAdvance:   loanTotals.advanced,
    loanRepayment: loanTotals.repaid,
    floatTopUps:   new Decimal(todayFloatRecord?.openingAmount?.toString() ?? '0')
                     .plus(new Decimal(floatTopUpsAgg._sum.amount?.toString() ?? '0'))
                     .toFixed(2),
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
