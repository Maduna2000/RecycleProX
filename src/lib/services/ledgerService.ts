import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import { randomUUID } from 'crypto'
import type { AccountType, AccountNormalBalance, PaymentMethod } from '@prisma/client'

// Only 'cash' is physical drawer money — eft/cheque/card all settle through
// the bank, same grouping the cash-up formula and reports already use
// (e.g. cashUpService.ts's card/cheque sales filters, expenseService.ts's
// cash-only getExpenseTotalsForDate). Centralised here so every posting
// helper below treats the four real PaymentMethod values identically
// instead of each re-deriving its own cash/not-cash split.
function cashOrBankCode(paymentMethod: PaymentMethod): string {
  return paymentMethod === 'cash' ? LEDGER_ACCOUNTS.CASH : LEDGER_ACCOUNTS.BANK
}

// ─── Design ──────────────────────────────────────────────────────────────────
// See docs/plans/2026-08-14-ledger-module-design.md. Every existing
// money-moving service function (purchaseService, saleService,
// expenseService, loanService, businessLoanService, cashUpService) calls
// into this module from *inside its own existing Prisma transaction* — the
// journal entry and the real transaction are atomically inseparable, never
// a separate sync step. This file owns all accounting knowledge (which
// accounts, which side); callers just hand over resolved amounts.

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// ─── Structural Chart of Accounts ──────────────────────────────────────────────
// Fixed, stable codes the posting logic references directly. No example/
// fabricated data — these are the structural skeleton every posting needs,
// not a sample chart of accounts. Category/expense-type sub-accounts (see
// below) are the only accounts derived from real business data.

export const LEDGER_ACCOUNTS = {
  CASH: '1000',
  BANK: '1010',
  LOANS_RECEIVABLE: '1100',
  ACCOUNTS_RECEIVABLE: '1150',
  INVENTORY: '1200',
  VAT_RECEIVABLE: '1400',
  ACCOUNTS_PAYABLE: '2000',
  VAT_PAYABLE: '2100',
  LOANS_PAYABLE: '2200',
  OWNERS_EQUITY: '3000',
  SALES_REVENUE: '4000',
  PURCHASE_DEDUCTIONS: '4100',
  COGS: '5000',
  OPERATING_EXPENSES: '5100',
  CASH_OVER_SHORT: '5200',
  STOCK_VARIANCE: '5300',
} as const

