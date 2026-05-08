import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'
import { getExpensesByCategory } from './expenseService'

export async function getDateRangeReport(from: Date, to: Date) {
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
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      _avg: { totalAmount: true },
      where: { status: 'completed', createdAt: { gte: from, lte: to } },
    }),
    prisma.purchase.aggregate({
      _sum: { totalAmount: true },
      _avg: { totalAmount: true },
      where: { status: 'completed', createdAt: { gte: from, lte: to } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { voidedAt: null, createdAt: { gte: from, lte: to } },
    }),
    prisma.sale.count({ where: { status: 'completed', createdAt: { gte: from, lte: to } } }),
    prisma.purchase.count({ where: { status: 'completed', createdAt: { gte: from, lte: to } } }),
    prisma.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.purchaseLine.groupBy({
      by: ['productId'],
      _sum: { lineTotal: true },
      where: { purchase: { status: 'completed', createdAt: { gte: from, lte: to } } },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 10,
    }),
    prisma.cashUp.aggregate({
      _sum: { variance: true, declaredCash: true },
      where: { status: 'approved', sessionDate: { gte: from, lte: to } },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { status: 'approved', createdAt: { gte: from, lte: to } },
    }),
    getExpensesByCategory(from, to),
    prisma.saleLine.groupBy({
      by: ['productId'],
      _sum: { lineTotal: true },
      where: { sale: { status: 'completed', createdAt: { gte: from, lte: to } } },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 10,
    }),
  ])

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

  return {
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
    payments:    { total: totalPayments.toFixed(2) },
    netFlow:     netFlow.toFixed(2),
    newCustomers,
    expenses:    { total: totalExpenses.toFixed(2), byCategory: expensesByCategory },
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
      totalVariance: new Decimal(cashUpAgg._sum.variance?.toString()     ?? '0').toFixed(2),
      totalDeclared: new Decimal(cashUpAgg._sum.declaredCash?.toString() ?? '0').toFixed(2),
    },
  }
}

export async function getTodayStats() {
  const now   = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end   = new Date(now); end.setHours(23, 59, 59, 999)

  const [salesAgg, purchasesAgg, salesCount, purchasesCount, openCashUp] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: { status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    prisma.purchase.aggregate({
      _sum: { totalAmount: true },
      where: { status: 'completed', createdAt: { gte: start, lte: end } },
    }),
    prisma.sale.count({ where: { status: 'completed', createdAt: { gte: start, lte: end } } }),
    prisma.purchase.count({ where: { status: 'completed', createdAt: { gte: start, lte: end } } }),
    prisma.cashUp.findFirst({
      where: { sessionDate: start, status: { in: ['open', 'submitted'] } },
    }),
  ])

  const totalSales     = new Decimal(salesAgg._sum.totalAmount?.toString()     ?? '0')
  const totalPurchases = new Decimal(purchasesAgg._sum.totalAmount?.toString() ?? '0')

  return {
    date:         start.toISOString().split('T')[0],
    sales:        { total: totalSales.toFixed(2),     count: salesCount },
    purchases:    { total: totalPurchases.toFixed(2), count: purchasesCount },
    netFlow:      totalSales.minus(totalPurchases).toFixed(2),
    cashUpStatus: openCashUp?.status ?? null,
    cashUpId:     openCashUp?.id     ?? null,
  }
}
