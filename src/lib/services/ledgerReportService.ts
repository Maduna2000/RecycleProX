import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { sastDateLabelToUTCDate, getDayBoundsSAST, getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { computeSaleEftAmount } from '@/lib/services/ledgerService'
import type { AccountType, AccountNormalBalance } from '@prisma/client'

// ─── Design ──────────────────────────────────────────────────────────────────
// Read-only reporting over Account/JournalLine — every figure here is derived
// directly from posted entries, never recalculated ad hoc or cached. See
// docs/plans/2026-08-14-ledger-module-design.md section 5.
//
// Two distinct kinds of "balance" are used throughout:
// - OWN balance: this account's own JournalLines only. Structural parent
//   accounts (Inventory, Sales Revenue, COGS, Operating Expenses) never
//   receive a direct posting — everything lands on their category/expense-
//   type children — so a parent's own balance is always zero by
//   construction. This is what Trial Balance shows (and is the real
//   debits-equal-credits self-check, since every posted entry balances on
//   its own lines).
// - ROLLUP balance: own + every descendant's own, summed. This is what a
//   business owner actually wants to see for "Inventory" or "Sales Revenue"
//   as a whole — used by the Chart of Accounts tree, Balance Sheet, and P&L.

interface Sums { debit: Decimal; credit: Decimal }

async function sumLinesByAccount(where: { entryDate?: { lte?: Date; gte?: Date } }): Promise<Map<string, Sums>> {
  const grouped = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: Object.keys(where).length ? { journalEntry: where } : undefined,
    _sum: { debit: true, credit: true },
  })
  const map = new Map<string, Sums>()
  for (const g of grouped) {
    map.set(g.accountId, {
      debit: new Decimal(g._sum.debit?.toString() ?? '0'),
      credit: new Decimal(g._sum.credit?.toString() ?? '0'),
    })
  }
  return map
}

/** Signed balance per this account's own normal-balance convention (positive = normal side). */
function ownBalance(sums: Sums | undefined, normalBalance: AccountNormalBalance): Decimal {
  if (!sums) return new Decimal(0)
  return normalBalance === 'debit' ? sums.debit.minus(sums.credit) : sums.credit.minus(sums.debit)
}

// ─── Chart of Accounts ──────────────────────────────────────────────────────

export interface AccountTreeNode {
  id: string
  code: string
  name: string
  type: AccountType
  normalBalance: AccountNormalBalance
  isActive: boolean
  ownBalance: string
  totalBalance: string
  children: AccountTreeNode[]
}

export async function getChartOfAccounts(asOfLabel?: string): Promise<AccountTreeNode[]> {
  const asOf = asOfLabel ? getDayBoundsSAST(sastDateLabelToUTCDate(asOfLabel)).end : undefined
  const [accounts, sums] = await Promise.all([
    prisma.account.findMany({ orderBy: [{ code: 'asc' }] }),
    sumLinesByAccount(asOf ? { entryDate: { lte: asOf } } : {}),
  ])

  const byParent = new Map<string | null, typeof accounts>()
  for (const a of accounts) {
    const key = a.parentAccountId
    byParent.set(key, [...(byParent.get(key) ?? []), a])
  }

  function build(parentId: string | null): AccountTreeNode[] {
    return (byParent.get(parentId) ?? []).map((a) => {
      const children = build(a.id)
      const own = ownBalance(sums.get(a.id), a.normalBalance)
      const total = children.reduce((sum, c) => sum.plus(c.totalBalance), own)
      return {
        id: a.id, code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance,
        isActive: a.isActive,
        ownBalance: own.toFixed(2),
        totalBalance: total.toFixed(2),
        children,
      }
    })
  }

  return build(null)
}

// ─── Trial Balance ──────────────────────────────────────────────────────────

export interface TrialBalanceRow {
  accountId: string
  code: string
  name: string
  debit: string
  credit: string
}

export interface TrialBalanceReport {
  asOf: string
  rows: TrialBalanceRow[]
  totalDebit: string
  totalCredit: string
  balanced: boolean
}

