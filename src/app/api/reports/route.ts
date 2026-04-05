import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'
import { getExpensesByCategory } from '@/lib/services/expenseService'

/**
 * GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns aggregated metrics for the date range.
 * Manager/admin only.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const fromParam = searchParams.get('from')
  const toParam   = searchParams.get('to')

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'from and to params required (YYYY-MM-DD)' }, { status: 400 })
  }

  const [fy, fm, fd] = fromParam.split('-').map(Number)
  const [ty, tm, td] = toParam.split('-').map(Number)
  const from = new Date(fy!, fm! - 1, fd!)
  from.setHours(0, 0, 0, 0)
  const to = new Date(ty!, tm! - 1, td!)
  to.setHours(23, 59, 59, 999)

  try {
    const [
      salesAgg,
      purchasesAgg,
      paymentsAgg,
      salesCount,
      purchasesCount,
      newCustomers,
      topProducts,
      cashUpAgg,
      expensesAgg,
      expensesByCategory,
    ] = await Promise.all([
      // Sales totals
      prisma.sale.aggregate({
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
        where: { status: 'completed', createdAt: { gte: from, lte: to } },
      }),
      // Purchase totals
      prisma.purchase.aggregate({
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
        where: { status: 'completed', createdAt: { gte: from, lte: to } },
      }),
      // Payment totals (account payments received)
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { voidedAt: null, createdAt: { gte: from, lte: to } },
      }),
      // Transaction counts
      prisma.sale.count({ where: { status: 'completed', createdAt: { gte: from, lte: to } } }),
      prisma.purchase.count({ where: { status: 'completed', createdAt: { gte: from, lte: to } } }),
      // New customers
      prisma.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
      // Top 10 products by purchase value
      prisma.purchaseLine.groupBy({
        by: ['productId'],
        _sum: { lineTotal: true },
        where: {
          purchase: { status: 'completed', createdAt: { gte: from, lte: to } },
        },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 10,
      }),
      // Cash-up variance for range
      prisma.cashUp.aggregate({
        _sum: { variance: true, declaredCash: true },
        where: { status: 'approved', sessionDate: { gte: from, lte: to } },
      }),
      // Expenses total
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { status: 'approved', createdAt: { gte: from, lte: to } },
      }),
      // Expenses by category
      getExpensesByCategory(from, to),
    ])

    // Resolve product names for top products
    const productIds = topProducts.map((p) => p.productId)
    const products   = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, unit: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    const totalSales     = new Decimal(salesAgg._sum.totalAmount?.toString()     ?? '0')
    const totalPurchases = new Decimal(purchasesAgg._sum.totalAmount?.toString() ?? '0')
    const totalPayments  = new Decimal(paymentsAgg._sum.amount?.toString()       ?? '0')
    const totalExpenses  = new Decimal(expensesAgg._sum.amount?.toString()       ?? '0')
    const netFlow        = totalSales.minus(totalPurchases).minus(totalExpenses)

    return NextResponse.json({
      range: { from: fromParam, to: toParam },
      sales: {
        total:   totalSales.toFixed(2),
        count:   salesCount,
        average: new Decimal(salesAgg._avg.totalAmount?.toString() ?? '0').toFixed(2),
      },
      purchases: {
        total:   totalPurchases.toFixed(2),
        count:   purchasesCount,
        average: new Decimal(purchasesAgg._avg.totalAmount?.toString() ?? '0').toFixed(2),
      },
      payments: {
        total: totalPayments.toFixed(2),
      },
      netFlow:      netFlow.toFixed(2),
      newCustomers,
      expenses: {
        total:      totalExpenses.toFixed(2),
        byCategory: expensesByCategory,
      },
      topProducts: topProducts.map((p) => ({
        productId:   p.productId,
        productName: productMap.get(p.productId)?.name ?? 'Unknown',
        unit:        productMap.get(p.productId)?.unit ?? '',
        totalValue:  new Decimal(p._sum.lineTotal?.toString() ?? '0').toFixed(2),
      })),
      cashUp: {
        totalVariance:  new Decimal(cashUpAgg._sum.variance?.toString()     ?? '0').toFixed(2),
        totalDeclared:  new Decimal(cashUpAgg._sum.declaredCash?.toString() ?? '0').toFixed(2),
      },
    })
  } catch (err) {
    logger.error({ err }, 'GET /api/reports failed')
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
