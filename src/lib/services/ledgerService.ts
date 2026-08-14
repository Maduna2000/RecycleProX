import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import type { AccountType, AccountNormalBalance } from '@prisma/client'

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
]

/** Idempotent — safe to call from every posting path; only ever creates what's missing. */
export async function ensureStructuralAccounts(tx: TxClient): Promise<void> {
  const tenantId = requireTenantId()
  for (const a of STRUCTURAL_ACCOUNTS) {
    await tx.account.upsert({
      where: { tenantId_code: { tenantId, code: a.code } },
      update: {},
      create: { tenantId, code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance },
    })
  }
}

async function structuralAccountId(tx: TxClient, code: string): Promise<string> {
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
    paymentMethod: 'cash' | 'eft'
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
      : (opts.paymentMethod === 'eft' ? LEDGER_ACCOUNTS.BANK : LEDGER_ACCOUNTS.CASH)
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
    paymentMethod: 'cash' | 'eft'
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
    const code = opts.isPending
      ? LEDGER_ACCOUNTS.ACCOUNTS_RECEIVABLE
      : (opts.paymentMethod === 'eft' ? LEDGER_ACCOUNTS.BANK : LEDGER_ACCOUNTS.CASH)
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
  if (opts.eftAmount.greaterThan(0)) lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.BANK), debit: opts.eftAmount })
  if (opts.loanAmount.greaterThan(0)) lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.LOANS_PAYABLE), debit: opts.loanAmount })
  lines.push({ accountId: await structuralAccountId(tx, LEDGER_ACCOUNTS.ACCOUNTS_RECEIVABLE), credit: totalSettled })

  await postJournalEntry(tx, {
    entryDate: opts.entryDate,
    description: `Settlement — Sale ${opts.refNumber}`,
    sourceType: 'sale_settlement',
    sourceId: opts.saleId,
    createdByUserId: opts.userId,
    lines,
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
    paymentMethod: 'cash' | 'eft'
    userId?: string
  }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const expenseAccountId = await expenseTypeAccountId(tx, opts.expenseTypeId)
  const cashCode = opts.paymentMethod === 'eft' ? LEDGER_ACCOUNTS.BANK : LEDGER_ACCOUNTS.CASH
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
  opts: { loanId: string; refNumber: string; entryDate: Date; principal: Decimal; paymentMethod: 'cash' | 'eft'; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const cashCode = opts.paymentMethod === 'eft' ? LEDGER_ACCOUNTS.BANK : LEDGER_ACCOUNTS.CASH
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
  opts: { repaymentId: string; refNumber: string; entryDate: Date; amount: Decimal; paymentMethod: 'cash' | 'eft'; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const cashCode = opts.paymentMethod === 'eft' ? LEDGER_ACCOUNTS.BANK : LEDGER_ACCOUNTS.CASH
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
  opts: { businessLoanId: string; refNumber: string; entryDate: Date; principal: Decimal; paymentMethod: 'cash' | 'eft'; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const cashCode = opts.paymentMethod === 'eft' ? LEDGER_ACCOUNTS.BANK : LEDGER_ACCOUNTS.CASH
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
  opts: { repaymentId: string; refNumber: string; entryDate: Date; amount: Decimal; paymentMethod: 'cash' | 'eft'; userId?: string }
): Promise<void> {
  await ensureStructuralAccounts(tx)
  const cashCode = opts.paymentMethod === 'eft' ? LEDGER_ACCOUNTS.BANK : LEDGER_ACCOUNTS.CASH
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
