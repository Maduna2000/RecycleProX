/**
 * Cash & Financial report builders: cash-up history, expenses, float log,
 * cash on hand, outstanding loans, loan payments, profit summary, VAT
 * summary, voided transactions.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { getRangeBoundsSAST, sastDateLabelToUTCDate, sastDayLabelOfInstant } from '@/lib/utils/dayBounds'
import { purchaseHeaderAmounts } from '@/lib/utils/vat'
import { getProfitSummary } from '@/lib/services/reportService'
import { getCustomerLoanStatement } from '@/lib/services/loanService'
import { getCustomerBusinessLoanStatement } from '@/lib/services/businessLoanService'
import { groupRows } from '@/lib/services/reports/grouping'
import { countDataRows } from '@/lib/reports/flatten'
import { DENOMINATION_LABELS, DENOMINATIONS, CURRENCY_SYMBOLS } from '@/lib/schemas/cashup'
import {
  getCashUp,
  getCashSalesForDate,
  getCashPurchasesForDate,
  getAccountPaymentsForDate,
  getExpensesForDateReport,
  getLoanAdvancesForDate,
  getLoanRepaymentsForDate,
  getCardSalesForDate,
  getTransferredPurchasesForDate,
  getDrawingsReceivedForDateReport,
} from '@/lib/services/cashUpService'
import { getSessionWindow } from '@/lib/services/cashUpWindow'
import type { ReportDocument, ReportGroup, ReportMeta, ReportRow } from '@/lib/reports/types'
import type {
  BaseReportParams,
  ExpensesReportParams,
  LoansOutstandingParams,
  LoanPaymentsParams,
  CashupSnapshotParams,
} from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

const D = (v: unknown) => new Decimal(String(v ?? 0))

function customerName(c: { firstName: string; lastName: string; companyName?: string | null }): string {
  return (c.companyName?.trim() || `${c.firstName} ${c.lastName}`).toUpperCase()
}

// ─── Cash-Up History ──────────────────────────────────────────────────────────

export async function buildCashupHistory(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const sessions = await prisma.cashUp.findMany({
    where: {
      sessionDate: {
        gte: sastDateLabelToUTCDate(params.from),
        lte: sastDateLabelToUTCDate(params.to),
      },
    },
    orderBy: { sessionDate: 'asc' },
  })

  const rows: ReportRow[] = sessions.map((s) => ({
    cells: {
      date: s.sessionDate.toISOString(),
      status: s.status.toUpperCase(),
      opening: D(s.openingBalance).toFixed(2),
      cashSales: D(s.systemCashSales).toFixed(2),
      cashPurchases: D(s.systemCashPurchases).toFixed(2),
      expenses: D(s.expensesTotal).toFixed(2),
      expected: D(s.systemCashExpected).toFixed(2),
      declared: s.declaredCash !== null ? D(s.declaredCash).toFixed(2) : null,
      variance: s.variance !== null ? D(s.variance).toFixed(2) : null,
    },
  }))

  const sum = (key: 'systemCashSales' | 'systemCashPurchases' | 'expensesTotal') =>
    sessions.reduce((a, s) => a.plus(D(s[key])), new Decimal(0)).toFixed(2)
  const varianceTotal = sessions
    .reduce((a, s) => a.plus(s.variance !== null ? D(s.variance) : new Decimal(0)), new Decimal(0))
    .toFixed(2)

  const groups: ReportGroup[] = rows.length
    ? [{ level: 0, label: 'CASH-UP SESSIONS', rows }]
    : []

  return {
    reportId: 'cashup-history',
    title: 'Cash-Up History',
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'date', label: 'Session Date', width: 0.12, format: 'date', excelWidth: 13 },
      { key: 'status', label: 'Status', width: 0.1, format: 'text', excelWidth: 10 },
      { key: 'opening', label: 'Opening', width: 0.1, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'cashSales', label: 'Cash Sales', width: 0.11, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'cashPurchases', label: 'Cash Purch.', width: 0.12, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'expenses', label: 'Expenses', width: 0.11, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'expected', label: 'Expected', width: 0.11, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'declared', label: 'Declared', width: 0.11, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'variance', label: 'Variance', width: 0.12, align: 'right', format: 'money', excelWidth: 12 },
    ],
    groups,
    grandTotal: {
      cashSales: sum('systemCashSales'),
      cashPurchases: sum('systemCashPurchases'),
      expenses: sum('expensesTotal'),
      variance: varianceTotal,
    },
    meta: { ...meta, rowCount: rows.length },
  }
}

// ─── Cash-Up Snapshot (single session, as it stood at cash-up) ────────────────

class CashupNotFoundForReportError extends Error {}

const SNAPSHOT_COLUMNS = [
  { key: 'time', label: 'Time', width: 0.13, format: 'datetime' as const, excelWidth: 16 },
  { key: 'ref', label: 'Ref', width: 0.13, format: 'text' as const, excelWidth: 14 },
  { key: 'party', label: 'Party', width: 0.24, format: 'text' as const, excelWidth: 24 },
  { key: 'description', label: 'Description', width: 0.3, format: 'text' as const, excelWidth: 30 },
  { key: 'amount', label: 'Amount', width: 0.2, align: 'right' as const, format: 'money' as const, excelWidth: 13 },
]

function snapshotRow(time: Date | null, ref: string | null, party: string | null, description: string | null, amount: string): ReportRow {
  return { cells: { time: time ? time.toISOString() : null, ref, party, description, amount } }
}

function snapshotGroup(label: string, rows: ReportRow[]): ReportGroup | null {
  if (!rows.length) return null
  const total = rows.reduce((a, r) => a.plus(D(r.cells.amount)), new Decimal(0))
  return { level: 0, label, rows, subtotal: { amount: total.toFixed(2) } }
}

export async function buildCashupSnapshot(
  params: CashupSnapshotParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const cashUp = await getCashUp(params.cashupId)
  if (!cashUp) throw new CashupNotFoundForReportError()

  const window = await getSessionWindow(prisma, cashUp)

  const [cashSales, cashPurchases, accountPayments, cardSales, transferred, expenses, loanAdvances, loanRepayments, drawings] =
    await Promise.all([
      getCashSalesForDate(window),
      getCashPurchasesForDate(window),
      getAccountPaymentsForDate(window),
      getCardSalesForDate(window),
      getTransferredPurchasesForDate(window),
      getExpensesForDateReport(window),
      getLoanAdvancesForDate(window),
      getLoanRepaymentsForDate(window),
      getDrawingsReceivedForDateReport(window),
    ])

  const groups: ReportGroup[] = []

  const declared = cashUp.declaredCash !== null ? D(cashUp.declaredCash).toFixed(2) : null
  const variance = cashUp.variance !== null ? D(cashUp.variance).toFixed(2) : null
  const summaryRows: ReportRow[] = [
    snapshotRow(cashUp.openedAt, null, null, 'Opening Balance', D(cashUp.openingBalance).toFixed(2)),
    snapshotRow(null, null, null, 'System Cash Sales', D(cashUp.systemCashSales).toFixed(2)),
    snapshotRow(null, null, null, 'System Cash Purchases', D(cashUp.systemCashPurchases).toFixed(2)),
    snapshotRow(null, null, null, 'Expenses', D(cashUp.expensesTotal).toFixed(2)),
    snapshotRow(null, null, null, 'System Cash Expected', D(cashUp.systemCashExpected).toFixed(2)),
    ...(declared !== null ? [snapshotRow(cashUp.closedAt, null, null, 'Declared Cash (Counted)', declared)] : []),
    ...(variance !== null ? [snapshotRow(null, null, null, 'Variance', variance)] : []),
  ]
  groups.push({ level: 0, label: 'SESSION SUMMARY', rows: summaryRows })

  const g1 = snapshotGroup('CASH SALES', cashSales.map((s) =>
    snapshotRow(s.createdAt, s.refNumber, s.customerName, s.description, s.totalAmount)))
  const g2 = snapshotGroup('CASH PURCHASES', cashPurchases.map((p) =>
    snapshotRow(p.createdAt, p.refNumber, p.supplierName, p.items, p.totalAmount)))
  const g3 = snapshotGroup('ACCOUNT PAYMENTS (OUT)', accountPayments.map((a) =>
    snapshotRow(a.createdAt, a.refNumber, a.customerName, a.notes, a.amount)))
  const g4 = snapshotGroup('CARD SALES', cardSales.map((s) =>
    snapshotRow(s.createdAt, s.refNumber, s.customerName, s.paymentMethod.toUpperCase(), s.totalAmount)))
  const g5 = snapshotGroup('TRANSFERRED PURCHASES (EFT)', transferred.map((p) =>
    snapshotRow(p.createdAt, p.refNumber, p.supplierName, p.bankRef, p.totalAmount)))
  const g6 = snapshotGroup('EXPENSES', expenses.map((e) =>
    snapshotRow(e.createdAt, e.refNumber, e.typeName, e.description, e.amount)))
  const g7 = snapshotGroup('LOAN ADVANCES', loanAdvances.map((l) =>
    snapshotRow(l.createdAt, l.refNumber, l.customerName, l.customerId, l.principalAmount)))
  const g8 = snapshotGroup('LOAN REPAYMENTS', loanRepayments.map((r) =>
    snapshotRow(r.createdAt, r.refNumber, r.customerName, `${r.loanRefNumber} · ${r.settledVia}`, r.amount)))
  const g9 = snapshotGroup('DRAWINGS RECEIVED', drawings.map((d) =>
    snapshotRow(d.createdAt, null, null, d.notes ?? d.movementType.toUpperCase(), d.amount)))

  for (const g of [g1, g2, g3, g4, g5, g6, g7, g8, g9]) if (g) groups.push(g)

  if (cashUp.status !== 'open') {
    const denoms = (cashUp.denominations ?? {}) as Record<string, number>
    const denomRows: ReportRow[] = []
    let counted = new Decimal(0)
    for (const cents of DENOMINATIONS) {
      const count = denoms[String(cents)] ?? 0
      if (!count) continue
      const value = new Decimal(cents).times(count).div(100)
      counted = counted.plus(value)
      denomRows.push(snapshotRow(null, null, null, `${DENOMINATION_LABELS[cents]} × ${count}`, value.toFixed(2)))
    }
    if (denomRows.length) {
      groups.push({ level: 0, label: 'CASH COUNT (DENOMINATIONS)', rows: denomRows, subtotal: { amount: counted.toFixed(2) } })
    }
  }

  const rowCount = groups.reduce((n, g) => n + (g.rows?.length ?? 0), 0)
  const currencySymbol = CURRENCY_SYMBOLS[cashUp.currency as keyof typeof CURRENCY_SYMBOLS] ?? meta.currencySymbol

  return {
    reportId: 'cashup-snapshot',
    title: 'Cash-Up Snapshot',
    subtitle: `Session ${cashUp.sessionDate.toISOString().slice(0, 10).replace(/-/g, '/')} — ${cashUp.status.toUpperCase()}`,
    params: { from: params.from, to: params.to, filters: { cashupId: params.cashupId } },
    columns: SNAPSHOT_COLUMNS,
    groups,
    summary: [
      { label: 'Expected Cash', value: `${currencySymbol}${D(cashUp.systemCashExpected).toFixed(2)}`, emphasis: false },
      ...(declared !== null ? [{ label: 'Declared Cash', value: `${currencySymbol}${declared}`, emphasis: false }] : []),
      ...(variance !== null ? [{ label: 'Variance', value: `${currencySymbol}${variance}`, emphasis: true }] : []),
    ],
    meta: { ...meta, currencySymbol, rowCount },
  }
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function buildExpensesReport(
  params: ExpensesReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)
  const status = params.status ?? 'approved'

  const expenses = await prisma.expense.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      ...(status === 'all' ? { status: { not: 'voided' as const } } : { status }),
    },
    select: {
      id: true,
      refNumber: true,
      description: true,
      amount: true,
      vatAmount: true,
      includesVat: true,
      paymentMethod: true,
      createdAt: true,
      expenseType: { select: { name: true, parent: { select: { name: true } } } },
    },
  })

  type Exp = (typeof expenses)[number]
  const parentTypeOf = (e: Exp) => (e.expenseType.parent?.name ?? e.expenseType.name).toUpperCase()
  const childTypeOf = (e: Exp) =>
    (e.expenseType.parent ? e.expenseType.name : parentTypeOf(e)).toUpperCase()

  const { groups, grandTotal } = groupRows(expenses, {
    groups: [
      { label: parentTypeOf },
      { label: childTypeOf, collapseIfSameAsParent: true },
    ],
    row: {
      key: (e) => e.id,
      build: (items) => {
        const e = items[0]!
        return {
          date: e.createdAt.toISOString(),
          ref: e.refNumber,
          description: e.description,
          method: e.paymentMethod.toUpperCase(),
          vat: e.includesVat ? D(e.vatAmount).toFixed(2) : null,
          amount: D(e.amount).toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.createdAt.toISOString(),
    },
    measures: {
      vat: (e) => (e.includesVat ? D(e.vatAmount) : new Decimal(0)),
      amount: (e) => D(e.amount),
    },
    formatTotals: (t) => ({ vat: t.vat!.toFixed(2), amount: t.amount!.toFixed(2) }),
  })

  return {
    reportId: 'expenses',
    title: 'Expenses Report',
    subtitle: status === 'all' ? 'All (pending + approved)' : `Status: ${status}`,
    params: { from: params.from, to: params.to, filters: { status } },
    columns: [
      { key: 'date', label: 'Date', width: 0.13, format: 'datetime', excelWidth: 16 },
      { key: 'ref', label: 'Ref', width: 0.11, format: 'text', excelWidth: 12 },
      { key: 'description', label: 'Description', width: 0.36, format: 'text', excelWidth: 36 },
      { key: 'method', label: 'Payment', width: 0.1, format: 'text', excelWidth: 10 },
      { key: 'vat', label: 'VAT', width: 0.13, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'amount', label: 'Amount', width: 0.17, align: 'right', format: 'money', excelWidth: 13 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}

// ─── Float Log ────────────────────────────────────────────────────────────────

export async function buildFloatLog(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const floats = await prisma.cashFloat.findMany({
    where: {
      floatDate: {
        gte: sastDateLabelToUTCDate(params.from),
        lte: sastDateLabelToUTCDate(params.to),
      },
    },
    orderBy: { floatDate: 'asc' },
    include: { movements: { orderBy: { createdAt: 'asc' } } },
  })

  const groups: ReportGroup[] = []
  let grand = new Decimal(0)
  let rowCount = 0

  for (const f of floats) {
    const rows: ReportRow[] = f.movements.map((m) => ({
      cells: {
        time: m.createdAt.toISOString(),
        type: m.movementType.replace('_', ' ').toUpperCase(),
        ref: m.referenceNote ?? null,
        amount: D(m.amount).toFixed(2),
        balance: D(m.balanceAfter).toFixed(2),
      },
    }))
    const dayTotal = f.movements.reduce((a, m) => a.plus(D(m.amount)), new Decimal(0))
    grand = grand.plus(dayTotal)
    rowCount += rows.length

    groups.push({
      level: 0,
      label: f.floatDate.toISOString().slice(0, 10).replace(/-/g, '/'),
      meta: `Opening: ${D(f.openingAmount).toFixed(2)}${f.closingAmount !== null ? `  ·  Closing: ${D(f.closingAmount).toFixed(2)}` : ''}`,
      rows,
      subtotal: { amount: dayTotal.toFixed(2) },
    })
  }

  return {
    reportId: 'float-log',
    title: 'Float Log Report',
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'time', label: 'Time', width: 0.14, format: 'time', excelWidth: 12 },
      { key: 'type', label: 'Movement', width: 0.16, format: 'text', excelWidth: 14 },
      { key: 'ref', label: 'Ref No', width: 0.3, format: 'text', excelWidth: 28 },
      { key: 'amount', label: 'Amount', width: 0.2, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'balance', label: 'Balance', width: 0.2, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups,
    grandTotal: { amount: grand.toFixed(2) },
    meta: { ...meta, rowCount },
  }
}

// ─── Cash on Hand (denominations) ─────────────────────────────────────────────

export async function buildCashOnHand(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const sessions = await prisma.cashUp.findMany({
    where: {
      sessionDate: {
        gte: sastDateLabelToUTCDate(params.from),
        lte: sastDateLabelToUTCDate(params.to),
      },
      status: { in: ['submitted', 'approved'] },
    },
    orderBy: { sessionDate: 'asc' },
    select: { sessionDate: true, status: true, declaredCash: true, variance: true, denominations: true },
  })

  const groups: ReportGroup[] = []
  let grand = new Decimal(0)
  let rowCount = 0

  for (const s of sessions) {
    const denoms = (s.denominations ?? {}) as Record<string, number>
    const rows: ReportRow[] = []
    let counted = new Decimal(0)

    for (const cents of DENOMINATIONS) {
      const count = denoms[String(cents)] ?? 0
      const value = new Decimal(cents).times(count).div(100)
      counted = counted.plus(value)
      rows.push({
        cells: {
          denomination: DENOMINATION_LABELS[cents],
          count: String(count),
          value: value.toFixed(2),
        },
      })
    }
    grand = grand.plus(counted)
    rowCount += rows.length

    const declared = s.declaredCash !== null ? D(s.declaredCash).toFixed(2) : '—'
    const variance = s.variance !== null ? D(s.variance).toFixed(2) : '—'
    groups.push({
      level: 0,
      label: `${s.sessionDate.toISOString().slice(0, 10).replace(/-/g, '/')}  (${s.status.toUpperCase()})`,
      meta: `Declared: ${declared}  ·  Variance: ${variance}`,
      rows,
      subtotal: { value: counted.toFixed(2) },
    })
  }

  return {
    reportId: 'cash-on-hand',
    title: 'Cash on Hand Report',
    subtitle: 'Denomination counts per submitted/approved cash-up session',
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'denomination', label: 'Denomination', width: 0.4, format: 'text', excelWidth: 16 },
      { key: 'count', label: 'Count', width: 0.25, align: 'right', format: 'int', excelWidth: 10 },
      { key: 'value', label: 'Value', width: 0.35, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups,
    grandTotal: { value: grand.toFixed(2) },
    meta: { ...meta, rowCount },
  }
}

// ─── Outstanding Loans ────────────────────────────────────────────────────────

export async function buildLoansOutstanding(
  params: LoansOutstandingParams,
  meta: MetaBase
): Promise<ReportDocument> {
  // As-at snapshot: balance = principal minus repayments up to the end date,
  // so historical end dates reconstruct the book as it stood then.
  const { end } = getRangeBoundsSAST(params.from, params.to)

  const loans = await prisma.loan.findMany({
    where: {
      createdAt: { lte: end },
      status: { not: 'voided' },
      ...(params.customerId ? { customerId: params.customerId } : {}),
    },
    select: {
      refNumber: true,
      principalAmount: true,
      notes: true,
      createdAt: true,
      customerId: true,
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      repayments: {
        where: { createdAt: { lte: end } },
        select: { amount: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  interface OutstandingRow {
    date: Date
    ref: string
    notes: string | null
    principal: Decimal
    repaid: Decimal
    outstanding: Decimal
  }
  const byCustomer = new Map<string, { name: string; rows: OutstandingRow[] }>()

  for (const loan of loans) {
    const principal = D(loan.principalAmount)
    const repaid = loan.repayments.reduce((a, r) => a.plus(D(r.amount)), new Decimal(0))
    const outstanding = principal.minus(repaid)
    if (outstanding.lessThanOrEqualTo(0)) continue

    if (!byCustomer.has(loan.customerId)) {
      byCustomer.set(loan.customerId, { name: customerName(loan.customer), rows: [] })
    }
    byCustomer.get(loan.customerId)!.rows.push({
      date: loan.createdAt,
      ref: loan.refNumber,
      notes: loan.notes,
      principal,
      repaid,
      outstanding,
    })
  }

  const groups: ReportGroup[] = []
  let totalPrincipal = new Decimal(0)
  let totalRepaid = new Decimal(0)
  let totalOutstanding = new Decimal(0)
  let rowCount = 0

  const buckets = Array.from(byCustomer.values()).sort((a, b) => a.name.localeCompare(b.name))
  for (const bucket of buckets) {
    let principal = new Decimal(0)
    let repaid = new Decimal(0)
    let outstanding = new Decimal(0)

    const rows: ReportRow[] = bucket.rows.map((r) => {
      principal = principal.plus(r.principal)
      repaid = repaid.plus(r.repaid)
      outstanding = outstanding.plus(r.outstanding)
      return {
        cells: {
          date: r.date.toISOString(),
          ref: r.ref,
          notes: r.notes,
          principal: r.principal.toFixed(2),
          repaid: r.repaid.toFixed(2),
          outstanding: r.outstanding.toFixed(2),
        },
      }
    })

    totalPrincipal = totalPrincipal.plus(principal)
    totalRepaid = totalRepaid.plus(repaid)
    totalOutstanding = totalOutstanding.plus(outstanding)
    rowCount += rows.length

    groups.push({
      level: 0,
      label: bucket.name,
      rows,
      subtotal: {
        principal: principal.toFixed(2),
        repaid: repaid.toFixed(2),
        outstanding: outstanding.toFixed(2),
      },
    })
  }

  return {
    reportId: 'loans-outstanding',
    title: 'Outstanding Loans',
    subtitle: `As at ${params.to}`,
    params: {
      from: params.from,
      to: params.to,
      filters: params.customerId ? { customerId: params.customerId } : {},
    },
    columns: [
      { key: 'date', label: 'Date', width: 0.13, format: 'date', excelWidth: 12 },
      { key: 'ref', label: 'Loan Ref', width: 0.15, format: 'text', excelWidth: 16 },
      { key: 'notes', label: 'Notes', width: 0.27, format: 'text', excelWidth: 32 },
      { key: 'principal', label: 'Principal', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'repaid', label: 'Repaid', width: 0.14, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'outstanding', label: 'Outstanding', width: 0.16, align: 'right', format: 'money', excelWidth: 13 },
    ],
    groups,
    grandTotal: {
      principal: totalPrincipal.toFixed(2),
      repaid: totalRepaid.toFixed(2),
      outstanding: totalOutstanding.toFixed(2),
    },
    meta: { ...meta, rowCount },
  }
}

// ─── Loan Payments ────────────────────────────────────────────────────────────

export async function buildLoanPayments(
  params: LoanPaymentsParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)
  const customerWhere = params.customerId ? { customerId: params.customerId } : {}

  // Opening balance per customer = advances before the period minus repayments
  // before the period. Repayments never belong to voided loans (voiding
  // requires zero repayments), so no loan-status filter is needed on them.
  const [openingLoans, openingRepayments, repayments, advances] = await Promise.all([
    prisma.loan.groupBy({
      by: ['customerId'],
      where: { createdAt: { lt: start }, status: { not: 'voided' }, ...customerWhere },
      _sum: { principalAmount: true },
    }),
    prisma.loanRepayment.groupBy({
      by: ['customerId'],
      where: { createdAt: { lt: start }, ...customerWhere },
      _sum: { amount: true },
    }),
    prisma.loanRepayment.findMany({
      where: { createdAt: { gte: start, lte: end }, ...customerWhere },
      select: {
        refNumber: true,
        amount: true,
        createdAt: true,
        customerId: true,
        customer: { select: { firstName: true, lastName: true, companyName: true } },
        purchase: { select: { refNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.loan.findMany({
      where: { createdAt: { gte: start, lte: end }, status: { not: 'voided' }, ...customerWhere },
      select: {
        refNumber: true,
        principalAmount: true,
        createdAt: true,
        customerId: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const openingByCustomer = new Map<string, Decimal>()
  for (const l of openingLoans) {
    openingByCustomer.set(l.customerId, D(l._sum.principalAmount))
  }
  for (const r of openingRepayments) {
    const prev = openingByCustomer.get(r.customerId) ?? new Decimal(0)
    openingByCustomer.set(r.customerId, prev.minus(D(r._sum.amount)))
  }

  // Only customers with at least one repayment in the period appear; their
  // in-period advances are included so the running balance stays true.
  interface Entry {
    date: Date
    ref: string
    purchaseRef: string | null
    description: string
    advance: Decimal | null
    repayment: Decimal | null
  }
  const byCustomer = new Map<string, { name: string; entries: Entry[] }>()

  for (const r of repayments) {
    if (!byCustomer.has(r.customerId)) {
      byCustomer.set(r.customerId, { name: customerName(r.customer), entries: [] })
    }
    // A reverseRepaymentsForPurchase() reversal entry (purchase voided after
    // it was settled) deliberately has no purchaseId, same as a genuine
    // manual repayment — but it's always a negative amount, which a real
    // repayment never is. Distinguish on that rather than mislabeling it
    // "Manual".
    const isReversal = !r.purchase && D(r.amount).isNegative()
    byCustomer.get(r.customerId)!.entries.push({
      date: r.createdAt,
      ref: r.refNumber,
      purchaseRef: r.purchase?.refNumber ?? (isReversal ? 'Voided' : 'Manual'),
      description: r.purchase
        ? 'Loan Repayment - Purchase Deduction'
        : isReversal
          ? 'Loan Repayment - Reversal (Purchase Voided)'
          : 'Loan Repayment - Manual',
      advance: null,
      repayment: D(r.amount),
    })
  }
  for (const loan of advances) {
    const bucket = byCustomer.get(loan.customerId)
    if (!bucket) continue
    bucket.entries.push({
      date: loan.createdAt,
      ref: loan.refNumber,
      purchaseRef: null,
      description: 'Advance',
      advance: D(loan.principalAmount),
      repayment: null,
    })
  }

  const groups: ReportGroup[] = []
  let totalAdvanced = new Decimal(0)
  let totalRepaid = new Decimal(0)
  let totalClosing = new Decimal(0)
  let rowCount = 0

  const buckets = Array.from(byCustomer.entries())
    .map(([customerId, bucket]) => ({ customerId, ...bucket }))
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const bucket of buckets) {
    bucket.entries.sort((a, b) => a.date.getTime() - b.date.getTime())
    const opening = openingByCustomer.get(bucket.customerId) ?? new Decimal(0)
    let balance = opening
    let advanced = new Decimal(0)
    let repaid = new Decimal(0)

    const rows: ReportRow[] = [
      {
        cells: {
          date: start.toISOString(),
          ref: null,
          purchaseRef: null,
          description: 'Opening Balance',
          advance: null,
          repayment: null,
          balance: opening.toFixed(2),
        },
      },
      ...bucket.entries.map((e) => {
        if (e.advance) { balance = balance.plus(e.advance); advanced = advanced.plus(e.advance) }
        if (e.repayment) { balance = balance.minus(e.repayment); repaid = repaid.plus(e.repayment) }
        return {
          cells: {
            date: e.date.toISOString(),
            ref: e.ref,
            purchaseRef: e.purchaseRef,
            description: e.description,
            advance: e.advance ? e.advance.toFixed(2) : null,
            repayment: e.repayment ? e.repayment.toFixed(2) : null,
            balance: balance.toFixed(2),
          },
        }
      }),
    ]

    totalAdvanced = totalAdvanced.plus(advanced)
    totalRepaid = totalRepaid.plus(repaid)
    totalClosing = totalClosing.plus(balance)
    rowCount += rows.length

    groups.push({
      level: 0,
      label: bucket.name,
      rows,
      subtotal: {
        advance: advanced.toFixed(2),
        repayment: repaid.toFixed(2),
        balance: balance.toFixed(2),
      },
    })
  }

  return {
    reportId: 'loan-payments',
    title: 'Loan Payments Report',
    subtitle: 'Opening balance and repayments per customer — repayments reference their purchase note',
    params: {
      from: params.from,
      to: params.to,
      filters: params.customerId ? { customerId: params.customerId } : {},
    },
    columns: [
      { key: 'date', label: 'Date', width: 0.11, format: 'date', excelWidth: 12 },
      { key: 'ref', label: 'Ref', width: 0.13, format: 'text', excelWidth: 16 },
      { key: 'purchaseRef', label: 'Purchase Ref', width: 0.14, format: 'text', excelWidth: 16 },
      { key: 'description', label: 'Description', width: 0.18, format: 'text', excelWidth: 30 },
      { key: 'advance', label: 'Advance', width: 0.13, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'repayment', label: 'Repayment', width: 0.14, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'balance', label: 'Balance', width: 0.17, align: 'right', format: 'money', excelWidth: 13 },
    ],
    groups,
    grandTotal: {
      advance: totalAdvanced.toFixed(2),
      repayment: totalRepaid.toFixed(2),
      balance: totalClosing.toFixed(2),
    },
    meta: { ...meta, rowCount },
  }
}

// ─── Customer Loan Statement ("Print Statement" on the Loans-tab ledger) ──────
// Renders getCustomerLoanStatement's already-computed rows (loanService.ts) —
// this builder only reshapes them into a ReportDocument for
// generateBusinessReportPdf; it does not recompute the ledger itself, so the
// on-screen statement and the printed one can never disagree.

export async function buildCustomerLoanStatement(
  customerId: string,
  period: string | undefined,
  meta: MetaBase
): Promise<ReportDocument> {
  const [customer, statement] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { firstName: true, lastName: true, companyName: true },
    }),
    getCustomerLoanStatement(customerId, period),
  ])

  const rows: ReportRow[] = statement.rows.map((r) => ({
    cells: {
      date: r.date,
      description: r.description,
      transaction: r.transaction || null,
      advance: r.advance,
      repayment: r.repayment,
      balance: r.balance,
    },
  }))

  return {
    reportId: 'customer-loan-statement',
    title: 'Special Loans Statement',
    subtitle: `For ${customerName(customer)} — Period ${statement.period}`,
    params: { from: `${statement.period}-01`, to: `${statement.period}-01` },
    columns: [
      { key: 'description', label: 'Description', width: 0.28, format: 'text', excelWidth: 28 },
      { key: 'date', label: 'Loan Date', width: 0.14, format: 'date', excelWidth: 13 },
      { key: 'transaction', label: 'Transaction', width: 0.12, format: 'text', excelWidth: 12 },
      { key: 'advance', label: 'Advance', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'repayment', label: 'Repayment', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'balance', label: 'Balance', width: 0.16, align: 'right', format: 'money', excelWidth: 13 },
    ],
    groups: [{ level: 0, label: customerName(customer), rows }],
    summary: [
      { label: 'Amount Due', value: `${meta.currencySymbol}${statement.closingBalance}`, emphasis: true },
    ],
    meta: { ...meta, rowCount: rows.length },
  }
}

// ─── Customer Business Loan Statement ──────────────────────────────────────────
// "Print Statement" on the Business Loan tab — same shape as
// buildCustomerLoanStatement above, backed by getCustomerBusinessLoanStatement
// (businessLoanService.ts) instead. Sign convention there is already inverted
// to match that tab's "You Owe" language, so this builder just passes it
// through unchanged.

export async function buildCustomerBusinessLoanStatement(
  customerId: string,
  period: string | undefined,
  meta: MetaBase
): Promise<ReportDocument> {
  const [customer, statement] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { firstName: true, lastName: true, companyName: true },
    }),
    getCustomerBusinessLoanStatement(customerId, period),
  ])

  const rows: ReportRow[] = statement.rows.map((r) => ({
    cells: {
      date: r.date,
      description: r.description,
      transaction: r.transaction || null,
      advance: r.advance,
      repayment: r.repayment,
      balance: r.balance,
    },
  }))

  return {
    reportId: 'customer-business-loan-statement',
    title: 'Business Loan Statement',
    subtitle: `For ${customerName(customer)} — Period ${statement.period}`,
    params: { from: `${statement.period}-01`, to: `${statement.period}-01` },
    columns: [
      { key: 'description', label: 'Description', width: 0.28, format: 'text', excelWidth: 28 },
      { key: 'date', label: 'Date', width: 0.14, format: 'date', excelWidth: 13 },
      { key: 'transaction', label: 'Transaction', width: 0.12, format: 'text', excelWidth: 12 },
      { key: 'advance', label: 'Borrowed', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'repayment', label: 'Repayment', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'balance', label: 'Balance', width: 0.16, align: 'right', format: 'money', excelWidth: 13 },
    ],
    groups: [{ level: 0, label: customerName(customer), rows }],
    summary: [
      { label: 'You Owe', value: `${meta.currencySymbol}${statement.closingBalance}`, emphasis: true },
    ],
    meta: { ...meta, rowCount: rows.length },
  }
}

// ─── Profit Summary ───────────────────────────────────────────────────────────

export async function buildProfitSummary(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)
  const p = await getProfitSummary(start, end)

  const rows: ReportRow[] = [
    { cells: { metric: 'Sales Revenue', amount: p.revenue } },
    { cells: { metric: 'Cost of Goods Sold', amount: p.costOfGoods } },
    { cells: { metric: 'Gross Profit', amount: p.grossProfit } },
    { cells: { metric: 'Expenses', amount: p.expenses } },
    { cells: { metric: 'Net Profit', amount: p.netProfit } },
  ]
  const loanRows: ReportRow[] = [
    { cells: { metric: 'Loans Advanced', amount: p.loans.advanced } },
    { cells: { metric: 'Loans Repaid', amount: p.loans.repaid } },
    { cells: { metric: 'Loans Net Outstanding', amount: p.loans.net } },
  ]

  return {
    reportId: 'profit-summary',
    title: 'Profit Summary',
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'metric', label: 'Metric', width: 0.6, format: 'text', excelWidth: 34 },
      { key: 'amount', label: 'Amount', width: 0.4, align: 'right', format: 'money', excelWidth: 16 },
    ],
    groups: [
      { level: 0, label: 'PROFIT & LOSS', rows },
      { level: 0, label: 'LOANS', rows: loanRows },
    ],
    summary: [
      { label: 'Gross Margin', value: `${p.margin}%`, emphasis: true },
      { label: 'Net Profit', value: `${meta.currencySymbol}${p.netProfit}`, emphasis: true },
    ],
    meta: { ...meta, rowCount: rows.length + loanRows.length },
  }
}

// ─── VAT Summary ──────────────────────────────────────────────────────────────

export async function buildVatSummary(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const [sales, purchases, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { status: 'completed', createdAt: { gte: start, lte: end } },
      select: { createdAt: true, vatAmount: true },
    }),
    prisma.purchase.findMany({
      where: { status: 'completed', createdAt: { gte: start, lte: end } },
      select: {
        createdAt: true,
        vatAmount: true,
        totalAmount: true,
        customer: { select: { zeroRated: true } },
      },
    }),
    prisma.expense.findMany({
      where: { status: 'approved', includesVat: true, createdAt: { gte: start, lte: end } },
      select: { createdAt: true, vatAmount: true },
    }),
  ])

  interface DayAcc { output: Decimal; inputPurchases: Decimal; inputExpenses: Decimal }
  const days = new Map<string, DayAcc>()
  const dayOf = (d: Date) => sastDayLabelOfInstant(d)
  const acc = (label: string): DayAcc => {
    if (!days.has(label)) {
      days.set(label, { output: new Decimal(0), inputPurchases: new Decimal(0), inputExpenses: new Decimal(0) })
    }
    return days.get(label)!
  }

  for (const s of sales) acc(dayOf(s.createdAt)).output = acc(dayOf(s.createdAt)).output.plus(D(s.vatAmount))
  for (const p of purchases) {
    const a = acc(dayOf(p.createdAt))
    a.inputPurchases = a.inputPurchases.plus(purchaseHeaderAmounts(p, p.customer.zeroRated).vat)
  }
  for (const e of expenses) {
    const a = acc(dayOf(e.createdAt))
    a.inputExpenses = a.inputExpenses.plus(D(e.vatAmount))
  }

  const labels = Array.from(days.keys()).sort()
  let tOut = new Decimal(0), tInP = new Decimal(0), tInE = new Decimal(0)
  const rows: ReportRow[] = labels.map((label) => {
    const a = days.get(label)!
    tOut = tOut.plus(a.output); tInP = tInP.plus(a.inputPurchases); tInE = tInE.plus(a.inputExpenses)
    const net = a.output.minus(a.inputPurchases).minus(a.inputExpenses)
    return {
      cells: {
        day: label.replace(/-/g, '/'),
        output: a.output.toFixed(2),
        inputPurchases: a.inputPurchases.toFixed(2),
        inputExpenses: a.inputExpenses.toFixed(2),
        net: net.toFixed(2),
      },
    }
  })

  const netTotal = tOut.minus(tInP).minus(tInE)

  return {
    reportId: 'vat-summary',
    title: 'VAT Summary',
    subtitle: 'Purchase VAT for transactions captured before per-line VAT persistence is derived from inclusive totals',
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'day', label: 'Day', width: 0.16, format: 'text', excelWidth: 13 },
      { key: 'output', label: 'Output VAT (Sales)', width: 0.21, align: 'right', format: 'money', excelWidth: 17 },
      { key: 'inputPurchases', label: 'Input VAT (Purchases)', width: 0.22, align: 'right', format: 'money', excelWidth: 19 },
      { key: 'inputExpenses', label: 'Input VAT (Expenses)', width: 0.21, align: 'right', format: 'money', excelWidth: 18 },
      { key: 'net', label: 'Net VAT', width: 0.2, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups: rows.length ? [{ level: 0, label: 'VAT POSITION BY DAY', rows }] : [],
    grandTotal: {
      output: tOut.toFixed(2),
      inputPurchases: tInP.toFixed(2),
      inputExpenses: tInE.toFixed(2),
      net: netTotal.toFixed(2),
    },
    summary: [
      { label: 'Net VAT position (payable if positive)', value: `${meta.currencySymbol}${netTotal.toFixed(2)}`, emphasis: true },
    ],
    meta: { ...meta, rowCount: rows.length },
  }
}

// ─── Cancelled / Voided Transactions ──────────────────────────────────────────

export async function buildCancelledTransactions(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const [voidedPurchases, voidedSales] = await Promise.all([
    prisma.purchase.findMany({
      where: { status: 'voided', voidedAt: { gte: start, lte: end } },
      select: {
        refNumber: true,
        voidedAt: true,
        voidReason: true,
        totalAmount: true,
        customer: { select: { firstName: true, lastName: true, companyName: true } },
      },
      orderBy: { voidedAt: 'asc' },
    }),
    prisma.sale.findMany({
      where: { status: 'voided', voidedAt: { gte: start, lte: end } },
      select: {
        refNumber: true,
        voidedAt: true,
        voidReason: true,
        totalAmount: true,
        buyerName: true,
        customer: { select: { firstName: true, lastName: true, companyName: true } },
      },
      orderBy: { voidedAt: 'asc' },
    }),
  ])

  const purchaseRows: ReportRow[] = voidedPurchases.map((p) => ({
    cells: {
      date: p.voidedAt!.toISOString(),
      ref: p.refNumber,
      party: customerName(p.customer),
      reason: p.voidReason ?? null,
      amount: D(p.totalAmount).toFixed(2),
    },
  }))
  const saleRows: ReportRow[] = voidedSales.map((s) => ({
    cells: {
      date: s.voidedAt!.toISOString(),
      ref: s.refNumber,
      party: s.customer ? customerName(s.customer) : (s.buyerName ?? 'WALK-IN').toUpperCase(),
      reason: s.voidReason ?? null,
      amount: D(s.totalAmount).toFixed(2),
    },
  }))

  const purchasesTotal = voidedPurchases.reduce((a, p) => a.plus(D(p.totalAmount)), new Decimal(0))
  const salesTotal = voidedSales.reduce((a, s) => a.plus(D(s.totalAmount)), new Decimal(0))

  const groups: ReportGroup[] = []
  if (purchaseRows.length) {
    groups.push({ level: 0, label: 'VOIDED PURCHASES', rows: purchaseRows, subtotal: { amount: purchasesTotal.toFixed(2) } })
  }
  if (saleRows.length) {
    groups.push({ level: 0, label: 'VOIDED SALES', rows: saleRows, subtotal: { amount: salesTotal.toFixed(2) } })
  }

  return {
    reportId: 'cancelled-transactions',
    title: 'Cancelled / Voided Transactions',
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'date', label: 'Voided At', width: 0.15, format: 'datetime', excelWidth: 16 },
      { key: 'ref', label: 'Ref', width: 0.12, format: 'text', excelWidth: 14 },
      { key: 'party', label: 'Customer / Supplier', width: 0.25, format: 'text', excelWidth: 26 },
      { key: 'reason', label: 'Reason', width: 0.32, format: 'text', excelWidth: 36 },
      { key: 'amount', label: 'Amount', width: 0.16, align: 'right', format: 'money', excelWidth: 13 },
    ],
    groups,
    grandTotal: { amount: purchasesTotal.plus(salesTotal).toFixed(2) },
    meta: { ...meta, rowCount: purchaseRows.length + saleRows.length },
  }
}
