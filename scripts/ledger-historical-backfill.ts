/**
 * PRODUCTION — one-time historical backfill of the Ledger module (Phase 3).
 * See docs/plans/2026-08-14-ledger-module-design.md section 7.
 *
 * What this does:
 * 1. Optionally posts a single, real, owner-supplied opening-balance entry
 *    (see --opening-balance-file below) — covering the business as it stood
 *    before Renovo Pro was adopted. Never fabricated; skipped entirely if no
 *    file is given.
 * 2. Replays every non-voided historical Purchase and Sale, IN STRICT
 *    CHRONOLOGICAL ORDER, through the exact same posting logic
 *    (postPurchase/postSale from ledgerService.ts) live-forward postings
 *    already use — required for correct moving-average COGS, since each
 *    sale's cost depends on the running average built up from every
 *    purchase before it. Every purchase/sale is modeled uniformly as
 *    "received/sold on credit, then settled" (Accounts Payable/Receivable
 *    first, a settlement entry immediately after if it's currently fully
 *    paid) regardless of whether it was actually paid immediately or
 *    settled later — the two produce identical final balances, and this
 *    sidesteps needing to reconstruct which of a purchase's two possible
 *    payment-recording code paths ran historically. A still-pending
 *    purchase/sale simply has no settlement step, leaving its real
 *    outstanding AP/AR balance in place.
 * 3. Replays Expenses (approved only), Loan/BusinessLoan advances, and
 *    STANDALONE repayments (not netted through a purchase/sale — those are
 *    already captured inside step 2's settlement entries, see the comment
 *    on postLoanRepayment). These don't touch inventory costing, so unlike
 *    step 2 they don't need to interleave with anything — each posts
 *    independently.
 * 4. Replays approved CashUp variances and completed Stocktake adjustments
 *    (also order-independent — a stocktake corrects quantityOnHand only,
 *    never averageCost, so it doesn't feed into any dollar figure that
 *    depends on purchase/sale ordering).
 *
 * Voided/reversed historical transactions are excluded entirely — net-zero
 * effect either way, simpler and equally correct for final balances (same
 * principle the design doc applies throughout).
 *
 * Idempotent and resumable: every posting is guarded by "does a JournalEntry
 * for this exact source already exist?" before writing, and each event posts
 * in its OWN transaction (not one giant transaction for the whole run) — an
 * interrupted run can simply be re-run and picks up where it left off,
 * rather than needing a full restart or risking one multi-hour transaction
 * timing out against Neon.
 *
 * Opening balance file format (JSON):
 *   {
 *     "date": "2024-01-01",
 *     "lines": [
 *       { "accountCode": "1000", "debit":  "5000.00" },
 *       { "accountCode": "1200", "debit":  "120000.00" },
 *       { "accountCode": "2000", "credit": "18000.00" },
 *       { "accountCode": "3000", "credit": "107000.00" }
 *     ]
 *   }
 * Must balance (sum debit === sum credit) — postOpeningBalance enforces this
 * the same way every other posting is enforced. Account codes: see
 * LEDGER_ACCOUNTS in src/lib/services/ledgerService.ts.
 *
 * Run:
 *   npx tsx scripts/ledger-historical-backfill.ts                                        (dry run — default, no writes)
 *   npx tsx scripts/ledger-historical-backfill.ts --opening-balance-file=./opening.json   (dry run, opening balance included in the plan)
 *   npx tsx scripts/ledger-historical-backfill.ts --execute                                (actually writes, in per-event transactions)
 *   npx tsx scripts/ledger-historical-backfill.ts --execute --opening-balance-file=./opening.json
 */
import 'dotenv/config'
import Decimal from 'decimal.js'
import { readFileSync, existsSync } from 'fs'
import { prisma } from '@/lib/db/prisma'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { withTenantId } from '@/lib/db/tenantContext'
import {
  ensureStructuralAccounts, postOpeningBalance,
  postPurchase, postPurchaseSettlement,
  postSale, postSaleSettlement,
  postExpense,
  postLoanAdvance, postLoanRepayment,
  postBusinessLoanReceived, postBusinessLoanRepayment,
  postCashUpVariance, postStocktakeAdjustment,
  postJournalEntry, structuralAccountId,
  LEDGER_ACCOUNTS,
} from '@/lib/services/ledgerService'

