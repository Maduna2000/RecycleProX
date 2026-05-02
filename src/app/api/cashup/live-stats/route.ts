import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'
import { getLoanTotalsForDate } from '@/lib/services/loanService'
import { getExpenseTotalsForDate } from '@/lib/services/expenseService'
import logger from '@/lib/logger'

// GET /api/cashup/live-stats?date=YYYY-MM-DD
// Returns live transaction totals for a given session date.
// Used by the cash-up page to show real-time figures before submit,
// and to show the Loan Advance / Loans Repayment split.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const dateStr = searchParams.get('date')
  if (!dateStr) return NextResponse.json({ error: 'date param required' }, { status: 400 })

  const [y, m, d] = dateStr.split('-').map(Number)
  const sessionDate = new Date(y!, m! - 1, d!)
  const start = new Date(sessionDate); start.setHours(0, 0, 0, 0)
  const end   = new Date(sessionDate); end.setHours(23, 59, 59, 999)

  try {
    const [
      salesCashAgg,
      purchasesAgg,
      paymentsAgg,
      loanTotals,
      expenses,
      unpaidTodayAgg,  // typed as { total: string; count: bigint }[]
      unpaidAllTimeAgg,
      approvedVariances,
    ] = await Promise.all([
      // Cash sales (money received into drawer)
      prisma.sale.aggregate({
        _sum: { totalAmount: true },
        where: { paymentMethod: 'cash', status: 'completed', createdAt: { gte: start, lte: end } },
      }),
      // Cash purchases paid out
      prisma.purchase.aggregate({
        _sum: { totalAmount: true },
        where: { paymentMethod: 'cash', status: 'completed', createdAt: { gte: start, lte: end } },
      }),
      // Account cash payments paid out
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { paymentMethod: 'cash', voidedAt: null, createdAt: { gte: start, lte: end } },
      }),
      // Loan advances and repayments (split)
      getLoanTotalsForDate(sessionDate),
      // Approved expenses
      getExpenseTotalsForDate(sessionDate),
      // Pending purchases today — true outstanding (net of loan deduction and partial payments)
      prisma.$queryRaw<{ total: string; count: bigint }[]>`
        SELECT COALESCE(SUM("totalAmount" - COALESCE("loanDeductionAmount", 0) - "amountPaid"), 0)::text AS total,
               COUNT(*)::bigint AS count
        FROM "Purchase"
        WHERE status = 'pending' AND "createdAt" >= ${start} AND "createdAt" <= ${end}
      `,
      // All pending purchases (all time) — true outstanding
      prisma.$queryRaw<{ total: string; count: bigint }[]>`
        SELECT COALESCE(SUM("totalAmount" - COALESCE("loanDeductionAmount", 0) - "amountPaid"), 0)::text AS total,
               COUNT(*)::bigint AS count
        FROM "Purchase"
        WHERE status = 'pending'
      `,
      // Cumulative variance from ALL approved cash-ups (Fin Period Cumulative)
      prisma.cashUp.aggregate({
        _sum: { variance: true },
        where: { status: 'approved' },
      }),
    ])

    return NextResponse.json({
      cashSales:     new Decimal(salesCashAgg._sum.totalAmount?.toString()  ?? '0').toFixed(2),
      cashPurchases: new Decimal(purchasesAgg._sum.totalAmount?.toString()  ?? '0').toFixed(2),
      cashPayments:  new Decimal(paymentsAgg._sum.amount?.toString()        ?? '0').toFixed(2),
      expenses:      expenses.toFixed(2),
      loanAdvance:   loanTotals.advanced,
      loanRepayment: loanTotals.repaid,
      unpaidToday: {
        total: new Decimal(unpaidTodayAgg[0]?.total   ?? '0').toFixed(2),
        count: Number(unpaidTodayAgg[0]?.count   ?? 0),
      },
      unpaidAllTime: {
        total: new Decimal(unpaidAllTimeAgg[0]?.total ?? '0').toFixed(2),
        count: Number(unpaidAllTimeAgg[0]?.count ?? 0),
      },
      finPeriodCumulative: new Decimal(approvedVariances._sum.variance?.toString() ?? '0').toFixed(2),
    })
  } catch (err) {
    logger.error({ err, dateStr }, 'GET /api/cashup/live-stats failed')
    return NextResponse.json({ error: 'Failed to fetch live stats' }, { status: 500 })
  }
}