const STRUCTURAL_ACCOUNTS: { code: string; name: string; type: AccountType; normalBalance: AccountNormalBalance }[] = [
  { code: LEDGER_ACCOUNTS.CASH, name: 'Cash on Hand', type: 'asset', normalBalance: 'debit' },
  { code: LEDGER_ACCOUNTS.BANK, name: 'Bank Account', type: 'asset', normalBalance: 'debit' },
  { code: LEDGER_ACCOUNTS.LOANS_RECEIVABLE, name: 'Loans Receivable', type: 'asset', normalBalance: 'debit' },
  { code: LEDGER_ACCOUNTS.ACCOUNTS_RECEIVABLE, name: 'Accounts Receivable', type: 'asset', normalBalance: 'debit' },
  { code: LEDGER_ACCOUNTS.INVENTORY, name: 'Inventory', type: 'asset', normalBalance: 'debit' },
  { code: LEDGER_ACCOUNTS.VAT_RECEIVABLE, name: 'VAT Receivable', type: 'asset', normalBalance: 'debit' },
  { code: LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE, name: 'Accounts Payable', type: 'liability', normalBalance: 'credit' },
  { code: LEDGER_ACCOUNTS.VAT_PAYABLE, name: 'VAT Payable', type: 'liability', normalBalance: 'credit' },
  { code: LEDGER_ACCOUNTS.LOANS_PAYABLE, name: 'Loans Payable', type: 'liability', normalBalance: 'credit' },
  { code: LEDGER_ACCOUNTS.OWNERS_EQUITY, name: "Owner's Equity", type: 'equity', normalBalance: 'credit' },
  { code: LEDGER_ACCOUNTS.SALES_REVENUE, name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit' },
  // Deduction lines (negative-price purchase lines, e.g. a transport charge
  // netted off the payout) never touch Inventory — the amount "saved" versus
  // the goods' real value posts here instead, keeping the entry balanced
  // without distorting the per-product average cost the deduction has
  // nothing to do with.
  { code: LEDGER_ACCOUNTS.PURCHASE_DEDUCTIONS, name: 'Purchase Deductions', type: 'revenue', normalBalance: 'credit' },
  { code: LEDGER_ACCOUNTS.COGS, name: 'Cost of Goods Sold', type: 'expense', normalBalance: 'debit' },
  { code: LEDGER_ACCOUNTS.OPERATING_EXPENSES, name: 'Operating Expenses', type: 'expense', normalBalance: 'debit' },
  { code: LEDGER_ACCOUNTS.CASH_OVER_SHORT, name: 'Cash Over/Short', type: 'expense', normalBalance: 'debit' },
  { code: LEDGER_ACCOUNTS.STOCK_VARIANCE, name: 'Stock Count Variance', type: 'expense', normalBalance: 'debit' },
]

// Per-tenant, per-process cache — STRUCTURAL_ACCOUNTS is a fixed constant
// that never changes at runtime, so once this process has confirmed a
// tenant's structural accounts exist, every subsequent call in the same
// process is a pure no-op rather than 17 redundant upsert round trips.
// Matters little for a single live posting, but adds up fast for a script
// posting hundreds of entries in one run (confirmed contributing to
// transaction-timeout failures in scripts/ledger-historical-backfill.ts) —
// and is always safe to short-circuit since nothing else in this file ever
// deletes a structural Account row.
const structuralAccountsEnsuredForTenant = new Set<string>()

/** Idempotent — safe to call from every posting path; only ever creates what's missing. */
export async function ensureStructuralAccounts(tx: TxClient): Promise<void> {
  const tenantId = requireTenantId()
  if (structuralAccountsEnsuredForTenant.has(tenantId)) return
  for (const a of STRUCTURAL_ACCOUNTS) {
    await tx.account.upsert({
      where: { tenantId_code: { tenantId, code: a.code } },
      update: {},
      create: { tenantId, code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance },
    })
  }
  structuralAccountsEnsuredForTenant.add(tenantId)
}

// Exported for the historical backfill script (scripts/ledger-historical-backfill.ts),
// which needs to post a couple of hand-assembled entries (standalone loan/
// business-loan repayment *reversal* rows — see that script's own comment)
// that don't fit any of this file's higher-level post*/reverse* helpers.
export async function structuralAccountId(tx: TxClient, code: string): Promise<string> {
  const tenantId = requireTenantId()
  const account = await tx.account.findUnique({ where: { tenantId_code: { tenantId, code } } })
  if (!account) throw new Error(`Ledger account "${code}" not found — ensureStructuralAccounts must run before posting`)
  return account.id
}

/**
 * Category sub-account under a parent (Inventory / Sales Revenue / COGS),
 * keyed by the product's category *name* — Product.categoryId is nullable/
 * legacy-incomplete, but Product.category (the name) is always present,
 * matching how PriceListItem.category already snapshots by name.
 * Auto-vivifies on first use; every category that actually shows up in a
 * real transaction gets its account created from that real data.
 */
async function categoryAccountId(tx: TxClient, parentCode: string, categoryName: string): Promise<string> {
  const tenantId = requireTenantId()
  const code = `${parentCode}:CAT:${categoryName}`
  const existing = await tx.account.findUnique({ where: { tenantId_code: { tenantId, code } } })
  if (existing) return existing.id
  const parent = await tx.account.findUniqueOrThrow({ where: { tenantId_code: { tenantId, code: parentCode } } })
  const created = await tx.account.create({
    data: {
      tenantId, code, name: `${parent.name} — ${categoryName}`,
      type: parent.type, normalBalance: parent.normalBalance,
      parentAccountId: parent.id, sourceCategoryName: categoryName,
    },
  })
  return created.id
}

/** Same idea as categoryAccountId, for Operating Expenses sub-accounts per real ExpenseType row. */
async function expenseTypeAccountId(tx: TxClient, expenseTypeId: string): Promise<string> {
  const tenantId = requireTenantId()
  const code = `${LEDGER_ACCOUNTS.OPERATING_EXPENSES}:EXP:${expenseTypeId}`
  const existing = await tx.account.findUnique({ where: { tenantId_code: { tenantId, code } } })
  if (existing) return existing.id
  const [parent, expenseType] = await Promise.all([
    tx.account.findUniqueOrThrow({ where: { tenantId_code: { tenantId, code: LEDGER_ACCOUNTS.OPERATING_EXPENSES } } }),
    tx.expenseType.findUniqueOrThrow({ where: { id: expenseTypeId } }),
  ])
  const created = await tx.account.create({
    data: {
      tenantId, code, name: `${parent.name} — ${expenseType.name}`,
      type: parent.type, normalBalance: parent.normalBalance,
      parentAccountId: parent.id, sourceExpenseTypeId: expenseTypeId,
    },
  })
  return created.id
}

// ─── Core posting primitive ─────────────────────────────────────────────────

export interface JournalLineInput {
  accountId: string
  debit?: Decimal.Value
  credit?: Decimal.Value
}

export interface PostJournalEntryInput {
  entryDate: Date
  description: string
  sourceType: string
  sourceId?: string
  createdByUserId?: string
  lines: JournalLineInput[]
}

/**
 * The only place a JournalEntry ever gets created. Throws if debits don't
 * equal credits — a caller assembling lines incorrectly must fail loudly,
 * never silently post an unbalanced entry. A no-op (nothing written) when
 * every line nets to zero — e.g. a purchase with no VAT and no deduction
 * still calls this the same way; zero-value lines are simply dropped.
 */
export async function postJournalEntry(tx: TxClient, opts: PostJournalEntryInput): Promise<void> {
  const tenantId = requireTenantId()
  const nonZeroLines = opts.lines.filter(
    (l) => !new Decimal(l.debit ?? 0).isZero() || !new Decimal(l.credit ?? 0).isZero()
  )
  if (nonZeroLines.length === 0) return

  const totalDebit = nonZeroLines.reduce((sum, l) => sum.plus(l.debit ?? 0), new Decimal(0))
  const totalCredit = nonZeroLines.reduce((sum, l) => sum.plus(l.credit ?? 0), new Decimal(0))
  if (!totalDebit.equals(totalCredit)) {
    throw new Error(
      `Journal entry does not balance: debits ${totalDebit.toFixed(2)} != credits ${totalCredit.toFixed(2)} (${opts.sourceType}/${opts.sourceId ?? ''})`
    )
  }

  await tx.journalEntry.create({
    data: {
      tenantId,
      entryDate: opts.entryDate,
      description: opts.description,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      createdByUserId: opts.createdByUserId,
      lines: {
        create: nonZeroLines.map((l) => ({
          tenantId,
          accountId: l.accountId,
          debit: new Decimal(l.debit ?? 0),
          credit: new Decimal(l.credit ?? 0),
        })),
      },
    },
    // Prisma's classic middleware (auditMiddleware.ts) only ever sees the
    // top-level call's own result — a nested `lines: { create: [...] } }`
    // write is otherwise invisible to it, so the audit row for this
    // JournalEntry would record only its header (date/description/source)
    // and nothing about which accounts/amounts were actually debited and
    // credited. Including the lines here puts them in what the middleware
    // snapshots as newValues, so the audit trail actually proves what
    // moved, not just that something was posted.
    include: { lines: true },
  })
}

/**
 * Void/reverse for any posted entry — never edits or deletes, always a new
 * equal-and-opposite entry (every debit becomes a credit and vice versa),
 * same principle already used for stock reversals elsewhere in this app.
 * Mirroring the original's actual lines means this is correct regardless
 * of how complex the original entry was (deduction lines, VAT, loan
 * splits, ...) without needing to recompute anything. A no-op if nothing
 * was ever posted for this source (e.g. voiding a pending purchase that
 * was never settled, or a pending expense that was never approved).
 */
export async function reverseJournalEntry(
  tx: TxClient,
  sourceType: string,
  sourceId: string,
  description: string,
  userId?: string
): Promise<void> {
  const tenantId = requireTenantId()
  const original = await tx.journalEntry.findFirst({
    where: { tenantId, sourceType, sourceId },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!original) return

  await tx.journalEntry.create({
    data: {
      tenantId,
      entryDate: new Date(),
      description,
      sourceType: `${sourceType}_reversal`,
      sourceId,
      createdByUserId: userId,
      lines: {
        create: original.lines.map((l) => ({
          tenantId,
          accountId: l.accountId,
          debit: l.credit,
          credit: l.debit,
        })),
      },
    },
  })
}

// ─── Moving weighted-average cost per product ──────────────────────────────
// Each purchase updates the running average; each sale draws down on-hand
// quantity and returns the COGS value at the current average — the
// standard method for a business this size (vs. FIFO lot-tracking, which
// would need far more new bookkeeping for no real benefit here).

export async function recordPurchaseCost(tx: TxClient, productId: string, quantity: Decimal, unitPrice: Decimal): Promise<void> {
  const existing = await tx.productAverageCost.findUnique({ where: { productId } })
  const oldQty = existing ? new Decimal(existing.quantityOnHand.toString()) : new Decimal(0)
  const oldAvg = existing ? new Decimal(existing.averageCost.toString()) : new Decimal(0)
  const newQty = oldQty.plus(quantity)
  const newAvg = newQty.isZero() ? new Decimal(0) : oldQty.times(oldAvg).plus(quantity.times(unitPrice)).div(newQty)
  await tx.productAverageCost.upsert({
    where: { productId },
    update: { quantityOnHand: newQty, averageCost: newAvg },
    create: { tenantId: requireTenantId(), productId, quantityOnHand: newQty, averageCost: newAvg },
  })
}

/** Returns the COGS amount (quantity × current average cost) for a sale's matching entry. */
export async function consumeCostForSale(tx: TxClient, productId: string, quantity: Decimal): Promise<Decimal> {
  const existing = await tx.productAverageCost.findUnique({ where: { productId } })
  const avgCost = existing ? new Decimal(existing.averageCost.toString()) : new Decimal(0)
  const oldQty = existing ? new Decimal(existing.quantityOnHand.toString()) : new Decimal(0)
  // Never goes negative in the tracked figure — a sale exceeding tracked
  // stock (e.g. the average-cost row predates this feature) costs at the
  // last known average rather than fabricating a new one.
  const newQty = Decimal.max(oldQty.minus(quantity), new Decimal(0))
  await tx.productAverageCost.upsert({
    where: { productId },
    update: { quantityOnHand: newQty },
    create: { tenantId: requireTenantId(), productId, quantityOnHand: newQty, averageCost: avgCost },
  })
  return quantity.times(avgCost).toDecimalPlaces(2)
}

/** Void of a purchase — puts the quantity back down; average cost itself is left as-is (see reverseSaleCost). */
export async function reversePurchaseCost(tx: TxClient, productId: string, quantity: Decimal): Promise<void> {
  const existing = await tx.productAverageCost.findUnique({ where: { productId } })
  if (!existing) return
  const newQty = Decimal.max(new Decimal(existing.quantityOnHand.toString()).minus(quantity), new Decimal(0))
  await tx.productAverageCost.update({ where: { productId }, data: { quantityOnHand: newQty } })
}

/** Void of a sale — adds the quantity back at the current average (an approximation, same philosophy as stock reversal elsewhere: not attempting to reconstruct exact historical cost). */
export async function reverseSaleCost(tx: TxClient, productId: string, quantity: Decimal): Promise<void> {
  const existing = await tx.productAverageCost.findUnique({ where: { productId } })
  const avgCost = existing ? new Decimal(existing.averageCost.toString()) : new Decimal(0)
  const oldQty = existing ? new Decimal(existing.quantityOnHand.toString()) : new Decimal(0)
  const newQty = oldQty.plus(quantity)
  await tx.productAverageCost.upsert({
    where: { productId },
    update: { quantityOnHand: newQty },
    create: { tenantId: requireTenantId(), productId, quantityOnHand: newQty, averageCost: avgCost },
  })
}

// ─── Purchase posting ───────────────────────────────────────────────────────

export interface PurchaseLedgerLine {
  productId: string
  productCategory: string
  quantity: Decimal
  unitPrice: Decimal
  lineTotal: Decimal
  vatAmount: Decimal
  isDeduction: boolean
}

/**
 * completed: Dr Inventory–[category] + Dr VAT Receivable, Cr Purchase
 * Deductions (if any deduction lines), Cr Cash/Bank (or Cr Loans Receivable
 * for the loan-deducted portion).
 * pending: same debits, Cr Accounts Payable instead of Cash/Bank.
 * Also updates each product's moving average cost.
 */
export async function postPurchase(
  tx: TxClient,
  opts: {
    purchaseId: string
    refNumber: string
    entryDate: Date
    isPending: boolean
    paymentMethod: PaymentMethod
    loanDeductionAmount: Decimal
    lines: PurchaseLedgerLine[]
    userId?: string
  }
): Promise<void> {
  await ensureStructuralAccounts(tx)

  const lines: JournalLineInput[] = []
  let totalInventory = new Decimal(0)
  let totalVat = new Decimal(0)
  let totalDeduction = new Decimal(0)

  for (const line of opts.lines) {
    if (line.isDeduction) {
      totalDeduction = totalDeduction.plus(line.lineTotal.abs())
      continue
    }
    const accountId = await categoryAccountId(tx, LEDGER_ACCOUNTS.INVENTORY, line.productCategory)
    lines.push({ accountId, debit: line.lineTotal })
    totalInventory = totalInventory.plus(line.lineTotal)
    totalVat = totalVat.plus(line.vatAmount)
    await recordPurchaseCost(tx, line.productId, line.quantity, line.unitPrice)
  }

  if (totalVat.greaterThan(0)) {
    lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.VAT_RECEIVABLE), debit: totalVat })
  }
  if (totalDeduction.greaterThan(0)) {
    lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.PURCHASE_DEDUCTIONS), credit: totalDeduction })
  }

  const totalPayout = totalInventory.plus(totalVat).minus(totalDeduction)
  const loanPortion = Decimal.min(opts.loanDeductionAmount, totalPayout)
  const cashPortion = totalPayout.minus(loanPortion)

  if (loanPortion.greaterThan(0)) {
    lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.LOANS_RECEIVABLE), credit: loanPortion })
  }
  if (cashPortion.greaterThan(0)) {
    const code = opts.isPending
      ? LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE
      : cashOrBankCode(opts.paymentMethod)
    lines.push({ accountId: await structuralAccountId(tx, code), credit: cashPortion })
  }

  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Purchase ${opts.refNumber}`,
    sourceType: 'purchase',
    sourceId: opts.purchaseId,
    createdByUserId: opts.userId,
    lines,
  })
}

// A purchase can accumulate up to three entries over its life — the
// original ('purchase'), a later full settlement ('purchase_settlement'),
// and a settlement correction if a direct-completed purchase's payment was
// reversed ('purchase_settlement_reversal', see reversePurchasePaymentLedger)
// — but the "full payment only" rule means never more than one of each, so
// mirroring every sourceType found is always exactly right, never a
// double-reversal.
const PURCHASE_SOURCE_TYPES = ['purchase', 'purchase_settlement', 'purchase_settlement_reversal']

/** Void of a purchase — reverses every entry ever posted for it and, for non-deduction lines, puts the stock-cost tracking back down. */
export async function reversePurchaseLedger(
  tx: TxClient,
  purchaseId: string,
  refNumber: string,
  lines: { productId: string; quantity: Decimal; isDeduction: boolean }[],
  reason: string,
  userId?: string
): Promise<void> {
  for (const sourceType of PURCHASE_SOURCE_TYPES) {
    await reverseJournalEntry(tx, sourceType, purchaseId, `Void — Purchase ${refNumber}: ${reason}`, userId)
  }
  for (const line of lines) {
    if (line.isDeduction) continue
    await reversePurchaseCost(tx, line.productId, line.quantity)
  }
}

const CASH_LIKE_ACCOUNT_CODES = new Set<string>([LEDGER_ACCOUNTS.CASH, LEDGER_ACCOUNTS.BANK, LEDGER_ACCOUNTS.LOANS_RECEIVABLE])

/**
 * reversePurchasePayment sends a *completed* purchase back to pending
 * without touching stock — goods stay received, only the "this was paid"
 * fact is undone. If the purchase went through a separate settlement
 * (markPurchasePaid/processSplitPayment on a formerly-pending purchase),
 * mirroring that settlement entry is enough (Dr AP was paid off by Cr Cash;
 * reversed, Cash comes back and AP is recreated). If it was instead paid
 * directly at creation, the cash credit lives mixed into the original
 * 'purchase' entry alongside the (still-correct, goods-stay-received)
 * inventory/VAT debits — so a fresh correcting entry is posted instead of
 * touching that entry: it moves the same cash-like amount back out and
 * records it as newly owed, leaving inventory/VAT untouched.
 */
export async function reversePurchasePaymentLedger(
  tx: TxClient,
  purchaseId: string,
  refNumber: string,
  reason: string,
  userId?: string
): Promise<void> {
  const tenantId = requireTenantId()
  const settlement = await tx.journalEntry.findFirst({
    where: { tenantId, sourceType: 'purchase_settlement', sourceId: purchaseId },
    orderBy: { createdAt: 'desc' },
  })
  if (settlement) {
    await reverseJournalEntry(tx, 'purchase_settlement', purchaseId, `Payment reversed — Purchase ${refNumber}: ${reason}`, userId)
    return
  }

  const original = await tx.journalEntry.findFirst({
    where: { tenantId, sourceType: 'purchase', sourceId: purchaseId },
    include: { lines: { include: { account: true } } },
    orderBy: { createdAt: 'desc' },
  })
  if (!original) return

  const cashLines = original.lines.filter(
    (l) => CASH_LIKE_ACCOUNT_CODES.has(l.account.code) && new Decimal(l.credit.toString()).greaterThan(0)
  )
  if (cashLines.length === 0) return

  const total = cashLines.reduce((sum, l) => sum.plus(l.credit.toString()), new Decimal(0))
  await postJournalEntry(tx, {
    entryDate: new Date(),
    description: `Payment reversed — Purchase ${refNumber}: ${reason}`,
    sourceType: 'purchase_settlement_reversal',
    sourceId: purchaseId,
    createdByUserId: userId,
    lines: [
      ...cashLines.map((l) => ({ accountId: l.accountId, debit: l.credit })),
      { accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE), credit: total },
    ],
  })
}

/** Purchase settlement (markPurchasePaid / processSplitPayment on a pending purchase): Dr Accounts Payable, Cr Cash/Bank/Loans Receivable per the amounts actually paid. */
export async function postPurchaseSettlement(
  tx: TxClient,
  opts: {
    purchaseId: string
    refNumber: string
    entryDate: Date
    cashAmount: Decimal
    eftAmount: Decimal
    loanAmount: Decimal
    userId?: string
  }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const lines: JournalLineInput[] = []
  const totalSettled = opts.cashAmount.plus(opts.eftAmount).plus(opts.loanAmount)
  if (totalSettled.lessThanOrEqualTo(0)) return

  lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.ACCOUNTS_PAYABLE), debit: totalSettled })
  if (opts.cashAmount.greaterThan(0)) lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.CASH), credit: opts.cashAmount })
  if (opts.eftAmount.greaterThan(0)) lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.BANK), credit: opts.eftAmount })
  if (opts.loanAmount.greaterThan(0)) lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.LOANS_RECEIVABLE), credit: opts.loanAmount })

  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Settlement — Purchase ${opts.refNumber}`,
    sourceType: 'purchase_settlement',
    sourceId: opts.purchaseId,
    createdByUserId: opts.userId,
    lines,
  })
}