const EXECUTE = process.argv.includes('--execute')
const openingBalanceFile = process.argv.find((a) => a.startsWith('--opening-balance-file='))?.split('=')[1]

interface OpeningBalanceConfig {
  date: string
  lines: { accountCode: string; debit?: string; credit?: string }[]
}

function loadOpeningBalance(): OpeningBalanceConfig | null {
  if (!openingBalanceFile) return null
  if (!existsSync(openingBalanceFile)) throw new Error(`Opening balance file not found: ${openingBalanceFile}`)
  return JSON.parse(readFileSync(openingBalanceFile, 'utf-8'))
}

/** Derives the actual cash/eft/loan split a now-settled Purchase/Sale was paid with, from its final persisted state. */
function splitFromFinalState(opts: {
  totalAmount: Decimal
  loanDeduction: Decimal
  paymentMethod: 'cash' | 'eft'
  splitPayments: unknown
  loanKey: 'loan' | 'businessLoan'
}): { cash: Decimal; eft: Decimal; loan: Decimal } {
  if (opts.splitPayments && typeof opts.splitPayments === 'object') {
    const sp = opts.splitPayments as Record<string, string>
    return {
      cash: new Decimal(sp.cash ?? '0'),
      eft: new Decimal(sp.eft ?? '0'),
      loan: new Decimal(sp[opts.loanKey] ?? '0'),
    }
  }
  const remaining = opts.totalAmount.minus(opts.loanDeduction)
  return {
    cash: opts.paymentMethod === 'cash' ? remaining : new Decimal(0),
    eft: opts.paymentMethod === 'eft' ? remaining : new Decimal(0),
    loan: opts.loanDeduction,
  }
}

async function alreadyPosted(sourceType: string, sourceId: string): Promise<boolean> {
  const existing = await prisma.journalEntry.findFirst({ where: { sourceType, sourceId } })
  return !!existing
}

/**
 * A negative-amount LoanRepayment/BusinessLoanRepayment row is itself a
 * *reversal* of some earlier repayment (see loanService.ts's reverseRepayment)
 * — there's no FK back to which one, so rather than trying to mirror a
 * specific prior entry (the live reverseLoanRepaymentLedger's job), this
 * posts directly what the row represents: money left the drawer again and
 * the loan balance went back up. Correct regardless of which original
 * repayment it was reversing.
 */
async function postStandaloneRepaymentReversal(opts: {
  sourceType: 'loan_repayment' | 'business_loan_repayment'
  sourceId: string
  refNumber: string
  entryDate: Date
  amount: Decimal
  paymentMethod: 'cash' | 'eft'
  loanAccountCode: string
  loanIsDebitNormal: boolean
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await ensureStructuralAccounts(tx)
    const cashCode = opts.paymentMethod === 'eft' ? LEDGER_ACCOUNTS.BANK : LEDGER_ACCOUNTS.CASH
    const cashAccountId = await structuralAccountId(tx, cashCode)
    const loanAccountId = await structuralAccountId(tx, opts.loanAccountCode)
    await postJournalEntry(tx, {
      entryDate: opts.entryDate,
      description: `Repayment reversal ${opts.refNumber}`,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      lines: opts.loanIsDebitNormal
        // Loans Receivable (asset, debit-normal) — a reversal restores it: Dr Loans Receivable, Cr Cash.
        ? [{ accountId: loanAccountId, debit: opts.amount }, { accountId: cashAccountId, credit: opts.amount }]
        // Loans Payable (liability, credit-normal) — a reversal restores it: Dr Cash, Cr Loans Payable.
        : [{ accountId: cashAccountId, debit: opts.amount }, { accountId: loanAccountId, credit: opts.amount }],
    })
  })
}