/** Every account with any activity, own-lines only — the real debits==credits self-check. */
export async function getTrialBalance(asOfLabel: string): Promise<TrialBalanceReport> {
  const asOf = getDayBoundsSAST(sastDateLabelToUTCDate(asOfLabel)).end
  const [accounts, sums] = await Promise.all([
    prisma.account.findMany({ orderBy: [{ code: 'asc' }] }),
    sumLinesByAccount({ entryDate: { lte: asOf } }),
  ])

  const rows: TrialBalanceRow[] = []
  let totalDebit = new Decimal(0)
  let totalCredit = new Decimal(0)

  for (const a of accounts) {
    const s = sums.get(a.id)
    if (!s || (s.debit.isZero() && s.credit.isZero())) continue
    const balance = ownBalance(s, a.normalBalance)
    const debit = a.normalBalance === 'debit' ? Decimal.max(balance, 0) : Decimal.max(balance.negated(), 0)
    const credit = a.normalBalance === 'credit' ? Decimal.max(balance, 0) : Decimal.max(balance.negated(), 0)
    rows.push({ accountId: a.id, code: a.code, name: a.name, debit: debit.toFixed(2), credit: credit.toFixed(2) })
    totalDebit = totalDebit.plus(debit)
    totalCredit = totalCredit.plus(credit)
  }

  return {
    asOf: asOfLabel,
    rows,
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    balanced: totalDebit.equals(totalCredit),
  }
}

// ─── Profit & Loss ──────────────────────────────────────────────────────────

export interface PLLine { code: string; name: string; amount: string }
export interface ProfitAndLossReport {
  from: string
  to: string
  revenue: PLLine[]
  totalRevenue: string
  costOfGoodsSold: PLLine[]
  totalCogs: string
  grossProfit: string
  operatingExpenses: PLLine[]
  totalOperatingExpenses: string
  netProfit: string
}

/** Category/type-level lines (the account tree's children) rolled up under each parent, for the period only. */
async function periodLinesUnder(parentCode: string, from: Date, to: Date): Promise<{ lines: PLLine[]; total: Decimal }> {
  // findFirst (not findUnique by tenantId_code) — RLS already scopes to the
  // caller's tenant, and `code` alone is enough to find it within that scope.
  const parent = await prisma.account.findFirst({ where: { code: parentCode } })
  // Only unreachable once ensureStructuralAccounts has run at least once
  // (every live posting call triggers it) — a report requested before any
  // transaction has ever posted sees an empty, all-zero report instead.
  if (!parent) return { lines: [], total: new Decimal(0) }

  const children = await prisma.account.findMany({ where: { parentAccountId: parent.id }, orderBy: { code: 'asc' } })
  const targets = children.length > 0 ? children : [parent]
  const sums = await sumLinesByAccount({ entryDate: { gte: from, lte: to } })

  const lines: PLLine[] = []
  let total = new Decimal(0)
  for (const acc of targets) {
    const s = sums.get(acc.id)
    if (!s) continue
    const amount = ownBalance(s, parent.normalBalance)
    if (amount.isZero()) continue
    lines.push({ code: acc.code, name: acc.name, amount: amount.toFixed(2) })
    total = total.plus(amount)
  }
  return { lines, total }
}

// ─── Profit by Category ─────────────────────────────────────────────────────
// Same posted-entry source as getProfitAndLoss (Sales Revenue–[category] and
// COGS–[category] sub-accounts, auto-vivified per real category by
// categoryAccountId in ledgerService.ts) — just re-keyed by category name
// instead of rolled into one P&L total, for the Ledger dashboard's
// profit-by-category chart/card.

/** categoryName -> this account's own period balance, for every category sub-account under `parentCode`. */
async function categoryLinesUnder(parentCode: string, start: Date, end: Date): Promise<Map<string, Decimal>> {
  const parent = await prisma.account.findFirst({ where: { code: parentCode } })
  const map = new Map<string, Decimal>()
  if (!parent) return map

  const children = await prisma.account.findMany({
    where: { parentAccountId: parent.id, sourceCategoryName: { not: null } },
  })
  const sums = await sumLinesByAccount({ entryDate: { gte: start, lte: end } })

  for (const acc of children) {
    if (!acc.sourceCategoryName) continue
    const amount = ownBalance(sums.get(acc.id), parent.normalBalance)
    if (amount.isZero()) continue
    map.set(acc.sourceCategoryName, amount)
  }
  return map
}