// ─── Sale posting ───────────────────────────────────────────────────────────

export interface SaleLedgerLine {
  productId: string
  productCategory: string
  quantity: Decimal
  lineTotal: Decimal
}

/**
 * completed: Dr Cash/Bank (or Dr Loans Payable for the loan-deducted
 * portion) → Cr Sales Revenue–[category], Cr VAT Payable. Plus the matching
 * cost entry: Dr COGS–[category], Cr Inventory–[category], at each
 * product's current average cost × quantity.
 * pending: Dr Accounts Receivable instead of Cash/Bank.
 * VAT is tracked at the sale header, not per line (unlike purchases), so
 * it's passed as a single total here rather than summed from the lines.
 */
export async function postSale(
  tx: TxClient,
  opts: {
    saleId: string
    refNumber: string
    entryDate: Date
    isPending: boolean
    paymentMethod: PaymentMethod
    vatAmount: Decimal
    businessLoanDeductionAmount: Decimal
    lines: SaleLedgerLine[]
    userId?: string
  }
): Promise<void> {
  await ensureStructuralAccounts(tx)

  const revenueLines: JournalLineInput[] = []
  const cogsLines: JournalLineInput[] = []
  let totalRevenue = new Decimal(0)

  for (const line of opts.lines) {
    const revenueAccountId = await categoryAccountId(tx, LEDGER_ACCOUNTS.SALES_REVENUE, line.productCategory)
    revenueLines.push({ accountId: revenueAccountId, credit: line.lineTotal })
    totalRevenue = totalRevenue.plus(line.lineTotal)

    const cogsAmount = await consumeCostForSale(tx, line.productId, line.quantity)
    if (cogsAmount.greaterThan(0)) {
      const cogsAccountId = await categoryAccountId(tx, LEDGER_ACCOUNTS.COGS, line.productCategory)
      const inventoryAccountId = await categoryAccountId(tx, LEDGER_ACCOUNTS.INVENTORY, line.productCategory)
      cogsLines.push({ accountId: cogsAccountId, debit: cogsAmount })
      cogsLines.push({ accountId: inventoryAccountId, credit: cogsAmount })
    }
  }

  const totalVat = opts.vatAmount
  if (totalVat.greaterThan(0)) {
    revenueLines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.VAT_PAYABLE), credit: totalVat })
  }

  const totalReceipt = totalRevenue.plus(totalVat)
  const loanPortion = Decimal.min(opts.businessLoanDeductionAmount, totalReceipt)
  const cashPortion = totalReceipt.minus(loanPortion)
  const debitLines: JournalLineInput[] = []
  if (loanPortion.greaterThan(0)) {
    debitLines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.LOANS_PAYABLE), debit: loanPortion })
  }
  if (cashPortion.greaterThan(0)) {
    // A completed EFT sale isn't confirmed money yet — Renovo Pro has no
    // way to know an EFT actually landed in the bank until someone checks
    // the statement, so it posts to Accounts Receivable (same as a
    // genuinely-pending sale) rather than straight to Bank. Moves to Bank
    // only once postEftConfirmation is explicitly called. Cash is
    // physically counted at the point of sale, so it's still confirmed
    // immediately.
    const code = opts.isPending || opts.paymentMethod === 'eft'
      ? LEDGER_ACCOUNTS.ACCOUNTS_RECEIVABLE
      : cashOrBankCode(opts.paymentMethod)
    debitLines.push({ accountId: await structuralAccountId(tx, code), debit: cashPortion })
  }

  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Sale ${opts.refNumber}`,
    sourceType: 'sale',
    sourceId: opts.saleId,
    createdByUserId: opts.userId,
    lines: [...debitLines, ...revenueLines, ...cogsLines],
  })
}

// Mirrors PURCHASE_SOURCE_TYPES — see its comment.
const SALE_SOURCE_TYPES = ['sale', 'sale_settlement', 'sale_settlement_reversal']

/** Void of a sale — reverses every entry ever posted for it (revenue + matching COGS/Inventory lines together) and puts the stock-cost tracking back up. */
export async function reverseSaleLedger(
  tx: TxClient,
  saleId: string,
  refNumber: string,
  lines: { productId: string; quantity: Decimal }[],
  reason: string,
  userId?: string
): Promise<void> {
  for (const sourceType of SALE_SOURCE_TYPES) {
    await reverseJournalEntry(tx, sourceType, saleId, `Void — Sale ${refNumber}: ${reason}`, userId)
  }
  for (const line of lines) {
    await reverseSaleCost(tx, line.productId, line.quantity)
  }
}

/** Mirrors reversePurchasePaymentLedger — see its comment for the direct-completed-vs-settled distinction. */
export async function reverseSalePaymentLedger(
  tx: TxClient,
  saleId: string,
  refNumber: string,
  reason: string,
  userId?: string
): Promise<void> {
  const tenantId = requireTenantId()
  const settlement = await tx.journalEntry.findFirst({
    where: { tenantId, sourceType: 'sale_settlement', sourceId: saleId },
    orderBy: { createdAt: 'desc' },
  })
  if (settlement) {
    await reverseJournalEntry(tx, 'sale_settlement', saleId, `Payment reversed — Sale ${refNumber}: ${reason}`, userId)
    return
  }

  const original = await tx.journalEntry.findFirst({
    where: { tenantId, sourceType: 'sale', sourceId: saleId },
    include: { lines: { include: { account: true } } },
    orderBy: { createdAt: 'desc' },
  })
  if (!original) return

  const cashLines = original.lines.filter(
    (l) => CASH_LIKE_ACCOUNT_CODES.has(l.account.code) && new Decimal(l.debit.toString()).greaterThan(0)
  )
  if (cashLines.length === 0) return

  const total = cashLines.reduce((sum, l) => sum.plus(l.debit.toString()), new Decimal(0))
  await postJournalEntry(tx, {
    entryDate: new Date(),
    description: `Payment reversed — Sale ${refNumber}: ${reason}`,
    sourceType: 'sale_settlement_reversal',
    sourceId: saleId,
    createdByUserId: userId,
    lines: [
      ...cashLines.map((l) => ({ accountId: l.accountId, credit: l.debit })),
      { accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.ACCOUNTS_RECEIVABLE), debit: total },
    ],
  })
}

/** Sale settlement (markSalePaid / processSaleSplitPayment on a pending sale): Dr Cash/Bank/Loans Payable, Cr Accounts Receivable per the amounts actually received. */
export async function postSaleSettlement(
  tx: TxClient,
  opts: {
    saleId: string
    refNumber: string
    entryDate: Date
    cashAmount: Decimal
    eftAmount: Decimal
    loanAmount: Decimal
    userId?: string
  }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const lines: JournalLineInput[] = []
  const totalSettled = opts.cashAmount.plus(opts.eftAmount).plus(opts.loanAmount)
  if (totalSettled.lessThanOrEqualTo(0)) return

  if (opts.cashAmount.greaterThan(0)) lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.CASH), debit: opts.cashAmount })
  // The eft leg stays in Accounts Receivable rather than moving to Bank —
  // same "not confirmed until the bank statement is checked" reasoning as
  // postSale. Net effect: crediting AR for totalSettled (clearing the
  // original pending balance) while debiting AR back for just the eft
  // portion leaves exactly that portion still sitting in AR, only the
  // cash/loan portions actually leave the receivable.
  const arAccountId = await structuralAccountId(tx, LEDGER_ACCOUNTS.ACCOUNTS_RECEIVABLE)
  if (opts.eftAmount.greaterThan(0)) lines.push({ accountId: arAccountId, debit: opts.eftAmount })
  if (opts.loanAmount.greaterThan(0)) lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.LOANS_PAYABLE), debit: opts.loanAmount })
  lines.push({ accountId: arAccountId, credit: totalSettled })

  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Settlement — Sale ${opts.refNumber}`,
    sourceType: 'sale_settlement',
    sourceId: opts.saleId,
    createdByUserId: opts.userId,
    lines,
  })
}

