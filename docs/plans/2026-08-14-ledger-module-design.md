# Ledger module — design

Date: 2026-08-14

## Problem

Renovo Pro records every individual transaction (Purchases, Sales, Payments,
Expenses, Loans, Business Loans, Cash-up) but has no unified accounting view
of the business — no Chart of Accounts, no P&L, no Balance Sheet, nothing a
real accountant would recognize as "the books." The owner needs a proper
double-entry general ledger derived from the transactions already being
recorded, not a new place to re-enter data.

This is explicitly **not** a revival of the earlier "Golden Key Control
Tower" project (a separate multi-branch, multi-source-system app pulling
Renovo Pro + TimelyX data via export APIs) — that's out of scope here and
may be revisited separately later. This is scoped tightly to Renovo Pro's
own data.

## Locked decisions

- **Lives inside the Renovo Pro codebase/database** — no export API, no
  second app, no sync latency. Reads/writes the same Postgres database
  every other module already uses.
- **Its own standalone sub-app** at `/ledger`, mirroring Scale Station's
  `/scale` pattern exactly: `/ledger/login` (own branded page, same
  NextAuth backend and User table, own role gate) → `/ledger/*` route
  tree, zero shared chrome with the main `/app` portal. Not a literal
  subdomain (no custom domain currently configured) — a dedicated path is
  the agreed equivalent.
- **Admin role only.**
- **Full double-entry general ledger** — a real Chart of Accounts, every
  entry posts as balanced debits and credits, from which a Trial Balance /
  P&L / Balance Sheet are derived — not a simple cashbook-style running list.
- **Every transaction type posts from day one**: Purchases, Sales,
  Payments, Expenses, Loans, Business Loans, Cash-up (variance), and stock
  valuation (inventory as a real asset, COGS matched at sale).
- **Purchases/Sales/COGS accounts are broken down by product category**,
  each category's account rolling up into a parent aggregate account (e.g.
  "Sales Revenue" as the sum of "Sales Revenue — Copper",
  "— Aluminium", etc.).
- **Single base currency, SZL** — no parallel per-currency books; Eswatini's
  currency board pegs SZL 1:1 with ZAR, so this is a non-issue in practice.
- **No hardcoded/example Chart of Accounts.** Only the fixed *structural*
  accounts (Cash, Bank, Loans Receivable, Loans Payable, VAT
  Receivable/Payable, Accounts Payable, Owner's Equity, and the Inventory /
  Sales Revenue / COGS / Operating Expenses parents) are created via a
  migration. Category- and expense-type-level sub-accounts are generated
  from the *real, already-existing* `ProductCategory` and `ExpenseType`
  rows — nothing fabricated, nothing to reconcile later.
- **Full historical backfill**, not live-forward-only. Golden Key operated
  before Renovo Pro was adopted, so the backfill starts from a manually-
  entered **opening balance** (real figures supplied by the owner), then
  replays every historical transaction in strict chronological order on
  top of it, using the exact same posting logic as live-forward postings
  (never a separate implementation).

## 1. Data model

Four new tables:

- **`Account`** — the Chart of Accounts. `id, tenantId, code, name, type
  (asset|liability|equity|revenue|expense), parentAccountId (nullable),
  normalBalance (debit|credit), sourceCategoryId (nullable FK to
  ProductCategory, for category sub-accounts), sourceExpenseTypeId
  (nullable FK to ExpenseType, for expense sub-accounts), isActive`. A
  balance is always *computed* by summing its own `JournalLine`s plus every
  descendant account's — never stored, so it can never drift out of sync
  with the journal.
- **`JournalEntry`** — one per posting event. `id, tenantId, entryDate,
  description, sourceType (purchase|sale|payment|expense|loan|
  business_loan|cashup_variance|opening_balance|void_reversal|...),
  sourceId, createdByUserId, createdAt`. `sourceType`+`sourceId` link back
  to the real Purchase/Sale/Expense/etc. row for click-through.
- **`JournalLine`** — `id, journalEntryId, accountId, debit (Decimal,
  18,2), credit (Decimal, 18,2)`. Exactly one of debit/credit is non-zero
  per line. A `JournalEntry` is only ever valid when
  `sum(debit) === sum(credit)` across its own lines — enforced inside the
  posting helper itself, not assumed by callers.
- **`ProductAverageCost`** — `productId, tenantId, quantityOnHand,
  averageCost (Decimal, 18,4)` — the moving weighted-average cost per
  product that both live postings and the historical replay maintain
  incrementally, purchase by purchase, in chronological order.

## 2. Inventory valuation