export interface CategoryProfitRow {
  category: string
  revenue: string
  cogs: string
  profit: string
}
export interface ProfitByCategoryReport {
  from: string
  to: string
  rows: CategoryProfitRow[]
  totalRevenue: string
  totalCogs: string
  totalProfit: string
}

export async function getProfitByCategory(fromLabel: string, toLabel: string): Promise<ProfitByCategoryReport> {
  const { start, end } = getRangeBoundsSAST(fromLabel, toLabel)
  const zero = new Decimal(0)

  const [revenueByCategory, cogsByCategory] = await Promise.all([
    categoryLinesUnder(LEDGER_CODES.SALES_REVENUE, start, end),
    categoryLinesUnder(LEDGER_CODES.COGS, start, end),
  ])

  const categories = new Set([...revenueByCategory.keys(), ...cogsByCategory.keys()])
  const rows: CategoryProfitRow[] = []
  let totalRevenue = zero
  let totalCogs = zero

  for (const category of categories) {
    const revenue = revenueByCategory.get(category) ?? zero
    const cogs = cogsByCategory.get(category) ?? zero
    totalRevenue = totalRevenue.plus(revenue)
    totalCogs = totalCogs.plus(cogs)
    rows.push({ category, revenue: revenue.toFixed(2), cogs: cogs.toFixed(2), profit: revenue.minus(cogs).toFixed(2) })
  }
  rows.sort((a, b) => new Decimal(b.profit).minus(a.profit).toNumber())

  return {
    from: fromLabel,
    to: toLabel,
    rows,
    totalRevenue: totalRevenue.toFixed(2),
    totalCogs: totalCogs.toFixed(2),
    totalProfit: totalRevenue.minus(totalCogs).toFixed(2),
  }
}

// ─── Stock Value by Category ────────────────────────────────────────────────
// Current stock on hand valued two ways per category: at cost (average cost
// per ProductAverageCost — the same moving-average figure ledgerService.ts
// uses to post COGS) and at its current sale value (Product.defaultSellPrice)
// — the gap between them is the *potential* profit still sitting in stock,
// distinct from getProfitByCategory's *realized* profit from what's already
// sold. "Total stock" is summed in kg — tons are converted (×1000); a
// category whose products are counted in `each`/`litre` instead of a weight
// unit gets its own separate non-weight quantity so it's never silently
// folded into a meaningless kg figure.
export interface CategoryStockRow {
  category: string
  totalKg: string
  otherQty: string | null // e.g. "12 each" when the category has non-weight-unit products
  costValue: string
  saleValue: string
  potentialProfit: string
}
export interface StockValueByCategoryReport {
  asOf: string
  rows: CategoryStockRow[]
  totalCostValue: string
  totalSaleValue: string
  totalPotentialProfit: string
}

export async function getStockValueByCategory(): Promise<StockValueByCategoryReport> {
  const zero = new Decimal(0)

  const [movements, products, costs] = await Promise.all([
    prisma.stockMovement.groupBy({ by: ['productId', 'direction'], _sum: { quantity: true } }),
    prisma.product.findMany({ where: { isActive: true } }),
    prisma.productAverageCost.findMany(),
  ])

  const onHandByProduct = new Map<string, Decimal>()
  for (const m of movements) {
    const qty = new Decimal(m._sum.quantity?.toString() ?? '0')
    const prev = onHandByProduct.get(m.productId) ?? zero
    onHandByProduct.set(m.productId, m.direction === 'in' ? prev.plus(qty) : prev.minus(qty))
  }
  const costByProduct = new Map(costs.map((c) => [c.productId, new Decimal(c.averageCost.toString())]))

  interface Acc { kg: Decimal; otherByUnit: Map<string, Decimal>; costValue: Decimal; saleValue: Decimal }
  const byCategory = new Map<string, Acc>()

  for (const p of products) {
    const onHand = onHandByProduct.get(p.id) ?? zero
    if (onHand.isZero()) continue

    const acc = byCategory.get(p.category) ?? { kg: zero, otherByUnit: new Map(), costValue: zero, saleValue: zero }
    if (p.unit === 'kg') acc.kg = acc.kg.plus(onHand)
    else if (p.unit === 'ton') acc.kg = acc.kg.plus(onHand.times(1000))
    else acc.otherByUnit.set(p.unit, (acc.otherByUnit.get(p.unit) ?? zero).plus(onHand))

    const avgCost = costByProduct.get(p.id) ?? zero
    acc.costValue = acc.costValue.plus(onHand.times(avgCost))
    acc.saleValue = acc.saleValue.plus(onHand.times(new Decimal(p.defaultSellPrice.toString())))
    byCategory.set(p.category, acc)
  }

  const rows: CategoryStockRow[] = []
  let totalCostValue = zero
  let totalSaleValue = zero
  for (const [category, acc] of byCategory) {
    totalCostValue = totalCostValue.plus(acc.costValue)
    totalSaleValue = totalSaleValue.plus(acc.saleValue)
    const otherQty = acc.otherByUnit.size > 0
      ? [...acc.otherByUnit].map(([unit, qty]) => `${qty.toFixed(2)} ${unit}`).join(' + ')
      : null
    rows.push({
      category,
      totalKg: acc.kg.toFixed(2),
      otherQty,
      costValue: acc.costValue.toFixed(2),
      saleValue: acc.saleValue.toFixed(2),
      potentialProfit: acc.saleValue.minus(acc.costValue).toFixed(2),
    })
  }
  rows.sort((a, b) => new Decimal(b.costValue).minus(a.costValue).toNumber())

  return {
    asOf: new Date().toISOString(),
    rows,
    totalCostValue: totalCostValue.toFixed(2),
    totalSaleValue: totalSaleValue.toFixed(2),
    totalPotentialProfit: totalSaleValue.minus(totalCostValue).toFixed(2),
  }
}

