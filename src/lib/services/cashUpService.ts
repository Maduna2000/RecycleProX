import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import { SubmitCashUpInput, ApproveCashUpInput } from '@/lib/schemas/cashup'
import { getFloatForDate, updateClosingAmount } from './floatService'
import { getExpenseTotalsForDate } from './expenseService'

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
// Only one open session per day is allowed.
export async function openCashUp(openedByUserId: string, sessionDateStr?: string) {
  const dateStr = sessionDateStr ?? todayStr()
  const sessionDate = toDate(dateStr)

  const existing = await prisma.cashUp.findFirst({
    where: { sessionDate, status: { not: 'approved' } },
  })

  if (existing) {
    logger.warn({ existing: existing.id }, 'Cash-up session already open/submitted for this date')
    return existing
  }

  // Pull opening balance from today's float record
  const floatRecord = await getFloatForDate(sessionDate)
  const openingBalance = floatRecord
    ? new Decimal(floatRecord.openingAmount.toString())
    : new Decimal(0)

  const cashUp = await prisma.cashUp.create({
    data: {
      sessionDate,
      openedByUserId,
      status: 'open',
      openingBalance: openingBalance.toFixed(2),
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

  // Expected in drawer = opening + cash sales - cash purchases - cash payments - expenses - drawings + loans
  // openingBalance is stored on the cashUp record; here we return the variable components
  const cashExpected = cashSales.minus(cashPurchases).minus(cashPayments).minus(expensesTotal).minus(drawingsReceived).plus(loansTotal)

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

  const drawingsReceived = new Decimal(input.drawingsReceived ?? 0)
  const loansTotal       = new Decimal(input.loansTotal ?? 0)
  const totals = await calcSystemTotals(cashUp.sessionDate, drawingsReceived, loansTotal)

  const openingBalance = new Decimal(cashUp.openingBalance.toString())
  const declared  = new Decimal(input.declaredCash)
  // Full expected = opening + operational net
  const fullExpected = openingBalance.plus(totals.cashExpected)
  const variance = declared.minus(fullExpected)

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
