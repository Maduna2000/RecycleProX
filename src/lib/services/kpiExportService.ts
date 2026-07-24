import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'

const D = (v: unknown) => new Decimal(String(v ?? 0))

export interface KpiGradeValue {
  grade: string
  value: number
}

export interface KpiPricingGrade {
  grade: string
  buyPrice: number
  sellPrice: number
}

export interface KpiExportResult {
  revenue_total: number
  sales_count: number
  buying_total: number
  buying_count: number
  expenses_total: number
  stock_value_total: number
  stock_value_grades: KpiGradeValue[]
  customer_visit_count: number
  customer_avg_time_minutes: number | null
  customer_quick_visits: number
  customer_long_visits: number
  customer_longest_visit_minutes: number | null
  pricing_reference: KpiPricingGrade[]
  net_profit_total: number
  loans_outstanding: number
  debts_outstanding: number
  payables_outstanding: number
  valuation_net_assets: number
  valuation_annual_net_profit: number
}

function categoryLabel(p: { category: string; categoryRef: { name: string; parent: { name: string } | null } | null }): string {
  return (p.categoryRef?.parent?.name ?? p.categoryRef?.name ?? p.category).toUpperCase()
}

/** Sales/purchases/expenses over the requested window — the same status-filter convention as reportService.getProfitSummary and every reports builder. */
async function computeFlowTotals(periodStart: Date, periodEnd: Date) {
  const [salesAgg, salesCount, purchasesAgg, purchasesCount, expensesAgg] = await Promise.all([
    prisma.sale.aggregate({ _sum: { totalAmount: true }, where: { status: 'completed', createdAt: { gte: periodStart, lt: periodEnd } } }),
    prisma.sale.count({ where: { status: 'completed', createdAt: { gte: periodStart, lt: periodEnd } } }),
    prisma.purchase.aggregate({ _sum: { totalAmount: true }, where: { status: 'completed', createdAt: { gte: periodStart, lt: periodEnd } } }),
    prisma.purchase.count({ where: { status: 'completed', createdAt: { gte: periodStart, lt: periodEnd } } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { status: 'approved', createdAt: { gte: periodStart, lt: periodEnd } } }),
  ])

  const revenue = D(salesAgg._sum.totalAmount)
  const buying = D(purchasesAgg._sum.totalAmount)
  const expenses = D(expensesAgg._sum.amount)

  return { revenue, salesCount, buying, purchasesCount, expenses }
}

/** As-at-periodEnd snapshot: Σ StockMovement in − out, valued at defaultBuyPrice, grouped by top-level category (spec: "meta carries the by-grade breakdown"). */
async function computeStockValue(periodEnd: Date) {
  const [inAgg, outAgg, products] = await Promise.all([
    prisma.stockMovement.groupBy({ by: ['productId'], where: { direction: 'in', createdAt: { lte: periodEnd } }, _sum: { quantity: true } }),
    prisma.stockMovement.groupBy({ by: ['productId'], where: { direction: 'out', createdAt: { lte: periodEnd } }, _sum: { quantity: true } }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, category: true, defaultBuyPrice: true, categoryRef: { select: { name: true, parent: { select: { name: true } } } } },
    }),
  ])
  const inMap = new Map(inAgg.map((r) => [r.productId, D(r._sum.quantity)]))
  const outMap = new Map(outAgg.map((r) => [r.productId, D(r._sum.quantity)]))

  const byGrade = new Map<string, Decimal>()
  let total = new Decimal(0)
  for (const p of products) {
    const onHand = (inMap.get(p.id) ?? new Decimal(0)).minus(outMap.get(p.id) ?? new Decimal(0))
    if (onHand.isZero()) continue
    const value = onHand.times(D(p.defaultBuyPrice))
    total = total.plus(value)
    const grade = categoryLabel(p)
    byGrade.set(grade, (byGrade.get(grade) ?? new Decimal(0)).plus(value))
  }

  return {
    total,
    grades: Array.from(byGrade, ([grade, value]) => ({ grade, value: value.toDecimalPlaces(2).toNumber() })),
  }
}