export async function getProfitAndLoss(fromLabel: string, toLabel: string): Promise<ProfitAndLossReport> {
  const { start, end } = getRangeBoundsSAST(fromLabel, toLabel)

  const [revenue, cogs, opex] = await Promise.all([
    periodLinesUnder(LEDGER_CODES.SALES_REVENUE, start, end),
    periodLinesUnder(LEDGER_CODES.COGS, start, end),
    periodLinesUnder(LEDGER_CODES.OPERATING_EXPENSES, start, end),
  ])

  const grossProfit = revenue.total.minus(cogs.total)
  const netProfit = grossProfit.minus(opex.total)

  return {
    from: fromLabel,
    to: toLabel,
    revenue: revenue.lines,
    totalRevenue: revenue.total.toFixed(2),
    costOfGoodsSold: cogs.lines,
    totalCogs: cogs.total.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    operatingExpenses: opex.lines,
    totalOperatingExpenses: opex.total.toFixed(2),
    netProfit: netProfit.toFixed(2),
  }
}

// ─── Balance Sheet ──────────────────────────────────────────────────────────

export interface BalanceSheetSection { lines: PLLine[]; total: string }
export interface BalanceSheetReport {
  asOf: string
  assets: BalanceSheetSection
  liabilities: BalanceSheetSection
  equity: BalanceSheetSection
  totalLiabilitiesAndEquity: string
  balanced: boolean
}

export async function getBalanceSheet(asOfLabel: string): Promise<BalanceSheetReport> {
  const tree = await getChartOfAccounts(asOfLabel)

  function topLevelByType(type: AccountType): PLLine[] {
    return tree
      .filter((n) => n.type === type)
      .filter((n) => !new Decimal(n.totalBalance).isZero())
      .map((n) => ({ code: n.code, name: n.name, amount: n.totalBalance }))
  }

  const assetLines = topLevelByType('asset')
  const liabilityLines = topLevelByType('liability')
  const equityLines = topLevelByType('equity')

  const totalAssets = assetLines.reduce((s, l) => s.plus(l.amount), new Decimal(0))
  const totalLiabilities = liabilityLines.reduce((s, l) => s.plus(l.amount), new Decimal(0))
  const totalEquityPosted = equityLines.reduce((s, l) => s.plus(l.amount), new Decimal(0))

  // Net income to date (revenue - COGS - opex, all-time through asOf) isn't
  // closed into Owner's Equity by any posting in this system — it's added
  // here as a synthetic line so the sheet actually balances, same as any
  // live (not-yet-period-closed) balance sheet.
  const start = getDayBoundsSAST(sastDateLabelToUTCDate('2000-01-01')).start
  const end = getDayBoundsSAST(sastDateLabelToUTCDate(asOfLabel)).end
  const [revenue, cogs, opex] = await Promise.all([
    periodLinesUnder(LEDGER_CODES.SALES_REVENUE, start, end),
    periodLinesUnder(LEDGER_CODES.COGS, start, end),
    periodLinesUnder(LEDGER_CODES.OPERATING_EXPENSES, start, end),
  ])
  const netIncomeToDate = revenue.total.minus(cogs.total).minus(opex.total)

  const equityLinesWithRetained: PLLine[] = netIncomeToDate.isZero()
    ? equityLines
    : [...equityLines, { code: '3900', name: 'Retained Earnings (current)', amount: netIncomeToDate.toFixed(2) }]
  const totalEquity = totalEquityPosted.plus(netIncomeToDate)

  const totalLiabAndEquity = totalLiabilities.plus(totalEquity)

  return {
    asOf: asOfLabel,
    assets: { lines: assetLines, total: totalAssets.toFixed(2) },
    liabilities: { lines: liabilityLines, total: totalLiabilities.toFixed(2) },
    equity: { lines: equityLinesWithRetained, total: totalEquity.toFixed(2) },
    totalLiabilitiesAndEquity: totalLiabAndEquity.toFixed(2),
    balanced: totalAssets.toDecimalPlaces(2).equals(totalLiabAndEquity.toDecimalPlaces(2)),
  }
}

