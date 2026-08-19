import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'
import { getExpensesByCategory } from './expenseService'
import { getProfitAndLoss } from './ledgerReportService'
import { sastDayLabelOfInstant } from '@/lib/utils/dayBounds'

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

export async function getCashLoansReport(from: Date, to: Date) {
  const [loansAgg, repaymentsAgg, loans] = await Promise.all([
    prisma.loan.aggregate({
      _sum:   { principalAmount: true },
      _count: { _all: true },
      where: { status: { not: 'voided' }, createdAt: { gte: from, lte: to } },
    }),
    prisma.loanRepayment.aggregate({
      _sum:   { amount: true },
      _count: { _all: true },
      where: { createdAt: { gte: from, lte: to } },
    }),
    prisma.loan.findMany({
      where: { status: { not: 'voided' }, createdAt: { gte: from, lte: to } },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        _count:   { select: { repayments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ])

  const totalAdvanced  = new Decimal(loansAgg._sum.principalAmount?.toString() ?? '0')
  const totalRepaid    = new Decimal(repaymentsAgg._sum.amount?.toString()      ?? '0')

  return {
    summary: {
      totalAdvanced:   totalAdvanced.toFixed(2),
      totalRepaid:     totalRepaid.toFixed(2),
      netOutstanding:  totalAdvanced.minus(totalRepaid).toFixed(2),
      advanceCount:    loansAgg._count._all,
      repaymentCount:  repaymentsAgg._count._all,
    },
    loans,
  }
}

export async function getCancelledReport(from: Date, to: Date) {
  const [voidedPurchases, voidedSales] = await Promise.all([
    prisma.purchase.findMany({
      where: { status: 'voided', voidedAt: { gte: from, lte: to } },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        lines:    { include: { product: { select: { name: true, unit: true } } } },
      },
      orderBy: { voidedAt: 'desc' },
    }),
    prisma.sale.findMany({
      where: { status: 'voided', voidedAt: { gte: from, lte: to } },
      include: {
        lines: { include: { product: { select: { name: true, unit: true } } } },
      },
      orderBy: { voidedAt: 'desc' },
    }),
  ])

  const totalVoidedPurchases = voidedPurchases.reduce(
    (s, p) => s.plus(new Decimal(p.totalAmount.toString())), new Decimal(0)
  )
  const totalVoidedSales = voidedSales.reduce(
    (s, v) => s.plus(new Decimal(v.totalAmount.toString())), new Decimal(0)
  )

  return {
    summary: {
      purchases: { count: voidedPurchases.length, total: totalVoidedPurchases.toFixed(2) },
      sales:     { count: voidedSales.length,     total: totalVoidedSales.toFixed(2) },
    },
    voidedPurchases,
    voidedSales,
  }
}

/**
 * Sourced from the ledger's own Profit & Loss (getProfitAndLoss) rather than
 * a separate purchases-vs-sales aggregate — the two used to disagree,
 * sometimes wildly, because this report's old "Cost of Goods" summed every
 * Purchase in the period at purchase price (a cash-basis figure) against
 * VAT-inclusive Sale totals, instead of matching revenue (ex-VAT) to the
 * actual moving-average cost of what was sold, the way real accrual
 * accounting — and the Ledger module's own P&L — does. One P&L now, not two.
 */
export async function getProfitSummary(from: Date, to: Date) {
  const [pl, loansAdvancedAgg, loansRepaidAgg] = await Promise.all([
    getProfitAndLoss(sastDayLabelOfInstant(from), sastDayLabelOfInstant(to)),
    prisma.loan.aggregate({
      _sum: { principalAmount: true },
      where: { status: { not: 'voided' }, createdAt: { gte: from, lte: to } },
    }),
    prisma.loanRepayment.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: from, lte: to } },
    }),
  ])

  const revenue     = new Decimal(pl.totalRevenue)
  const advanced     = new Decimal(loansAdvancedAgg._sum.principalAmount?.toString() ?? '0')
  const repaid       = new Decimal(loansRepaidAgg._sum.amount?.toString()            ?? '0')

  return {
    revenue:     pl.totalRevenue,
    costOfGoods: pl.totalCogs,
    grossProfit: pl.grossProfit,
    expenses:    pl.totalOperatingExpenses,
    netProfit:   pl.netProfit,
    margin:      revenue.isZero() ? '0.00' : new Decimal(pl.grossProfit).div(revenue).times(100).toFixed(2),
    loans: {
      advanced: advanced.toFixed(2),
      repaid:   repaid.toFixed(2),
      net:      advanced.minus(repaid).toFixed(2),
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
      where:   { sessionDate: start, status: { in: ['open', 'submitted'] } },
      orderBy: { openedAt: 'desc' },
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