/** Visit-duration stats from GateEntry (arrival=createdAt, departure=exitedAt). Duration stats exclude entries still on-site (no exitedAt yet). */
async function computeCustomerTimeStats(periodStart: Date, periodEnd: Date) {
  const [visitCount, rows] = await Promise.all([
    prisma.gateEntry.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
    prisma.gateEntry.findMany({
      where: { createdAt: { gte: periodStart, lt: periodEnd }, exitedAt: { not: null } },
      select: { createdAt: true, exitedAt: true },
    }),
  ])

  const durations = rows.map((r) => (r.exitedAt!.getTime() - r.createdAt.getTime()) / 60_000)
  const avgMinutes = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null
  const longestMinutes = durations.length > 0 ? Math.max(...durations) : null

  return {
    visitCount,
    avgMinutes,
    quickVisits: durations.filter((d) => d < 15).length,
    longVisits: durations.filter((d) => d > 60).length,
    longestMinutes,
  }
}

/**
 * Current buy/sell price snapshot per top-level category — not period-
 * filtered (spec: "a snapshot, not a trend"). A category can hold several
 * distinct products at different prices (unlike the mock's one-price-per-
 * grade world); this averages them, which is a real simplification worth
 * revisiting if categories start mixing very differently priced products.
 */
async function computePricingReference(): Promise<KpiPricingGrade[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { category: true, defaultBuyPrice: true, defaultSellPrice: true, categoryRef: { select: { name: true, parent: { select: { name: true } } } } },
  })

  const byGrade = new Map<string, { buySum: Decimal; sellSum: Decimal; count: number }>()
  for (const p of products) {
    const grade = categoryLabel(p)
    const bucket = byGrade.get(grade) ?? { buySum: new Decimal(0), sellSum: new Decimal(0), count: 0 }
    bucket.buySum = bucket.buySum.plus(D(p.defaultBuyPrice))
    bucket.sellSum = bucket.sellSum.plus(D(p.defaultSellPrice))
    bucket.count += 1
    byGrade.set(grade, bucket)
  }

  return Array.from(byGrade, ([grade, b]) => ({
    grade,
    buyPrice: b.buySum.div(b.count).toDecimalPlaces(2).toNumber(),
    sellPrice: b.sellSum.div(b.count).toDecimalPlaces(2).toNumber(),
  }))
}

/** As-at-periodEnd snapshot: principal minus repayments up to that date, matching reports/builders/cash.ts buildLoansOutstanding. */
async function computeLoansOutstanding(periodEnd: Date): Promise<Decimal> {
  const loans = await prisma.loan.findMany({
    where: { createdAt: { lte: periodEnd }, status: { not: 'voided' } },
    select: { principalAmount: true, repayments: { where: { createdAt: { lte: periodEnd } }, select: { amount: true } } },
  })
  return loans.reduce((sum, loan) => {
    const outstanding = D(loan.principalAmount).minus(loan.repayments.reduce((a, r) => a.plus(D(r.amount)), new Decimal(0)))
    return outstanding.greaterThan(0) ? sum.plus(outstanding) : sum
  }, new Decimal(0))
}

/** BusinessLoan.balanceAmount is kept live-updated on every repayment (businessLoanService.applyRepaymentTx), so this is a direct sum, not a recomputation. */
async function computeDebtsOutstanding(): Promise<Decimal> {
  const agg = await prisma.businessLoan.aggregate({ _sum: { balanceAmount: true }, where: { status: 'active' } })
  return D(agg._sum.balanceAmount)
}