// ─── General Ledger (one account's line-by-line activity) ─────────────────

export interface GeneralLedgerRow {
  journalLineId: string
  journalEntryId: string
  entryDate: string
  description: string
  sourceType: string
  sourceId: string | null
  debit: string
  credit: string
  runningBalance: string
}

export interface GeneralLedgerReport {
  account: { id: string; code: string; name: string; normalBalance: AccountNormalBalance }
  openingBalance: string
  rows: GeneralLedgerRow[]
  closingBalance: string
}

export async function getGeneralLedger(accountId: string, fromLabel: string, toLabel: string): Promise<GeneralLedgerReport> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
  const { start, end } = getRangeBoundsSAST(fromLabel, toLabel)

  const [openingSums, lines] = await Promise.all([
    sumLinesByAccount({ entryDate: { lte: new Date(start.getTime() - 1) } }),
    prisma.journalLine.findMany({
      where: { accountId, journalEntry: { entryDate: { gte: start, lte: end } } },
      include: { journalEntry: true },
      orderBy: [{ journalEntry: { entryDate: 'asc' } }, { id: 'asc' }],
    }),
  ])

  let balance = ownBalance(openingSums.get(accountId), account.normalBalance)
  const opening = balance
  const rows: GeneralLedgerRow[] = lines.map((l) => {
    const debit = new Decimal(l.debit.toString())
    const credit = new Decimal(l.credit.toString())
    balance = account.normalBalance === 'debit' ? balance.plus(debit).minus(credit) : balance.plus(credit).minus(debit)
    return {
      journalLineId: l.id,
      journalEntryId: l.journalEntryId,
      entryDate: l.journalEntry.entryDate.toISOString(),
      description: l.journalEntry.description,
      sourceType: l.journalEntry.sourceType,
      sourceId: l.journalEntry.sourceId,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      runningBalance: balance.toFixed(2),
    }
  })

  return {
    account: { id: account.id, code: account.code, name: account.name, normalBalance: account.normalBalance },
    openingBalance: opening.toFixed(2),
    rows,
    closingBalance: balance.toFixed(2),
  }
}

// ─── Journal (raw chronological feed) ──────────────────────────────────────

export interface JournalEntryRow {
  id: string
  entryDate: string
  description: string
  sourceType: string
  sourceId: string | null
  lines: { accountCode: string; accountName: string; debit: string; credit: string }[]
}