// ─── EFT receipt confirmation ──────────────────────────────────────────────
// postSale/postSaleSettlement leave a completed EFT sale sitting in
// Accounts Receivable rather than Bank — Renovo Pro has no way to know an
// EFT actually landed until someone checks the bank statement. This is the
// explicit "yes, it landed" step that moves it from AR to Bank.

export interface SaleEftAmountInput {
  totalAmount: { toString(): string }
  businessLoanDeductionAmount: { toString(): string } | null
  paymentMethod: string
  splitPayments: unknown
}

/** The eft-specific portion of a completed sale — same derivation postSale/postSaleSettlement's own posting already relies on, extracted here so this confirmation flow and the historical backfill agree on what "the eft amount" means for a given sale. */
export function computeSaleEftAmount(sale: SaleEftAmountInput): Decimal {
  if (sale.splitPayments && typeof sale.splitPayments === 'object') {
    const sp = sale.splitPayments as Record<string, string>
    return new Decimal(sp.eft ?? '0')
  }
  if (sale.paymentMethod !== 'eft') return new Decimal(0)
  const loanDeduction = sale.businessLoanDeductionAmount ? new Decimal(sale.businessLoanDeductionAmount.toString()) : new Decimal(0)
  return new Decimal(sale.totalAmount.toString()).minus(loanDeduction)
}

