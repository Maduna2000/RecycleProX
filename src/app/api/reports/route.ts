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
      topSaleProductsRaw,
    ] = await Promise.all([
      // 0 — Sales totals
      prisma.sale.aggregate({
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
        where: { status: 'completed', createdAt: { gte: from, lte: to } },
      }),
      // 1 — Purchase totals
      prisma.purchase.aggregate({
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
        where: { status: 'completed', createdAt: { gte: from, lte: to } },
      }),
      // 2 — Payment totals (account payments received)
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { voidedAt: null, createdAt: { gte: from, lte: to } },
      }),
      // 3 — Sales count
      prisma.sale.count({ where: { status: 'completed', createdAt: { gte: from, lte: to } } }),
      // 4 — Purchases count
      prisma.purchase.count({ where: { status: 'completed', createdAt: { gte: from, lte: to } } }),
      // 5 — New customers
      prisma.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
      // 6 — Top 10 products by purchase value
      prisma.purchaseLine.groupBy({
        by: ['productId'],
        _sum: { lineTotal: true },
        where: {
          purchase: { status: 'completed', createdAt: { gte: from, lte: to } },
        },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 10,
      }),
      // 7 — Cash-up variance for range
      prisma.cashUp.aggregate({
        _sum: { variance: true, declaredCash: true },
        where: { status: 'approved', sessionDate: { gte: from, lte: to } },
      }),
      // 8 — Expenses total
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { status: 'approved', createdAt: { gte: from, lte: to } },
      }),
      // 9 — Expenses by category
      getExpensesByCategory(from, to),
      // 10 — Top 10 products by sale revenue
      prisma.saleLine.groupBy({
        by: ['productId'],
        _sum: { lineTotal: true },
        where: {
          sale: { status: 'completed', createdAt: { gte: from, lte: to } },
        },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 10,
      }),
    ])

    // Resolve product names for top purchase + sale products
    const allProductIds = [
      ...topProducts.map((p) => p.productId),
      ...topSaleProductsRaw.map((p) => p.productId),
    ]
    const products = await prisma.product.findMany({
      where: { id: { in: allProductIds } },
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
      topSaleProducts: topSaleProductsRaw.map((p) => ({
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
