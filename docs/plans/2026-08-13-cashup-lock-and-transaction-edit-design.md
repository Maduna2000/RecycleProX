# Cash-up lock + Purchase/Sale edit — design

Date: 2026-08-13

## Problem

Two gaps from the previous session:

1. **Cash-up lock not enforced.** `voidPurchase`, `voidSale`, `reversePurchasePayment`, and
   `reverseSalePayment` currently *allow* voiding/reversing a transaction even after that
   day's cash-up has been approved — they recalculate the approved cash-up's totals (and
   cascade to every later approved day) instead of blocking. That was a deliberate earlier
   design choice, but the requirement now is the opposite: once a day's cash-up is approved,
   its transactions must be immutable.
2. **No way to edit a transaction.** `reversePurchasePayment`/`reverseSalePayment` send a
   completed purchase/sale back to `pending`, but there has never been any way to change its
   line items (products, quantities, prices) — `updatePurchase`/`updateSale` don't exist.
   Once reversed, the only path forward was re-paying the exact same (possibly wrong) goods.

## 1. Cash-up lock

Add a guard at the top of `voidPurchase`, `voidSale`, `reversePurchasePayment`, and
`reverseSalePayment` (inside the transaction, before any writes): look up
`CashUp.findFirst({ where: { tenantId, sessionDate, status: 'approved' } })` for the
transaction's session date. If found, throw `CashUpAlreadyApprovedError` and make no changes.

This fires only at `status: 'approved'` — a cash-up that's merely `submitted` (awaiting
manager review) can still have its transactions corrected.

The existing `recalculateApprovedCashUpForDate(...)` call sites inside these four functions
become unreachable once the guard is in place (you can no longer reach the "day is approved"
branch without having already thrown) and are removed from these call sites. The function
itself stays if other callers still use it.

New error → 409 via the existing typed-error-to-HTTP-status pattern in the void/reverse-payment
API routes, message: `"Cannot reverse — <date>'s cash-up has already been approved."`

## 2. Purchase/Sale edit

**Visibility:** the Edit action only appears when `status === 'pending' && amountPaid` is
zero. A partially-paid pending transaction (via `markPurchasePaid`'s partial-settlement path)
has no in-place way to unwind just the payment — `reversePurchasePayment` only works on
`completed` status. The existing escape hatch for that case is `voidPurchase`, which already
accepts `pending` status and fully reverses stock + any partial payment + loan deductions.
So: Edit is simply hidden when `amountPaid > 0`; Void + a fresh New Purchase covers that case
exactly as it does today. No new "undo partial payment" feature needed.

**Backend — `updatePurchase(id, data, userId)` / `updateSale(id, data, userId)`:**
- Re-read the row inside a Serializable transaction; throw `PurchaseNotPendingError` /
  `SaleNotPendingError` unless `status === 'pending'`, and a new `AmountAlreadyPaidError` if
  `amountPaid` isn't zero (defense in depth — the UI already hides Edit in that case, but the
  API must not trust the client).
- Re-validate the customer exactly like `createPurchase` does (`blacklisted`, `isActive`,
  re-resolve prices against `priceGroupId`, re-evaluate `zeroRated` for VAT) — the customer
  can change during an edit.
- **Full replace of line items**, not per-line diffing (matching old lines to new ones by
  product is ambiguous — same product could appear twice, or get swapped out entirely):
  1. Reverse every stock movement the *original* lines posted, same `recordVoidReversal` call
     `voidPurchase` uses (excluding negative-price deduction lines, same as void).
  2. Delete the old `PurchaseLine` rows.
  3. Re-resolve and validate the *new* lines exactly like `createPurchase` (price resolution,
     override detection, VAT).
  4. Create the new `PurchaseLine` rows and post fresh stock movements for them.
- Loan/business-loan deduction: reverse any repayment tied to this record
  (`reverseRepaymentsForPurchase`/`reverseRepaymentsForSale`), then re-apply
  (`applyRepaymentTx`) if the edited deduction amount is greater than zero.
- Update the `Purchase`/`Sale` row: recalculated `totalAmount`, `vatAmount`,
  `loanDeductionAmount`/`businessLoanDeductionAmount`, `paymentMethod`, `notes`, `customerId`.
  `scaleOrderId`, photos, and signature are left untouched.
- **No cash-up recalculation** — a pending transaction was never counted in any approved
  day's totals (same exclusion `production-clear-transaction-data.ts` already relies on for
  `hasOutstandingBalance`), so editing it — regardless of how old it is — doesn't interact
  with §1's lock at all.
- Regenerate the stored VAT264/purchase-note PDFs after a successful edit (same fire-and-forget
  `generateAndStorePurchasePdfs` call `createPurchase` makes), so anything reprinted matches
  the current state.
- `logger.info({ purchaseId, refNumber, userId }, 'purchase.updated')` — matches existing
  logging style; DB-level audit logging is automatic via the Prisma middleware.

**Schema:** hand-declared `UpdatePurchaseSchema`/`UpdateSaleSchema` via `.extend()` with each
field explicitly optional — *not* `CreatePurchaseSchema.partial()`, which would silently
re-apply the create schema's `.default()` values to any field omitted from a partial update.

**API:** add `PATCH` to `src/app/api/purchases/[id]/route.ts` and
`src/app/api/sales/[id]/route.ts` (currently GET-only) — same auth/role pattern as the
neighboring `reverse-payment` route (`admin`/`manager` only), mapping `PurchaseNotFoundError`
→ 404, `PurchaseNotPendingError`/`AmountAlreadyPaidError` → 409.

**Frontend:**
- New route `/app/purchases/[id]/edit` (and `/app/sales/[id]/edit`): fetches the record via
  SWR, verifies it's still editable (redirects to the detail page with a toast if not, e.g.
  stale link after settlement), and renders the existing `NewPurchasePage`/`NewSalePage` form
  with an `editingPurchase`/`editingSale` prop instead of a blank form.
- `NewPurchasePage`/`NewSalePage`: on mount with that prop, seed `lines` from the existing
  `PurchaseLine`/`SaleLine` rows (`weighMode: false` by default — re-weighing via scale stays
  available, just not forced), and seed the customer selector, payment method, notes, and
  loan-deduction field. Submit branches to `PATCH /api/purchases/${id}` instead of
  `POST /api/purchases`, and on success navigates to the detail page instead of showing the
  "new purchase" print modal.
- Row actions: add **Edit** (pencil icon) next to Reverse Payment/Void on the main
  Purchases/Sales lists and the Unpaid lists, and a matching button on the detail pages —
  `hidden: (row) => !isManager || row.status !== 'pending' || Decimal(row.amountPaid).gt(0)`.

## Testing

`tsc` + lint clean before commit (per this project's established flow — no dev-server/Playwright
pass; manual verification happens separately). Scenarios to exercise by hand: reverse → edit →
settle round trip on both purchases and sales; edit that swaps a product entirely (confirm
stock reflects only the new lines, not a mix of old+new); void/reverse attempted on an approved
day (confirm the 409); Edit attempted on a partially-paid pending purchase (confirm it's hidden
and Void still works there).