/** Dr Bank, Cr Accounts Receivable. */
export async function postEftConfirmation(
  tx: TxClient,
  opts: { saleId: string; refNumber: string; entryDate: Date; amount: Decimal; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const bankAccountId = await structuralAccountId(tx, LEDGER_ACCOUNTS.BANK)
  const arAccountId = await structuralAccountId(tx, LEDGER_ACCOUNTS.ACCOUNTS_RECEIVABLE)
  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `EFT confirmed received — Sale ${opts.refNumber}`,
    sourceType: 'eft_confirmation',
    sourceId: opts.saleId,
    createdByUserId: opts.userId,
    lines: [
      { accountId: bankAccountId, debit: opts.amount },
      { accountId: arAccountId, credit: opts.amount },
    ],
  })
}

export class EftAlreadyConfirmedError extends Error {
  constructor(refNumber: string) { super(`EFT for sale "${refNumber}" has already been confirmed received`); this.name = 'EftAlreadyConfirmedError' }
}

export class NoEftAmountError extends Error {
  constructor(refNumber: string) { super(`Sale "${refNumber}" has no EFT-paid amount to confirm`); this.name = 'NoEftAmountError' }
}

/** Top-level, self-transacting — the admin action a "Confirm Received" button on the /ledger dashboard calls, not something wired into another service's own transaction. */
export async function confirmEftReceived(saleId: string, userId?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } })
    const amount = computeSaleEftAmount(sale)
    if (amount.lessThanOrEqualTo(0)) throw new NoEftAmountError(sale.refNumber)

    const alreadyConfirmed = await tx.journalEntry.findFirst({
      where: { sourceType: 'eft_confirmation', sourceId: saleId },
    })
    if (alreadyConfirmed) throw new EftAlreadyConfirmedError(sale.refNumber)

    await postEftConfirmation(tx, {
      saleId, refNumber: sale.refNumber, entryDate: new Date(), amount, userId,
    })
  })
}