async function main() {
  const tenant = await registryPrisma.tenant.findUnique({ where: { schemaName: 'public' } })
  if (!tenant) throw new Error('No Tenant row found for schemaName "public" (Golden Key)')
  const openingBalance = loadOpeningBalance()

  console.log(`Tenant: ${tenant.id}`)
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (will write, resumable)' : 'DRY RUN (no writes)'}`)
  console.log(
    openingBalance
      ? `Opening balance: ${openingBalanceFile} (${openingBalance.lines.length} lines, dated ${openingBalance.date})`
      : 'No --opening-balance-file supplied — skipping the opening entry. The books will start from zero and understate assets/equity by whatever existed before Renovo Pro was adopted, until re-run with one.'
  )

  await withTenantId(tenant.id, async () => {
    const [purchases, sales, expenses, loans, standaloneLoanRepayments, businessLoans, standaloneBusinessLoanRepayments, cashUps, stocktakes] = await Promise.all([
      prisma.purchase.findMany({ where: { status: { not: 'voided' } }, include: { lines: { include: { product: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.sale.findMany({ where: { status: { not: 'voided' } }, include: { lines: { include: { product: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.expense.findMany({ where: { status: 'approved' }, orderBy: { createdAt: 'asc' } }),
      prisma.loan.findMany({ where: { status: { not: 'voided' } }, orderBy: { createdAt: 'asc' } }),
      prisma.loanRepayment.findMany({ where: { purchaseId: null }, orderBy: { createdAt: 'asc' } }),
      prisma.businessLoan.findMany({ where: { status: { not: 'voided' } }, orderBy: { createdAt: 'asc' } }),
      prisma.businessLoanRepayment.findMany({ where: { saleId: null }, orderBy: { createdAt: 'asc' } }),
      prisma.cashUp.findMany({ where: { status: 'approved' }, orderBy: { sessionDate: 'asc' } }),
      // completed only (not 'open'/'voided') — quantityOnHand doesn't feed
      // into any dollar figure (only averageCost does, which a stocktake
      // adjustment never touches), so unlike purchases/sales these don't
      // need chronological interleaving for correctness.
      prisma.stocktake.findMany({ where: { status: 'completed' }, include: { entries: { include: { product: true } } }, orderBy: { completedAt: 'asc' } }),
    ])

    console.log('\nFound:')
    console.log(`  Purchases (non-voided): ${purchases.length}`)
    console.log(`  Sales (non-voided): ${sales.length}`)
    console.log(`  Expenses (approved): ${expenses.length}`)
    console.log(`  Loans (non-voided): ${loans.length}, standalone repayments: ${standaloneLoanRepayments.length}`)
    console.log(`  Business loans (non-voided): ${businessLoans.length}, standalone repayments: ${standaloneBusinessLoanRepayments.length}`)
    console.log(`  Cash-ups (approved): ${cashUps.length}`)
    console.log(`  Stocktakes (completed): ${stocktakes.length}`)

    if (!EXECUTE) {
      console.log('\nDry run only — no changes made. Re-run with --execute to actually post.')
      console.log('After executing, review /ledger\'s Trial Balance and Balance Sheet against any real reference figures (last known cash count, last stocktake value) before trusting the result.')
      return
    }

    await prisma.$transaction(async (tx) => { await ensureStructuralAccounts(tx) })

    if (openingBalance) {
      // No sourceId on an opening_balance entry (there's only ever one, not
      // tied to any existing row) — alreadyPosted's (sourceType, sourceId)
      // lookup doesn't apply; check for sourceType alone instead.
      const alreadyDone = !!(await prisma.journalEntry.findFirst({ where: { sourceType: 'opening_balance' } }))
      if (!alreadyDone) {
        await prisma.$transaction(async (tx) => {
          await postOpeningBalance(tx, {
            entryDate: new Date(openingBalance.date),
            lines: openingBalance.lines,
          })
        })
        console.log('\nPosted opening balance.')
      } else {
        console.log('\nOpening balance already posted — skipping (idempotent).')
      }
    }

    // ─── Chronologically interleaved: purchases + sales (moving-average COGS depends on true order) ───
    type CostEvent =
      | { at: Date; kind: 'purchase'; row: (typeof purchases)[number] }
      | { at: Date; kind: 'sale'; row: (typeof sales)[number] }
    const costEvents: CostEvent[] = [
      ...purchases.map((p) => ({ at: p.createdAt, kind: 'purchase' as const, row: p })),
      ...sales.map((s) => ({ at: s.createdAt, kind: 'sale' as const, row: s })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime())

    let processed = 0
    for (const ev of costEvents) {
      if (ev.kind === 'purchase') {
        const p = ev.row
        if (!(await alreadyPosted('purchase', p.id))) {
          await prisma.$transaction(async (tx) => {
            await postPurchase(tx, {
              purchaseId: p.id, refNumber: p.refNumber, entryDate: p.createdAt,
              isPending: true,
              paymentMethod: p.paymentMethod as 'cash' | 'eft',
              loanDeductionAmount: new Decimal(0),
              lines: p.lines.map((l) => ({
                productId: l.productId,
                productCategory: l.product.category,
                quantity: new Decimal(l.quantity.toString()),
                unitPrice: new Decimal(l.unitPrice.toString()),
                lineTotal: new Decimal(l.lineTotal.toString()),
                vatAmount: new Decimal(l.vatAmount?.toString() ?? '0'),
                isDeduction: new Decimal(l.unitPrice.toString()).isNegative(),
              })),
            })
          })
        }
        if (p.status === 'completed' && !(await alreadyPosted('purchase_settlement', p.id))) {
          const split = splitFromFinalState({
            totalAmount: new Decimal(p.totalAmount.toString()),
            loanDeduction: p.loanDeductionAmount ? new Decimal(p.loanDeductionAmount.toString()) : new Decimal(0),
            paymentMethod: p.paymentMethod as 'cash' | 'eft',
            splitPayments: p.splitPayments,
            loanKey: 'loan',
          })
          await prisma.$transaction(async (tx) => {
            await postPurchaseSettlement(tx, {
              purchaseId: p.id, refNumber: p.refNumber, entryDate: p.updatedAt,
              cashAmount: split.cash, eftAmount: split.eft, loanAmount: split.loan,
            })
          })
        }
      } else {
        const s = ev.row
        if (!(await alreadyPosted('sale', s.id))) {
          await prisma.$transaction(async (tx) => {
            await postSale(tx, {
              saleId: s.id, refNumber: s.refNumber, entryDate: s.createdAt,
              isPending: true,
              paymentMethod: s.paymentMethod as 'cash' | 'eft',
              vatAmount: new Decimal(s.vatAmount.toString()),
              businessLoanDeductionAmount: new Decimal(0),
              lines: s.lines.map((l) => ({
                productId: l.productId,
                productCategory: l.product.category,
                quantity: new Decimal(l.quantity.toString()),
                lineTotal: new Decimal(l.lineTotal.toString()),
              })),
            })
          })
        }
        if (s.status === 'completed' && !(await alreadyPosted('sale_settlement', s.id))) {
          const split = splitFromFinalState({
            totalAmount: new Decimal(s.totalAmount.toString()),
            loanDeduction: s.businessLoanDeductionAmount ? new Decimal(s.businessLoanDeductionAmount.toString()) : new Decimal(0),
            paymentMethod: s.paymentMethod as 'cash' | 'eft',
            splitPayments: s.splitPayments,
            loanKey: 'businessLoan',
          })
          await prisma.$transaction(async (tx) => {
            await postSaleSettlement(tx, {
              saleId: s.id, refNumber: s.refNumber, entryDate: s.updatedAt,
              cashAmount: split.cash, eftAmount: split.eft, loanAmount: split.loan,
            })
          })
        }
      }
      processed++
      if (processed % 100 === 0) console.log(`  ...${processed}/${costEvents.length} purchase/sale events processed`)
    }
    console.log(`Purchases + sales posted (${costEvents.length} events).`)

    // ─── Order-independent: expenses, loans, business loans, cash-up variance ───
    for (const e of expenses) {
      if (await alreadyPosted('expense', e.id)) continue
      await prisma.$transaction(async (tx) => {
        await postExpense(tx, {
          expenseId: e.id, refNumber: e.refNumber, entryDate: e.approvedAt ?? e.createdAt,
          expenseTypeId: e.expenseTypeId, amount: new Decimal(e.amount.toString()),
          paymentMethod: e.paymentMethod as 'cash' | 'eft',
        })
      })
    }
    console.log(`Expenses posted (${expenses.length}).`)

    for (const l of loans) {
      if (await alreadyPosted('loan_advance', l.id)) continue
      await prisma.$transaction(async (tx) => {
        await postLoanAdvance(tx, {
          loanId: l.id, refNumber: l.refNumber, entryDate: l.createdAt,
          principal: new Decimal(l.principalAmount.toString()), paymentMethod: l.paymentMethod as 'cash' | 'eft',
        })
      })
    }
    for (const r of standaloneLoanRepayments) {
      if (await alreadyPosted('loan_repayment', r.id)) continue
      const amount = new Decimal(r.amount.toString())
      if (amount.isZero()) continue
      if (amount.isPositive()) {
        await prisma.$transaction(async (tx) => {
          await postLoanRepayment(tx, {
            repaymentId: r.id, refNumber: r.refNumber, entryDate: r.createdAt,
            amount, paymentMethod: r.paymentMethod as 'cash' | 'eft',
          })
        })
      } else {
        await postStandaloneRepaymentReversal({
          sourceType: 'loan_repayment', sourceId: r.id, refNumber: r.refNumber, entryDate: r.createdAt,
          amount: amount.abs(), paymentMethod: r.paymentMethod as 'cash' | 'eft',
          loanAccountCode: LEDGER_ACCOUNTS.LOANS_RECEIVABLE, loanIsDebitNormal: true,
        })
      }
    }
    console.log(`Loans posted (${loans.length} advances, ${standaloneLoanRepayments.length} standalone repayments).`)

    for (const bl of businessLoans) {
      if (await alreadyPosted('business_loan', bl.id)) continue
      await prisma.$transaction(async (tx) => {
        await postBusinessLoanReceived(tx, {
          businessLoanId: bl.id, refNumber: bl.refNumber, entryDate: bl.createdAt,
          principal: new Decimal(bl.principalAmount.toString()), paymentMethod: bl.paymentMethod as 'cash' | 'eft',
        })
      })
    }
    for (const r of standaloneBusinessLoanRepayments) {
      if (await alreadyPosted('business_loan_repayment', r.id)) continue
      const amount = new Decimal(r.amount.toString())
      if (amount.isZero()) continue
      if (amount.isPositive()) {
        await prisma.$transaction(async (tx) => {
          await postBusinessLoanRepayment(tx, {
            repaymentId: r.id, refNumber: r.refNumber, entryDate: r.createdAt,
            amount, paymentMethod: r.paymentMethod as 'cash' | 'eft',
          })
        })
      } else {
        await postStandaloneRepaymentReversal({
          sourceType: 'business_loan_repayment', sourceId: r.id, refNumber: r.refNumber, entryDate: r.createdAt,
          amount: amount.abs(), paymentMethod: r.paymentMethod as 'cash' | 'eft',
          loanAccountCode: LEDGER_ACCOUNTS.LOANS_PAYABLE, loanIsDebitNormal: false,
        })
      }
    }
    console.log(`Business loans posted (${businessLoans.length} advances, ${standaloneBusinessLoanRepayments.length} standalone repayments).`)

    for (const c of cashUps) {
      if (await alreadyPosted('cashup_variance', c.id)) continue
      await prisma.$transaction(async (tx) => {
        await postCashUpVariance(tx, {
          cashUpId: c.id, sessionDate: c.sessionDate, variance: new Decimal(c.variance?.toString() ?? '0'),
        })
      })
    }
    console.log(`Cash-up variances posted (${cashUps.length}).`)

    for (const s of stocktakes) {
      if (await alreadyPosted('stocktake_adjustment', s.id)) continue
      await prisma.$transaction(async (tx) => {
        await postStocktakeAdjustment(tx, {
          stocktakeId: s.id, refNumber: s.refNumber, entryDate: s.completedAt ?? s.createdAt,
          lines: s.entries.map((e) => ({
            productId: e.productId, productCategory: e.product.category, variance: new Decimal(e.variance.toString()),
          })),
        })
      })
    }
    console.log(`Stocktake adjustments posted (${stocktakes.length}).`)

    console.log('\nDone. Open /ledger and review the Trial Balance and Balance Sheet.')
  })
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