export async function getJournal(opts: { fromLabel: string; toLabel: string; sourceType?: string; page?: number; pageSize?: number }): Promise<{ entries: JournalEntryRow[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const { start, end } = getRangeBoundsSAST(opts.fromLabel, opts.toLabel)
  const page = opts.page ?? 1
  const pageSize = opts.pageSize ?? 50
  const where = {
    entryDate: { gte: start, lte: end },
    ...(opts.sourceType ? { sourceType: opts.sourceType } : {}),
  }

  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { account: true } } },
      orderBy: { entryDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.journalEntry.count({ where }),
  ])

  return {
    entries: entries.map((e) => ({
      id: e.id,
      entryDate: e.entryDate.toISOString(),
      description: e.description,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      lines: e.lines.map((l) => ({
        accountCode: l.account.code,
        accountName: l.account.name,
        debit: new Decimal(l.debit.toString()).toFixed(2),
        credit: new Decimal(l.credit.toString()).toFixed(2),
      })),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  }
}

// Local copy of the codes this file needs — importing LEDGER_ACCOUNTS from
// ledgerService.ts directly would be equally correct; spelled out here to
// keep this file's only dependency on ledgerService's posting internals nil.
const LEDGER_CODES = {
  SALES_REVENUE: '4000',
  COGS: '5000',
  OPERATING_EXPENSES: '5100',
}

// ─── Pending Payments (unpaid Sales) ───────────────────────────────────────
// Dashboard widget: real Sale rows still owed by a buyer, not derived from
// the ledger's own Accounts Receivable balance — that account also holds
// completed-but-EFT-unconfirmed amounts (see getEftAwaitingConfirmation),
// and this list is specifically "money not paid via ANY method yet".

export interface PendingSalePaymentRow {
  saleId: string
  refNumber: string
  buyerName: string | null
  totalAmount: string
  amountPaid: string
  outstanding: string
  createdAt: string
}

export async function getPendingSalesPayments(): Promise<{ rows: PendingSalePaymentRow[]; total: string }> {
  const sales = await prisma.sale.findMany({
    where: { status: 'pending' },
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const rows: PendingSalePaymentRow[] = sales.map((s) => {
    const totalAmount = new Decimal(s.totalAmount.toString())
    const amountPaid = new Decimal(s.amountPaid?.toString() ?? '0')
    return {
      saleId: s.id,
      refNumber: s.refNumber,
      buyerName: s.customer ? `${s.customer.firstName} ${s.customer.lastName}` : s.buyerName,
      totalAmount: totalAmount.toFixed(2),
      amountPaid: amountPaid.toFixed(2),
      outstanding: totalAmount.minus(amountPaid).toFixed(2),
      createdAt: s.createdAt.toISOString(),
    }
  })
  const total = rows.reduce((sum, r) => sum.plus(r.outstanding), new Decimal(0))
  return { rows, total: total.toFixed(2) }
}

// ─── EFT Awaiting Confirmation ──────────────────────────────────────────────
// Dashboard widget: completed sales paid (fully or partly) via EFT that
// postSale/postSaleSettlement left sitting in Accounts Receivable, not yet
// moved to Bank via postEftConfirmation.

export interface EftAwaitingConfirmationRow {
  saleId: string
  refNumber: string
  buyerName: string | null
  eftAmount: string
  createdAt: string
}

export async function getEftAwaitingConfirmation(): Promise<{ rows: EftAwaitingConfirmationRow[]; total: string }> {
  // Filtered in JS (not the WHERE clause) — a split-payment sale might carry
  // an eft leg regardless of its own top-level paymentMethod, and Prisma's
  // JSON-field "not null" filter typing is awkward for a mixed OR like
  // this; computeSaleEftAmount below is the one true source of "does this
  // sale actually have an eft amount" anyway, so there's no real need to
  // duplicate that logic in the query itself.
  const candidates = await prisma.sale.findMany({
    where: { status: 'completed' },
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const confirmedSaleIds = new Set(
    (await prisma.journalEntry.findMany({ where: { sourceType: 'eft_confirmation' }, select: { sourceId: true } }))
      .map((e) => e.sourceId)
      .filter((id): id is string => !!id)
  )

  const rows: EftAwaitingConfirmationRow[] = []
  for (const s of candidates) {
    if (confirmedSaleIds.has(s.id)) continue
    const eftAmount = computeSaleEftAmount(s)
    if (eftAmount.lessThanOrEqualTo(0)) continue
    rows.push({
      saleId: s.id,
      refNumber: s.refNumber,
      buyerName: s.customer ? `${s.customer.firstName} ${s.customer.lastName}` : s.buyerName,
      eftAmount: eftAmount.toFixed(2),
      createdAt: s.createdAt.toISOString(),
    })
  }
  const total = rows.reduce((sum, r) => sum.plus(r.eftAmount), new Decimal(0))
  return { rows, total: total.toFixed(2) }
}