// ─── Expense posting ────────────────────────────────────────────────────────

/** Dr Operating Expense–[type], Cr Cash/Bank. Only called at the point an expense is actually approved — no cash has moved for a merely-pending expense. */
export async function postExpense(
  tx: TxClient,
  opts: {
    expenseId: string
    refNumber: string
    entryDate: Date
    expenseTypeId: string
    amount: Decimal
    paymentMethod: PaymentMethod
    userId?: string
  }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const expenseAccountId = await expenseTypeAccountId(tx, opts.expenseTypeId)
  const cashCode = cashOrBankCode(opts.paymentMethod)
  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Expense ${opts.refNumber}`,
    sourceType: 'expense',
    sourceId: opts.expenseId,
    createdByUserId: opts.userId,
    lines: [
      { accountId: expenseAccountId, debit: opts.amount },
      { accountId: await structuralAccountId(tx, cashCode), credit: opts.amount },
    ],
  })
}

export async function reverseExpenseLedger(tx: TxClient, expenseId: string, refNumber: string, reason: string, userId?: string): Promise<void> {
  await reverseJournalEntry(tx, 'expense', expenseId, `Void — Expense ${refNumber}: ${reason}`, userId)
}

// ─── Loan (yard advances to a customer) ────────────────────────────────────

/** Dr Loans Receivable, Cr Cash/Bank. Repayment nets through a purchase's credit split (postPurchase) — no separate entry needed there. */
export async function postLoanAdvance(
  tx: TxClient,
  opts: { loanId: string; refNumber: string; entryDate: Date; principal: Decimal; paymentMethod: PaymentMethod; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const cashCode = cashOrBankCode(opts.paymentMethod)
  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Loan advance ${opts.refNumber}`,
    sourceType: 'loan_advance',
    sourceId: opts.loanId,
    createdByUserId: opts.userId,
    lines: [
      { accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.LOANS_RECEIVABLE), debit: opts.principal },
      { accountId: await structuralAccountId(tx, cashCode), credit: opts.principal },
    ],
  })
}

export async function reverseLoanAdvanceLedger(tx: TxClient, loanId: string, refNumber: string, reason: string, userId?: string): Promise<void> {
  await reverseJournalEntry(tx, 'loan_advance', loanId, `Void — Loan ${refNumber}: ${reason}`, userId)
}

/**
 * A standalone repayment (createRepayment / createManualRepayment) — cash
 * the customer hands back directly, not netted off a purchase payout. Dr
 * Cash/Bank, Cr Loans Receivable. Repayments applied via applyRepaymentTx
 * (a purchase's loan deduction) are deliberately NOT posted here — that
 * cash movement is already captured inside postPurchase/postPurchaseSettlement's
 * own Loans Receivable line, so posting it again here would double-count it.
 */
export async function postLoanRepayment(
  tx: TxClient,
  opts: { repaymentId: string; refNumber: string; entryDate: Date; amount: Decimal; paymentMethod: PaymentMethod; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const cashCode = cashOrBankCode(opts.paymentMethod)
  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Loan repayment ${opts.refNumber}`,
    sourceType: 'loan_repayment',
    sourceId: opts.repaymentId,
    createdByUserId: opts.userId,
    lines: [
      { accountId: await structuralAccountId(tx, cashCode), debit: opts.amount },
      { accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.LOANS_RECEIVABLE), credit: opts.amount },
    ],
  })
}

export async function reverseLoanRepaymentLedger(tx: TxClient, repaymentId: string, refNumber: string, reason: string, userId?: string): Promise<void> {
  await reverseJournalEntry(tx, 'loan_repayment', repaymentId, `Reversed — Repayment ${refNumber}: ${reason}`, userId)
}

// ─── Business Loan (a dealer lends to the yard) ────────────────────────────

/** Dr Cash/Bank, Cr Loans Payable. Repayment nets through a sale's debit split (postSale) — no separate entry needed there. */
export async function postBusinessLoanReceived(
  tx: TxClient,
  opts: { businessLoanId: string; refNumber: string; entryDate: Date; principal: Decimal; paymentMethod: PaymentMethod; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const cashCode = cashOrBankCode(opts.paymentMethod)
  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Business loan received ${opts.refNumber}`,
    sourceType: 'business_loan',
    sourceId: opts.businessLoanId,
    createdByUserId: opts.userId,
    lines: [
      { accountId: await structuralAccountId(tx, cashCode), debit: opts.principal },
      { accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.LOANS_PAYABLE), credit: opts.principal },
    ],
  })
}

export async function reverseBusinessLoanLedger(tx: TxClient, businessLoanId: string, refNumber: string, reason: string, userId?: string): Promise<void> {
  await reverseJournalEntry(tx, 'business_loan', businessLoanId, `Void — Business loan ${refNumber}: ${reason}`, userId)
}

/**
 * A standalone business-loan repayment (recordBusinessLoanRepayment) — cash
 * paid back to the dealer directly, not netted off a sale's proceeds. Dr
 * Loans Payable, Cr Cash/Bank. Mirrors postLoanRepayment's reasoning:
 * repayments applied via applyBusinessLoanRepaymentTx (a sale's deduction)
 * are already captured inside postSale/postSaleSettlement's own Loans
 * Payable line and must not be posted again here.
 */