/** Accounts payable: purchases marked with an outstanding balance, net of any loan deduction and part-payment already made. */
async function computePayablesOutstanding(periodEnd: Date): Promise<Decimal> {
  const purchases = await prisma.purchase.findMany({
    where: { hasOutstandingBalance: true, status: { not: 'voided' }, createdAt: { lte: periodEnd } },
    select: { totalAmount: true, loanDeductionAmount: true, amountPaid: true },
  })
  return purchases.reduce(
    (sum, p) => sum.plus(D(p.totalAmount).minus(D(p.loanDeductionAmount)).minus(D(p.amountPaid))),
    new Decimal(0),
  )
}

/** Most recent approved cash-up session's declared cash at or before periodEnd — 0 if none exists yet. */
async function computeCashOnHand(periodEnd: Date): Promise<Decimal> {
  const cashUp = await prisma.cashUp.findFirst({
    where: { status: 'approved', sessionDate: { lte: periodEnd } },
    orderBy: { sessionDate: 'desc' },
    select: { declaredCash: true },
  })
  return D(cashUp?.declaredCash)
}

/**
 * Computes every RecycleProX-origin KPI for one tenant over [periodStart,
 * periodEnd). Caller must already be inside a tenantContext.run/withTenantId
 * scope — every prisma.* call here is RLS-scoped to that tenant.
 * safety_incidents_yard is deliberately not included: that data lives in
 * TimelyX's work-safety module, not RecycleProX.
 */
export async function computeKpiExport(periodStart: Date, periodEnd: Date): Promise<KpiExportResult> {
  const oneYearBeforeEnd = new Date(periodEnd)
  oneYearBeforeEnd.setFullYear(oneYearBeforeEnd.getFullYear() - 1)

  const [
    flows,
    stock,
    customerTime,
    pricing,
    loansOutstanding,
    debtsOutstanding,
    payablesOutstanding,
    cashOnHand,
    annualFlows,
  ] = await Promise.all([
    computeFlowTotals(periodStart, periodEnd),
    computeStockValue(periodEnd),
    computeCustomerTimeStats(periodStart, periodEnd),
    computePricingReference(),
    computeLoansOutstanding(periodEnd),
    computeDebtsOutstanding(),
    computePayablesOutstanding(periodEnd),
    computeCashOnHand(periodEnd),
    computeFlowTotals(oneYearBeforeEnd, periodEnd),
  ])

  const netProfit = flows.revenue.minus(flows.buying).minus(flows.expenses)
  const annualNetProfit = annualFlows.revenue.minus(annualFlows.buying).minus(annualFlows.expenses)
  const netAssets = stock.total.plus(cashOnHand).plus(loansOutstanding).minus(debtsOutstanding).minus(payablesOutstanding)

  return {
    revenue_total: flows.revenue.toDecimalPlaces(2).toNumber(),
    sales_count: flows.salesCount,
    buying_total: flows.buying.toDecimalPlaces(2).toNumber(),
    buying_count: flows.purchasesCount,
    expenses_total: flows.expenses.toDecimalPlaces(2).toNumber(),
    stock_value_total: stock.total.toDecimalPlaces(2).toNumber(),
    stock_value_grades: stock.grades,
    customer_visit_count: customerTime.visitCount,
    customer_avg_time_minutes: customerTime.avgMinutes,
    customer_quick_visits: customerTime.quickVisits,
    customer_long_visits: customerTime.longVisits,
    customer_longest_visit_minutes: customerTime.longestMinutes,
    pricing_reference: pricing,
    net_profit_total: netProfit.toDecimalPlaces(2).toNumber(),
    loans_outstanding: loansOutstanding.toDecimalPlaces(2).toNumber(),
    debts_outstanding: debtsOutstanding.toDecimalPlaces(2).toNumber(),
    payables_outstanding: payablesOutstanding.toDecimalPlaces(2).toNumber(),
    valuation_net_assets: netAssets.toDecimalPlaces(2).toNumber(),
    valuation_annual_net_profit: annualNetProfit.toDecimalPlaces(2).toNumber(),
  }
}
