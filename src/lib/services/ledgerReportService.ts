import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { sastDateLabelToUTCDate, getDayBoundsSAST, getRangeBoundsSAST } from '@/lib/utils/dayBounds'
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