export async function postBusinessLoanRepayment(
  tx: TxClient,
  opts: { repaymentId: string; refNumber: string; entryDate: Date; amount: Decimal; paymentMethod: PaymentMethod; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const cashCode = cashOrBankCode(opts.paymentMethod)
  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Business loan repayment ${opts.refNumber}`,
    sourceType: 'business_loan_repayment',
    sourceId: opts.repaymentId,
    createdByUserId: opts.userId,
    lines: [
      { accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.LOANS_PAYABLE), debit: opts.amount },
      { accountId: await structuralAccountId(tx, cashCode), credit: opts.amount },
    ],
  })
}

export async function reverseBusinessLoanRepaymentLedger(tx: TxClient, repaymentId: string, refNumber: string, reason: string, userId?: string): Promise<void> {
  await reverseJournalEntry(tx, 'business_loan_repayment', repaymentId, `Reversed — Repayment ${refNumber}: ${reason}`, userId)
}

// ─── Cash-up variance ───────────────────────────────────────────────────────

/**
 * Posted on cash-up approval when declared cash differs from the system-
 * expected figure — keeps the Cash account matched to physical reality
 * rather than silently drifting. Short (declared < expected): Dr Cash
 * Over/Short, Cr Cash. Over (declared > expected): Dr Cash, Cr Cash
 * Over/Short. A zero variance posts nothing (postJournalEntry no-ops).
 */
export async function postCashUpVariance(
  tx: TxClient,
  opts: { cashUpId: string; sessionDate: Date; variance: Decimal; userId?: string }
): Promise<void> {
  if (opts.variance.isZero()) return
  await ensureStructuralAccounts(tx)
  const cashAccountId = await structuralAccountId(tx, LEDGER_ACCOUNTS.CASH)
  const varianceAccountId = await structuralAccountId(tx, LEDGER_ACCOUNTS.CASH_OVER_SHORT)
  const amount = opts.variance.abs()
  const short = opts.variance.isNegative()
  await postJournalEntry(tx, {
    entryDate: opts.sessionDate,
    description: `Cash-up variance ${short ? '(short)' : '(over)'}`,
    sourceType: 'cashup_variance',
    sourceId: opts.cashUpId,
    createdByUserId: opts.userId,
    lines: short
      ? [{ accountId: varianceAccountId, debit: amount }, { accountId: cashAccountId, credit: amount }]
      : [{ accountId: cashAccountId, debit: amount }, { accountId: varianceAccountId, credit: amount }],
  })
}

// ─── Float movement (top-up / withdrawal) ──────────────────────────────────

/**
 * Cash injected into (or taken out of) the till from OUTSIDE Renovo Pro's
 * own tracked money flow — a manager/admin physically adding cash (e.g.
 * from a bank withdrawal or the owner's own funds) or removing it. Renovo
 * Pro has no record of where a top-up's cash came from or a withdrawal's
 * cash goes, so the standard, correct treatment is an equity movement:
 * top_up: Dr Cash, Cr Owner's Equity. withdrawal/adjustment (both reduce
 * the float, same as each other from the ledger's perspective): Dr Owner's
 * Equity, Cr Cash. 'opening' is excluded — a fresh CashFloat's very first
 * opening amount is carried from the previous day's real closing balance
 * (see addFloatMovement), not new money from outside the tracked system,
 * so it isn't a separate cash-affecting event.
 */
export async function postFloatMovement(
  tx: TxClient,
  opts: { floatMovementId: string; entryDate: Date; movementType: 'top_up' | 'withdrawal' | 'adjustment'; amount: Decimal; note?: string; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const cashAccountId = await structuralAccountId(tx, LEDGER_ACCOUNTS.CASH)
  const equityAccountId = await structuralAccountId(tx, LEDGER_ACCOUNTS.OWNERS_EQUITY)
  const isTopUp = opts.movementType === 'top_up'
  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Float ${opts.movementType}${opts.note ? ` — ${opts.note}` : ''}`,
    sourceType: 'float_movement',
    sourceId: opts.floatMovementId,
    createdByUserId: opts.userId,
    lines: isTopUp
      ? [{ accountId: cashAccountId, debit: opts.amount }, { accountId: equityAccountId, credit: opts.amount }]
      : [{ accountId: equityAccountId, debit: opts.amount }, { accountId: cashAccountId, credit: opts.amount }],
  })
}

export async function reverseFloatMovementLedger(tx: TxClient, floatMovementId: string, reason: string, userId?: string): Promise<void> {
  await reverseJournalEntry(tx, 'float_movement', floatMovementId, `Reversed — Float movement: ${reason}`, userId)
}

// ─── Stocktake adjustment ───────────────────────────────────────────────────

export interface StocktakeAdjustmentLine {
  productId: string
  productCategory: string
  // Signed: positive = physical count found MORE than the system expected
  // (surplus), negative = found LESS (shortage/shrinkage).
  variance: Decimal
}

/**
 * A physical count correcting the system's stock record is a real change in
 * Inventory's value, valued at each product's current average cost (there's
 * no transaction price for a miscount — it's not a purchase or a sale, just
 * a correction) — the average cost itself is left untouched, only quantity
 * moves, via the same reversePurchaseCost/reverseSaleCost helpers void
 * handling already uses. Surplus: Dr Inventory–[category], Cr Stock Count
 * Variance. Shortage: Dr Stock Count Variance, Cr Inventory–[category].
 * Same "single account absorbs both directions" shape as
 * postCashUpVariance's Cash Over/Short.
 */
/**
 * Shared core behind postStocktakeAdjustment and postManualStockAdjustmentLedger — both post
 * an inventory quantity correction the same way (valued at each product's current average cost,
 * average cost itself untouched, only quantity moves), differing only in what they're labeled as
 * and what source record they attach to.
 */
async function postInventoryQuantityAdjustment(
  tx: TxClient,
  opts: { sourceType: string; sourceId: string; description: string; entryDate: Date; lines: StocktakeAdjustmentLine[]; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)

  const inventoryLines: JournalLineInput[] = []
  let totalSurplus = new Decimal(0)
  let totalShortage = new Decimal(0)

  for (const line of opts.lines) {
    if (line.variance.isZero()) continue
    const existing = await tx.productAverageCost.findUnique({ where: { productId: line.productId } })
    const avgCost = existing ? new Decimal(existing.averageCost.toString()) : new Decimal(0)
    const value = line.variance.abs().times(avgCost).toDecimalPlaces(2)
    const inventoryAccountId = await categoryAccountId(tx, LEDGER_ACCOUNTS.INVENTORY, line.productCategory)

    if (line.variance.isPositive()) {
      await reverseSaleCost(tx, line.productId, line.variance)
      if (value.greaterThan(0)) {
        inventoryLines.push({ accountId: inventoryAccountId, debit: value })
        totalSurplus = totalSurplus.plus(value)
      }
    } else {
      await reversePurchaseCost(tx, line.productId, line.variance.abs())
      if (value.greaterThan(0)) {
        inventoryLines.push({ accountId: inventoryAccountId, credit: value })
        totalShortage = totalShortage.plus(value)
      }
    }
  }

  const varianceAccountId = await structuralAccountId(tx, LEDGER_ACCOUNTS.STOCK_VARIANCE)
  const net = totalShortage.minus(totalSurplus)
  if (net.greaterThan(0)) inventoryLines.push({ accountId: varianceAccountId, debit: net })
  else if (net.lessThan(0)) inventoryLines.push({ accountId: varianceAccountId, credit: net.abs() })

  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: opts.description,
    sourceType: opts.sourceType,
    sourceId: opts.sourceId,
    createdByUserId: opts.userId,
    lines: inventoryLines,
  })
}

export async function postStocktakeAdjustment(
  tx: TxClient,
  opts: { stocktakeId: string; refNumber: string; entryDate: Date; lines: StocktakeAdjustmentLine[]; userId?: string }
): Promise<void> {
  await postInventoryQuantityAdjustment(tx, {
    sourceType: 'stocktake_adjustment',
    sourceId: opts.stocktakeId,
    description: `Stocktake adjustment ${opts.refNumber}`,
    entryDate: opts.entryDate,
    lines: opts.lines,
    userId: opts.userId,
  })
}

/**
 * Posts a single manual stock adjustment (from the Stock module's "Adjust Stock" action) to the
 * ledger the same way a stocktake count adjustment is posted — same valuation, same
 * Inventory/Stock Count Variance accounts. Keeps ProductAverageCost.quantityOnHand (the figure
 * getStockValueByCategory and consumeCostForSale both rely on) in sync with the StockMovement
 * this accompanies, closing the one gap where quantity could silently drift from the movement log.
 */
