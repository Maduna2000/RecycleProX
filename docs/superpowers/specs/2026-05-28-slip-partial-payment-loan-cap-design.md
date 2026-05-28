# Purchase Slip & Loan Deduction — Design Spec

**Date:** 2026-05-28
**Status:** Approved

---

## Problem Statement

Two distinct but related issues in the purchase module:

1. **Slip PDF renders incorrectly** — dashes are truncated short of the paper edge, all totals section numbers are bold (should be labels only), and partial/unpaid purchases show the full amount as if fully paid instead of the actual paid/due split.

2. **Loan deduction blocks purchases** — when a customer's outstanding loan exceeds the purchase payout, the system throws `LoanDeductionExceedsTotalError` and refuses to save the purchase. The correct behaviour is to cap the deduction, apply what's available, record the remainder, and print it on the slip.

---

## Scope

Four files, no schema changes:

| File | What changes |
|------|-------------|
| `src/lib/pdf/slip.ts` | Full-width dashes, selective bold, partial payment display, remaining loan balance line, new `TransactionSlipData` fields |
| `src/lib/services/purchaseService.ts` | Remove error throw, cap deduction at `totalAmount`, apply capped amount |
| `src/app/api/purchases/[id]/receipt/route.ts` | Pass `amountPaid`, `status`, `remainingLoanBalance` to slip generator |
| `src/app/app/(modules)/purchases/new/page.tsx` | Remove client-side validation block when loan > total |

---

## 1. Slip PDF (`src/lib/pdf/slip.ts`)

### 1.1 Full-width dashes

**Current:** `'- '.repeat(22).substring(0, 38)` — hard-coded to ~76pt, far short of `BODY_W` (207pt).

**New:** Build the string dynamically using font metrics:

```ts
function dashes() {
  const chunk    = '- '
  const chunkW   = reg.widthOfTextAtSize(chunk, SMALL)
  const count    = Math.floor(BODY_W / chunkW)
  const dashLine = chunk.repeat(count)
  page.drawText(dashLine, { x: MARGIN, y: cursor, size: SMALL, font: reg, color: LGRAY })
}
```

This fills the full 80mm body regardless of font scaling.

### 1.2 Selective bold in totals

**Rule:** Labels are `reg` + gray; only the monetary amount on each line is `bold` + black. The final summary line (TOTAL PAID / AMOUNT DUE / TOTAL) has its amount at `LARGE` size to make it stand out.

| Element | Font | Size | Color |
|---------|------|------|-------|
| `Gross Payout:` label | `reg` | `SMALL` | `DGRAY` |
| Gross Payout amount | `bold` | `NORMAL` | `BLACK` |
| `Loan Deduction:` label | `reg` | `SMALL` | `DGRAY` |
| Loan Deduction amount | `bold` | `NORMAL` | `BLACK` |
| `Loan Balance Rem.:` label | `reg` | `SMALL` | `DGRAY` |
| Loan Balance Rem. amount | `reg` | `SMALL` | `DGRAY` |
| Final summary label | `reg` | `NORMAL` | `DGRAY` |
| Final summary amount | `bold` | `LARGE` | `BLACK` |

### 1.3 New `TransactionSlipData` fields

```ts
export interface TransactionSlipData {
  // ... existing fields ...
  amountPaid?:           string   // decimal string, e.g. "150.00"
  status?:               'completed' | 'pending' | 'partial'
  remainingLoanBalance?: string   // loan still outstanding after this purchase
}
```

### 1.4 Dynamic totals label

| `status` | Bottom of slip shows |
|----------|---------------------|
| `'completed'` | `TOTAL PAID: EX.XX` (single line, bold amount) |
| `'pending'` | `AMOUNT DUE: EX.XX` (single line, bold amount) |
| `'partial'` | `TOTAL PAID: EX.XX` then `BALANCE DUE: EX.XX` (two lines) |
| `undefined` / legacy | `TOTAL: EX.XX` (existing behaviour preserved) |

### 1.5 Remaining loan balance line

When `remainingLoanBalance` is present and greater than `"0.00"`, insert a line after Loan Deduction:

```
  Loan Deduction:      - E200.00
  Loan Bal. Remaining:   E150.00   ← gray, reg font
  ─────────────────────────────
  CASH TO PAY:           E0.00
```

### 1.6 Height estimator update (`estimateHeight`)

Add `LINE_H` for the `Loan Bal. Remaining` line (when `remainingLoanBalance` is passed) and `LINE_H` for the extra `BALANCE DUE` line (when `status === 'partial'`).

---

## 2. Loan deduction logic (`src/lib/services/purchaseService.ts`)

### 2.1 Remove the blocking error

Delete:
```ts
if (deduction && deduction.greaterThan(totalAmount))
  throw new LoanDeductionExceedsTotalError()
```

Remove the `LoanDeductionExceedsTotalError` class entirely.

### 2.2 Cap the deduction

```ts
const effectiveDeduction = deduction
  ? Decimal.min(deduction, totalAmount)
  : new Decimal(0)

const cashToPay = totalAmount.minus(effectiveDeduction)
```

Use `effectiveDeduction` everywhere `deduction` was previously used (in the `applyRepaymentTx` call and when writing `loanDeductionAmount` to the DB).

### 2.3 Behaviour when loan > payout

- `effectiveDeduction` = `totalAmount` (full payout absorbed)
- `cashToPay` = `0.00`
- `loanDeductionAmount` stored in DB = `totalAmount` (the actual amount applied)
- The loan record's `balance` decreases by `effectiveDeduction` only, not the full requested deduction
- The slip shows `Loan Bal. Remaining: E{originalLoanBalance - effectiveDeduction}`

---

## 3. Receipt API route (`src/app/api/purchases/[id]/receipt/route.ts`)

After loading the purchase (with customer + loan data), compute and pass to `generateTransactionSlip`:

```ts
const amountPaid = purchase.payments
  .reduce((sum, p) => sum.plus(new Decimal(p.amount.toString())), new Decimal(0))

const status: 'completed' | 'pending' | 'partial' =
  purchase.status === 'completed' ? 'completed'
  : amountPaid.greaterThan(0) ? 'partial'
  : 'pending'

const remainingLoanBalance = purchase.loanDeductionAmount && purchase.customer?.loanBalance
  ? new Decimal(purchase.customer.loanBalance.toString())
      .toFixed(2)   // current balance already reflects the repayment
  : undefined
```

> Note: `customer.loanBalance` is read AFTER the transaction has run, so it already reflects the applied deduction. No manual subtraction needed.

Pass these into the `TransactionSlipData` object.

---

## 4. Client-side form (`src/app/app/(modules)/purchases/new/page.tsx`)

Remove the validation that prevents submission when `deductionAmount > totalAmount`. The server now handles this gracefully. Any warning shown to the user can remain as an informational note (not a blocking error).

---

## Verification Checklist

1. Purchase with no loan, paid — slip shows `TOTAL PAID: EX.XX`, single bold amount, dashes reach edge
2. Purchase with no loan, unpaid — slip shows `AMOUNT DUE: EX.XX`
3. Purchase with partial payment — slip shows `TOTAL PAID: EX.XX` + `BALANCE DUE: EX.XX`
4. Purchase where loan < payout — deduction applied in full, `CASH TO PAY` = difference, no remaining balance line
5. Purchase where loan > payout — deduction capped at payout, `CASH TO PAY` = E0.00, `Loan Bal. Remaining` line shows remainder, purchase saves successfully (no error thrown)
6. All labels in totals section are gray/regular weight; only amounts are bold
7. Dashes line spans full paper width
8. `npx tsc --noEmit` → 0 errors
