# Ledger Phases 1-3 — Implementation Plan

Verified against actual source (line numbers/signatures exact as of 2026-09-01). No schema
migration required for any phase — every capability layers onto the existing
`sourceType`-as-string / `postJournalEntry` / `ProductAverageCost` design.

---

## PHASE 1 — Ledger Cash vs. Cash-up Cash reconciliation

### What exists today
- [src/app/ledger/page.tsx:326](src/app/ledger/page.tsx#L326) fetches `/api/ledger/cash-on-hand`,
  which calls `getCurrentCashOnHand` from
  [src/lib/services/cashUpService.ts:938](src/lib/services/cashUpService.ts#L938) — the
  operational figure, not the ledger's own posted balance. The posted Cash account (code `1000`)
  balance is never fetched or shown anywhere on `/ledger`.
- [src/lib/services/ledgerReportService.ts](src/lib/services/ledgerReportService.ts) already has
  everything needed: `sumLinesByAccount()` (line 26) does one `journalLine.groupBy` call,
  `ownBalance()` (line 43) turns that into a signed balance, and `getChartOfAccounts()` (line 62)
  is the existing caller of this exact pattern for an as-of-date balance. This is **not** the
  expensive per-line walk — that's `getGeneralLedger()` (line 493), which needs a running balance
  per line for a listing page. Phase 1 only needs a point-in-time balance for two accounts.

### Decision: live computation, not stored/cached
Live, always-computed — consistent with every other figure in `ledgerReportService.ts`, and
cheap (same one-`groupBy` shape `getChartOfAccounts` already uses, just filtered to two codes).
No caching/materialization needed.

### Concrete plan

1. **`src/lib/services/ledgerReportService.ts`** — add, next to `getChartOfAccounts`:
   ```ts
   export async function getPostedCashAndBankBalances(asOfLabel?: string): Promise<{
     asOf: string
     cash: string   // account 1000, ownBalance
     bank: string   // account 1010, ownBalance
   }>
   ```
   Reuse the existing `sumLinesByAccount` + `ownBalance` helpers exactly as `getChartOfAccounts`
   does — `prisma.account.findMany({ where: { code: { in: [LEDGER_ACCOUNTS.CASH, LEDGER_ACCOUNTS.BANK] } } })`
   joined with one `sumLinesByAccount({ entryDate: { lte: asOf } })` call. Cash and Bank are both
   structural (never have children), so `ownBalance` *is* the total — no rollup needed.

2. **Extend `src/app/api/ledger/cash-on-hand/route.ts`** (recommended over a new route — already
   admin-only, already tenant-scoped, already exists solely to serve this dashboard card): call
   both `getCurrentCashOnHand(date)` and `getPostedCashAndBankBalances(date)` in parallel, return
   `{ date, cashUpCash, ledgerCash, ledgerBank, variance }` (`variance = ledgerCash - cashUpCash`,
   Decimal, `.toFixed(2)`).

3. **`src/app/ledger/page.tsx`** — extend the `cashOnHandData` SWR type; add a
   `CashReconciliationCard` (or extend `TradingBreakdownCard`) with three rows: "Cash-up
   (operational)", "Ledger (posted, account 1000)", "Variance" — highlighted red when
   `Decimal.abs(variance).greaterThan('0.01')`, neutral/green otherwise. Follow the existing
   `Panel`/`row()` pattern (lines 36-92). The existing "Cash on Hand" `StatCard` (line 357) is
   unchanged; the new card is additive.

4. **Out of scope**: no auto-correction, no journal entry posted from this comparison, no
   persisted reconciliation record. Read-only diagnostic only.

### Files
- Modify: `src/lib/services/ledgerReportService.ts` (add `getPostedCashAndBankBalances`)
- Modify: `src/app/api/ledger/cash-on-hand/route.ts` (extend response payload)
- Modify: `src/app/ledger/page.tsx` (new comparison card, updated SWR type)
- No migration.

---

## PHASE 2 — Single source of truth for inventory quantity + manual adjustments posting to the ledger

### Confirmed live feature, not dead code
`manualAdjustment`/`manualCountAdjustment`
([src/lib/services/stockService.ts:250](src/lib/services/stockService.ts#L250) and `:291`) are
called from `src/app/api/stock/adjust/route.ts`, itself called from the `AdjustmentModal` in
`src/app/app/(modules)/stock/page.tsx` (admin/manager-gated, has a `?adjust=1` deep-link).
**Wire it up, do not delete.**

### Root cause
- `manualAdjustment`/`manualCountAdjustment` call `recordMovement(tx, { source: 'manual_adjustment', ... })`
  only — a `StockMovement` row, nothing else. They never touch `ProductAverageCost.quantityOnHand`
  and never post to the ledger.
- Contrast with `stocktakeService.completeStocktake`
  ([src/lib/services/stocktakeService.ts:192](src/lib/services/stocktakeService.ts#L192)), which
  writes `StockMovement` rows *and* calls `postStocktakeAdjustment`
  ([ledgerService.ts:1030](src/lib/services/ledgerService.ts#L1030)), which posts the
  Inventory/Stock-Variance journal entry **and** mutates `ProductAverageCost.quantityOnHand`.
- `ledgerReportService.getStockValueByCategory` (line 306) computes on-hand quantity from an
  independent `stockMovement.groupBy` (line 310), while COGS at sale time
  (`ledgerService.consumeCostForSale`, line 290) consumes `ProductAverageCost.quantityOnHand`.
  These only agree today because every other posting path keeps both in lockstep — manual
  adjustment is the one gap.

### Concrete plan

1. **`src/lib/services/ledgerService.ts`** — extract the reusable core of `postStocktakeAdjustment`
   into a private helper, then add a manual-adjustment variant on top of it (do not call
   `postStocktakeAdjustment` directly — its `sourceType`/description are hardcoded and would
   mislabel manual adjustments):
   ```ts
   // private, shared
   async function postInventoryQuantityAdjustment(
     tx: TxClient,
     opts: { sourceType: string; sourceId: string; description: string; entryDate: Date; lines: StocktakeAdjustmentLine[]; userId?: string }
   ): Promise<void>
   // body = today's postStocktakeAdjustment implementation (lines 1034-1074), with
   // sourceType/sourceId/description now parameters instead of hardcoded literals

   export async function postStocktakeAdjustment(tx, opts: { stocktakeId; refNumber; entryDate; lines; userId? }): Promise<void>
   // unchanged public signature — calls postInventoryQuantityAdjustment with
   // sourceType: 'stocktake_adjustment', sourceId: opts.stocktakeId

   export async function postManualStockAdjustmentLedger(
     tx: TxClient,
     opts: { movementId: string; productId: string; productCategory: string; variance: Decimal; entryDate: Date; refNumber?: string; userId?: string }
   ): Promise<void>
   // calls postInventoryQuantityAdjustment with sourceType: 'manual_stock_adjustment',
   // sourceId: opts.movementId
   ```
   `variance` sign convention (matches `StocktakeAdjustmentLine`'s doc comment at line 1014):
   positive = stock increased, negative = stock decreased —
   `direction === 'in' ? quantity : quantity.negated()`.

   No reversal function added for manual adjustments yet — no "void a manual adjustment" UI
   exists; `reverseJournalEntry` already works generically against
   `sourceType: 'manual_stock_adjustment'` if that's added later.

2. **`src/lib/services/stockService.ts`** — inside the existing transaction in both
   `manualAdjustment` (line 250) and `manualCountAdjustment` (line 291), after `recordMovement`
   returns, call `postManualStockAdjustmentLedger(tx, { movementId: movement.id, productId, productCategory: product.category, variance, entryDate: new Date(), userId })`.
   - `manualAdjustment`: `variance = direction === 'in' ? new Decimal(quantity) : new Decimal(quantity).negated()`.
   - `manualCountAdjustment`: already computes signed `diff` — pass it straight through.
   - No signature changes, no caller changes — purely additive inside the existing transaction.

3. **`src/lib/services/ledgerReportService.ts`** — `getStockValueByCategory` (line 306): switch
   on-hand quantity source from the `stockMovement.groupBy` (lines 309-320) to
   `ProductAverageCost.quantityOnHand` (already fetched at line 312 for `averageCost` — just also
   read `.quantityOnHand`). Removes the now-redundant `movements` query.

### Risk: backfill required before the report source-switch
`ProductAverageCost` rows are created lazily (first purchase/sale/stocktake-adjustment). A
product whose *only* historical stock activity was a manual adjustment made before this fix ships
has `StockMovement` rows but no `ProductAverageCost` row — switching the report source outright
would silently show it as zero stock.

Mitigation, in order:
1. Ship the posting fix first (stops new drift).
2. Backfill script `scripts/backfill-product-average-cost-quantities.ts` (follow
   `scripts/ledger-historical-backfill.ts` convention): for every `Product`, compute true on-hand
   via existing `getStockOnHand()` (already excludes voided pairs — `notVoidedFilter`,
   stockService.ts:86) and upsert `ProductAverageCost.quantityOnHand` where missing/different,
   leaving `averageCost` untouched (only quantity tracking had the gap).
3. Only then switch `getStockValueByCategory`'s source.

### Files
- Modify: `src/lib/services/ledgerService.ts` (extract `postInventoryQuantityAdjustment`, add `postManualStockAdjustmentLedger`)
- Modify: `src/lib/services/stockService.ts` (`manualAdjustment`, `manualCountAdjustment`)
- Modify: `src/lib/services/ledgerReportService.ts` (`getStockValueByCategory`)
- New: `scripts/backfill-product-average-cost-quantities.ts`
- No schema migration.

---

## PHASE 3 — Manual/adjusting journal entry UI

### What exists today
The only non-domain-event posting path is `postOpeningBalanceOnce()`
([ledgerService.ts:1138](src/lib/services/ledgerService.ts#L1138)) — self-transacting, throws on
a second attempt, reachable only from `src/app/ledger/opening-balance/page.tsx`. That page's own
"already posted" state (lines 80-94) tells the admin to "post a dated adjusting journal entry
instead" — a feature that doesn't exist yet. No generic multi-line manual entry, no reversal UI
outside a domain void flow.

### Concrete plan

1. **`src/lib/services/ledgerService.ts`** — add near `postOpeningBalance`:
   ```ts
   export interface ManualJournalLineInput { accountId: string; debit?: Decimal.Value; credit?: Decimal.Value }

   export async function postManualJournalEntry(opts: {
     entryDate: Date; description: string; lines: ManualJournalLineInput[]; userId?: string
   }): Promise<{ sourceId: string }> {
     const sourceId = randomUUID()
     await prisma.$transaction(async (tx) => {
       await ensureStructuralAccounts(tx)
       await postJournalEntry(tx, {
         entryDate: opts.entryDate, description: opts.description,
         sourceType: 'manual_adjustment', sourceId,
         createdByUserId: opts.userId, lines: opts.lines,
       })
     })
     return { sourceId }
   }

   export class ManualJournalEntryNotFoundError extends Error {}
   export class ManualJournalEntryAlreadyReversedError extends Error {}

   export async function reverseManualJournalEntry(sourceId: string, reason: string, userId?: string): Promise<void> {
     await prisma.$transaction(async (tx) => {
       const original = await tx.journalEntry.findFirst({ where: { sourceType: 'manual_adjustment', sourceId } })
       if (!original) throw new ManualJournalEntryNotFoundError(sourceId)
       const alreadyReversed = await tx.journalEntry.findFirst({ where: { sourceType: 'manual_adjustment_reversal', sourceId } })
       if (alreadyReversed) throw new ManualJournalEntryAlreadyReversedError(sourceId)
       await reverseJournalEntry(tx, 'manual_adjustment', sourceId, `Reversed — Manual entry: ${reason}`, userId)
     })
   }
   ```
   A synthetic `sourceId` (not `undefined`, unlike `postOpeningBalance`) is required because
   `reverseJournalEntry` looks entries up by `(sourceType, sourceId)` — multiple manual entries
   sharing a null `sourceId` would be indistinguishable to `findFirst`.

   Add `'manual_adjustment'` / `'manual_adjustment_reversal'` to the `sourceType` doc comment on
   `JournalEntry` in `prisma/schema.prisma:1244` (comment-only, no migration).

2. **`src/lib/schemas/ledger.ts`** — add alongside `OpeningBalanceInputSchema`:
   ```ts
   const accountLineSchema = z.object({
     accountId: z.string().uuid(), debit: moneyString, credit: moneyString,
   }).refine((l) => (Number(l.debit ?? 0) > 0) !== (Number(l.credit ?? 0) > 0),
     'Each line must have either a debit or a credit, not both or neither')

   export const ManualJournalEntryInputSchema = z.object({
     date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
     description: z.string().min(3, 'Description is required'),
     lines: z.array(accountLineSchema).min(2, 'At least two lines are required'),
   }).refine((v) => {
     const totalDebit = v.lines.reduce((s, l) => s + Number(l.debit ?? 0), 0)
     const totalCredit = v.lines.reduce((s, l) => s + Number(l.credit ?? 0), 0)
     return Math.abs(totalDebit - totalCredit) < 0.01
   }, { message: 'Total debits must equal total credits', path: ['lines'] })

   export type ManualJournalEntryInput = z.infer<typeof ManualJournalEntryInputSchema>
   ```
   (Server-side balance check is defense-in-depth — `postJournalEntry` already throws on
   imbalance regardless.)

3. **New API route `src/app/api/ledger/journal/new/route.ts`** — `POST`, `requireRole(['admin'])`,
   `runWithRequestTenant`, parse with `ManualJournalEntryInputSchema`, call
   `postManualJournalEntry({ entryDate: sastDateLabelToUTCDate(date), description, lines, userId })`,
   return `{ ok: true, sourceId }`.

   Optionally also `src/app/api/ledger/journal/reverse/route.ts` (`POST { sourceId, reason }`),
   admin-only, same shape as `eft-receivables/confirm/route.ts`.

4. **New page `src/app/ledger/journal/new/page.tsx`** — admin-only via existing
   `LedgerClientLayout` gate. Reuse `Field`/`inp`/`Btn`/`PortalPage` from `@/components/rpx`
   (per `opening-balance/page.tsx`) and the `addLine`/`removeLine`/keyed-row pattern from
   `PurchaseForm.tsx` rather than inventing a new line-builder:
   - Date field (`max={todayLabel()}`), description field.
   - Line rows: account picker (`<select>` from a client-side flattened
     `GET /api/ledger/accounts` tree) + debit input + credit input. Start with 2 rows, "+ Add
     Line", per-row remove (disabled below 2 rows).
   - Live running totals + balanced/not-balanced banner styled like Trial Balance's
     `CheckCircle2`/`AlertTriangle` (`trial-balance/page.tsx:45-57`). Submit disabled while not
     balanced.
   - On submit: `POST /api/ledger/journal/new`, `toast.success`, redirect to
     `/ledger/journal?sourceType=manual_adjustment`.

5. **Reversibility UI** — "Reverse" action on `src/app/ledger/journal/page.tsx` (line 27) for
   `sourceType === 'manual_adjustment'` rows not already reversed (add a `reversed: boolean` to
   `JournalEntryRow`/`getJournal`, computed via a `sourceId` set lookup similar to
   `getEftAwaitingConfirmation`'s `confirmedSaleIds` pattern, `ledgerReportService.ts:685`).
   Prompts for a reason, calls the reverse endpoint.

6. **Nav** — add `'manual_adjustment'` to `SOURCE_TYPES` in `journal/page.tsx` (line 21-25); add
   a dashboard shortcut (`page.tsx:396-416`) e.g. `{ href: '/ledger/journal/new', label: 'New Journal Entry', desc: 'Post a manual/adjusting entry' }` — same placement precedent as "Opening
   Balances". Optionally also add to `LedgerClientLayout.tsx`'s `NAV_ITEMS`.

### Files
- Modify: `src/lib/services/ledgerService.ts` (`postManualJournalEntry`, `reverseManualJournalEntry`, error classes)
- Modify: `src/lib/schemas/ledger.ts` (`ManualJournalEntryInputSchema`)
- New: `src/app/api/ledger/journal/new/route.ts`
- New: `src/app/api/ledger/journal/reverse/route.ts`
- New: `src/app/ledger/journal/new/page.tsx`
- Modify: `src/app/ledger/journal/page.tsx` (source type filter, reverse action, `reversed` flag)
- Modify: `src/lib/services/ledgerReportService.ts` (`getJournal`/`JournalEntryRow` — add `reversed`)
- Modify: `src/app/ledger/page.tsx` and/or `LedgerClientLayout.tsx` (nav entry)
- Comment-only: `prisma/schema.prisma` (`JournalEntry.sourceType` doc comment)

---

### Critical files across all phases
- `src/lib/services/ledgerService.ts`
- `src/lib/services/ledgerReportService.ts`
- `src/lib/services/stockService.ts`
- `src/app/ledger/page.tsx`
- `src/lib/schemas/ledger.ts`