export async function postManualStockAdjustmentLedger(
  tx: TxClient,
  opts: { movementId: string; productId: string; productCategory: string; variance: Decimal; entryDate: Date; refNumber?: string; userId?: string }
): Promise<void> {
  await postInventoryQuantityAdjustment(tx, {
    sourceType: 'manual_stock_adjustment',
    sourceId: opts.movementId,
    description: `Manual stock adjustment${opts.refNumber ? ' ' + opts.refNumber : ''}`,
    entryDate: opts.entryDate,
    lines: [{ productId: opts.productId, productCategory: opts.productCategory, variance: opts.variance }],
    userId: opts.userId,
  })
}

export async function reverseStocktakeAdjustmentLedger(
  tx: TxClient,
  stocktakeId: string,
  refNumber: string,
  lines: { productId: string; variance: Decimal }[],
  reason: string,
  userId?: string
): Promise<void> {
  await reverseJournalEntry(tx, 'stocktake_adjustment', stocktakeId, `Void — Stocktake ${refNumber}: ${reason}`, userId)
  // Mirror the quantity impact too — a surplus's quantity gain (added via
  // reverseSaleCost) is taken back out via reversePurchaseCost, and vice
  // versa for a shortage, same "opposite of whichever helper posting used"
  // pairing postStocktakeAdjustment itself relies on.
  for (const line of lines) {
    if (line.variance.isZero()) continue
    if (line.variance.isPositive()) await reversePurchaseCost(tx, line.productId, line.variance)
    else await reverseSaleCost(tx, line.productId, line.variance.abs())
  }
}

// ─── Opening balance (historical backfill, run once) ───────────────────────

export interface OpeningBalanceLine {
  accountCode: string
  debit?: Decimal.Value
  credit?: Decimal.Value
}

/** The one entry point for supplying real, manually-entered opening figures before the historical replay runs. */
export async function postOpeningBalance(tx: TxClient, opts: { entryDate: Date; lines: OpeningBalanceLine[]; userId?: string }): Promise<void> {
  await ensureStructuralAccounts(tx)
  const resolved: JournalLineInput[] = []
  for (const l of opts.lines) {
    resolved.push({ accountId: await structuralAccountId(tx, l.accountCode), debit: l.debit, credit: l.credit })
  }
  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: 'Opening balance',
    sourceType: 'opening_balance',
    createdByUserId: opts.userId,
    lines: resolved,
  })
  logger.info({ entryDate: opts.entryDate, userId: opts.userId }, 'ledger.openingBalance.posted')
}

export class OpeningBalanceAlreadyPostedError extends Error {
  constructor() { super('An opening balance has already been posted for this business — it cannot be entered twice.'); this.name = 'OpeningBalanceAlreadyPostedError' }
}

/**
 * Self-transacting, admin-facing counterpart to postOpeningBalance — the one
 * entry point the /ledger "Set Opening Balances" screen calls. Unlike the
 * historical-backfill script (which is a developer-run, one-off tool),
 * this is how a business owner actually gets real starting figures (cash on
 * hand, bank, inventory value, outstanding loans/debts) into the books
 * themselves, without which every account silently understates reality by
 * whatever existed before the ledger went live. Refuses a second opening
 * entry outright — correcting an already-posted opening balance is a real
 * accounting adjustment (its own dated journal entry), not a re-do of this
 * one-time step.
 */
export async function postOpeningBalanceOnce(opts: { entryDate: Date; lines: OpeningBalanceLine[]; userId?: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.journalEntry.findFirst({ where: { sourceType: 'opening_balance' } })
    if (existing) throw new OpeningBalanceAlreadyPostedError()
    await postOpeningBalance(tx, opts)
  })
}

/** Whether an opening balance has ever been posted — the /ledger UI uses this to show current state and disable re-entry. */
export async function hasOpeningBalance(): Promise<boolean> {
  const existing = await prisma.journalEntry.findFirst({ where: { sourceType: 'opening_balance' } })
  return !!existing
}

// ─── Manual / adjusting journal entry ──────────────────────────────────────
// Free-form entries (accruals, bank fees, depreciation, write-offs,
// corrections) that don't map to any existing purchase/sale/expense/etc.
// event type. The one gap opening-balance's own "already posted" screen
// points admins at ("post a dated adjusting journal entry instead") without
// this existing yet.

export interface ManualJournalLineInput {
  accountId: string
  debit?: Decimal.Value
  credit?: Decimal.Value
}

/**
 * Self-transacting, admin-facing. Generates its own synthetic sourceId (a
 * fresh UUID) up front rather than leaving it undefined the way
 * postOpeningBalance does — reverseJournalEntry looks entries up by
 * (sourceType, sourceId), and multiple manual entries all sharing a null
 * sourceId would be indistinguishable to its findFirst. This gives each
 * manual entry the same addressability every domain entity's own id already
 * gives its journal entries, so it can be looked up and reversed
 * individually later via reverseManualJournalEntry.
 */
export async function postManualJournalEntry(opts: {
  entryDate: Date
  description: string
  lines: ManualJournalLineInput[]
  userId?: string
}): Promise<{ sourceId: string }> {
  const sourceId = randomUUID()
  await prisma.$transaction(async (tx) => {
    await ensureStructuralAccounts(tx)
    await postJournalEntry(tx, {
      entryDate: opts.entryDate,
      description: opts.description,
      sourceType: 'manual_adjustment',
      sourceId,
      createdByUserId: opts.userId,
      lines: opts.lines,
    })
  })
  logger.info({ sourceId, entryDate: opts.entryDate, userId: opts.userId }, 'ledger.manualJournalEntry.posted')
  return { sourceId }
}

export class ManualJournalEntryNotFoundError extends Error {
  constructor(sourceId: string) { super(`No manual journal entry found for id "${sourceId}"`); this.name = 'ManualJournalEntryNotFoundError' }
}

export class ManualJournalEntryAlreadyReversedError extends Error {
  constructor(sourceId: string) { super(`Manual journal entry "${sourceId}" has already been reversed`); this.name = 'ManualJournalEntryAlreadyReversedError' }
}

/**
 * Self-transacting, admin-facing reversal — mirrors confirmEftReceived's
 * shape. Guards against double-reversal since reverseJournalEntry itself
 * isn't idempotent for repeat calls against the same sourceId (it would
 * just post a second offsetting entry).
 */
export async function reverseManualJournalEntry(sourceId: string, reason: string, userId?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const tenantId = requireTenantId()
    const original = await tx.journalEntry.findFirst({ where: { tenantId, sourceType: 'manual_adjustment', sourceId } })
    if (!original) throw new ManualJournalEntryNotFoundError(sourceId)
    const alreadyReversed = await tx.journalEntry.findFirst({ where: { tenantId, sourceType: 'manual_adjustment_reversal', sourceId } })
    if (alreadyReversed) throw new ManualJournalEntryAlreadyReversedError(sourceId)
    await reverseJournalEntry(tx, 'manual_adjustment', sourceId, `Reversed — Manual entry: ${reason}`, userId)
  })
  logger.info({ sourceId, userId }, 'ledger.manualJournalEntry.reversed')
}