Moving weighted-average cost per product: each purchase updates
`newAvg = (oldQty×oldAvg + purchaseQty×purchasePrice) / (oldQty+purchaseQty)`.
Each sale draws down inventory at the *current* average cost at the moment
of sale. Standard method for a business this size — FIFO lot-tracking would
add substantial new bookkeeping for no real benefit here.

## 3. Posting rules per transaction type

- **Purchase (completed)**: Dr Inventory–[category] (ex-VAT), Dr VAT
  Receivable (if applied) → Cr Cash (or split Cr Cash + Cr Loans Receivable
  if a loan deduction applied).
- **Purchase (pending)**: same debits, Cr Accounts Payable instead of Cash;
  settlement later is Dr Accounts Payable / Cr Cash.
- **Sale (completed)**: Dr Cash (or split with Cr Loans Payable reduction
  for a business-loan deduction) → Cr Sales Revenue–[category] (ex-VAT), Cr
  VAT Payable. Plus the matching cost entry: Dr COGS–[category], Cr
  Inventory–[category], at that product's current average cost × quantity.
- **Expense**: Dr Operating Expense–[type], Cr Cash.
- **Loan advanced** (yard → customer): Dr Loans Receivable, Cr Cash;
  repayment nets through a purchase's credit split above.
- **Business Loan received** (dealer → yard): Dr Cash, Cr Loans Payable;
  repayment nets through a sale's debit split above.
- **Cash-up variance**: declared vs. expected cash gap posts to a Cash
  Over/Short account, keeping the Cash account matched to physical reality.
- **Void/reverse**: never edits or deletes a posted entry — always a new,
  equal-and-opposite reversing `JournalEntry`, same principle already used
  for stock reversals elsewhere in the app.

## 4. Posting mechanism

Each existing service function (`createPurchase`, `createSale`,
`markPurchasePaid`, `createExpense`, `createLoan`, cash-up approval, the
void/reverse functions, etc.) gets one additional call to a shared
`postJournalEntry(tx, sourceType, sourceId, lines)` helper, made *inside
the same Prisma transaction it already runs in* — the journal entry and the
real transaction become atomically inseparable, matching this codebase's
existing "all multi-table writes = one transaction" discipline. No separate
sync step, no eventual consistency.

## 5. Reports

Everything reads from `JournalLine`/`Account`, never recalculated ad hoc:

- **Trial Balance** — every account's debit/credit total as of a date;
  must net to zero as the ledger's own internal self-check.
- **Profit & Loss** — Revenue minus Expenses (incl. COGS) for a period,
  category-level margin breakdown falling out of the account hierarchy.
- **Balance Sheet** — Assets = Liabilities + Equity as of a date.
- **General Ledger view** — any account's lines chronologically with a
  running balance, click-through to the source transaction.
- **Journal view** — the raw chronological feed of every posted entry.

## 6. Sub-app structure

Mirrors Scale Station exactly: `/ledger/login` (own branded page, same
NextAuth backend, admin-only gate) → `/ledger/*` route tree (Dashboard,
Trial Balance, P&L, Balance Sheet, General Ledger, Journal, Chart of
Accounts), own layout/session provider, no shared chrome with `/app`.
`middleware.ts` gains `/ledger` alongside the existing `/app`/`/scale`
matchers.

## 7. Historical backfill

A separate one-time script (dry-run-then-execute, same pattern as
`production-clear-transaction-data.ts`), run after live-forward posting is
built and proven correct:

1. Owner supplies real opening-balance figures (cash on hand, inventory
   value, any outstanding loans) as of the point Renovo Pro's data begins.
   Posted as a single `opening_balance` `JournalEntry`.
2. Every historical Purchase/Sale/Payment/Expense/Loan/BusinessLoan/CashUp
   is pulled into one unified chronological event stream (not processed
   table-by-table) and replayed through the *same* posting rules and
   `ProductAverageCost` tracking as live transactions — required for
   correct COGS, since each sale's cost depends on the running average
   built up from every purchase before it.
3. Voided/reversed historical transactions are excluded from the replay
   entirely (net-zero effect either way; simpler and equally correct for
   final balances).
4. Dry run reports computed final balances per account before anything
   writes, for comparison against any real reference figures available
   (last known cash count, last stocktake value) before committing.

## Testing

`tsc` + lint clean, no dev-server pass — verified directly by the owner per
established project practice. Worth checking closely once built: every
`JournalEntry` balances across a real day of mixed transactions; a void
produces a correct reversing entry rather than a silent deletion; Trial
Balance nets to zero; P&L margin-by-category matches known purchase/sale
prices; the backfill's final balances against real reference figures before
trusting it.
