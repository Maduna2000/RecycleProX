# Cash-Up + Float Business Logic Fix — Design Spec

**Date:** 2026-05-29
**Status:** Approved
**Scope:** Business logic corrections only — no new features, no schema migration

---

## Problem Summary

Four business logic bugs exist across the Float and Cash-Up modules:

1. **`drawingsReceived` is manual.** Float top-ups are stored as `FloatMovement` records but the cashup's `drawingsReceived` field is entered by the cashier at submit time. The two are completely disconnected — a top-up has zero effect on the reconciliation formula.

2. **Carry-forward is breakable.** `openCashUp` correctly carries the previous day's closing balance forward — but only when no `CashFloat` record exists for today. If a manager manually sets today's float (via the float page) before the cashup is opened, that manual number overrides the carry-forward, silently corrupting the opening balance.

3. **Float withdrawal endpoint is wrong.** Cash only leaves the drawer through purchase payments and expenses. The `/api/float/withdraw` route allows creating `FloatMovement(withdrawal)` records that are never reflected in the cashup formula, making cash silently disappear from reconciliation.

4. **Float movement ledger is invisible.** Top-ups are recorded in `FloatMovement` but never shown in the float UI. Managers have no way to verify what was added or when.

---

## Confirmed Cash Flow Model

Established through business owner review. No other flows exist.

**Cash IN (increases expected drawer):**
- Opening balance (always carried from previous day's `closingAmount`)
- Cash sales (`Sale.paymentMethod = cash, status = completed`)
- Loan repayments (`LoanRepayment` records for the day)
- Float top-ups (`FloatMovement.movementType = top_up` for the day)

**Cash OUT (decreases expected drawer):**
- Cash purchases (`Purchase.paymentMethod = cash, status = completed`)
- Payments against pending purchases (`Payment.paymentMethod = cash, voidedAt = null`)
- Expenses (`Expense` records for the day)
- Loan advances (`Loan` records created for the day)

---

## Reconciliation Formula (fixed)

```
Expected = openingBalance
         + cashSales
         + floatTopUps        ← replaces manual drawingsReceived
         + loanRepayments
         - cashPurchases
         - cashPayments
         - expenses
         - loanAdvances
```

`variance = declaredCash − expected`

This formula is unchanged in structure. Only the source of `drawingsReceived` changes: from manual cashier input to auto-calculated from `FloatMovement`.

---

## Changes Required

### 1. `src/lib/services/floatService.ts`

Add one new exported function:

```ts
export async function getFloatTopUpsForDate(date: Date): Promise<Decimal>
```

- Filters `FloatMovement` directly by `movementType = 'top_up'` and `createdAt` within the session date's midnight-to-midnight window (same pattern as all other daily aggregates in the codebase)
- Returns `Decimal` sum (zero if no top-ups found)

### 2. `src/lib/services/cashUpService.ts` — `openCashUp`

Fix the carry-forward guard. Current logic: if a `CashFloat` record exists for today, use it (bypasses carry-forward). Fixed logic:

```
prevFloat = getMostRecentFloatBefore(sessionDate)

if prevFloat.closingAmount exists:
  openingBalance = prevFloat.closingAmount   ← closing ALWAYS wins
else if todayFloat exists:
  openingBalance = todayFloat.openingAmount  ← manual only if no history
else if prevFloat.openingAmount exists:
  openingBalance = prevFloat.openingAmount
else:
  openingBalance = 0
```

This ensures the only way to override carry-forward is to bootstrap on the very first day (no prior history exists at all).

### 3. `src/lib/services/cashUpService.ts` — `submitCashUp`

Replace the `drawingsReceived` input parameter with an auto-calculated value:

```ts
// REMOVE: const drawingsReceived = new Decimal(input.drawingsReceived ?? 0)
// ADD:
const drawingsReceived = await getFloatTopUpsForDate(cashUp.sessionDate)
```

The `drawingsReceived` field on the `CashUp` DB record is still written — it becomes a cached computed value (useful for historical display without re-querying movements).

### 4. `src/lib/services/cashUpService.ts` — `getLiveStats`

Add a float top-ups query so live stats on the cashup page reflect the running top-up total:

```ts
prisma.floatMovement.aggregate({
  _sum: { amount: true },
  where: {
    movementType: 'top_up',
    createdAt: { gte: start, lte: end },
  },
})
```

Return as `floatTopUps` in the live stats response.

### 5. `src/lib/schemas/cashup.ts` — `SubmitCashUpSchema`

Remove `drawingsReceived` and `loansTotal` from the schema. Both are now fully server-derived (`drawingsReceived` from `FloatMovement`, `loansTotal` from `getLoanTotalsForDate` which already runs as the fallback when no manual value is provided). Only keep:
- `declaredCash` (required)
- `denominations` (required)
- `notes` (optional)

### 6. `src/app/api/float/withdraw/route.ts`

Delete this file. The withdrawal endpoint allows creating records that are ignored by the cashup formula, which produces silent reconciliation errors.

The `withdrawal` value in the `FloatMovementType` Prisma enum is left in place (removing it requires a migration). No new withdrawal records can be created once the route is deleted.

### 7. `src/app/app/(modules)/float/page.tsx`

Add a "Today's Movements" section using `/api/float/current` (which already returns movements). Show a compact table:

| Time | Type | Amount | Note | By |
|------|------|--------|------|----|

- Type badge: `top_up` → green "Top-Up", `opening` → blue "Opening"
- Only shown if there are movements for today
- No pagination needed (intraday movements will be few)

### 8. `src/app/app/(modules)/cashup/page.tsx`

- Remove the manual "Drawings Received" input field from the submit form
- The reconciliation display section already shows `drawingsReceived` — keep it, it will now show the auto-calculated value from live-stats
- Keep "Drawings Received" as the display label for user familiarity (Option A — minimal change)

---

## Files NOT Changed

- `prisma/schema.prisma` — no migration needed
- `CashUp` model — `drawingsReceived` field stays (now a cached computed value)
- `FloatMovement` model — no changes
- All other API routes and services

---

## Verification Checklist

1. Open a cashup on a day where yesterday had a closing balance → opening balance equals yesterday's closing
2. Manager sets float manually then opens cashup → opening balance still uses carry-forward, not manual amount
3. Manager does a float top-up of E500 → cashup live stats shows E500 under float top-ups, expected balance increases by E500
4. Submit cashup → `drawingsReceived` on the record equals the sum of today's top-ups, not a manually entered value
5. Attempt to POST `/api/float/withdraw` → 404
6. Float page shows today's movements list after a top-up
7. `npx tsc --noEmit` → 0 errors
