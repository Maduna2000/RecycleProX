# Business Loan — Design

**Date:** 2026-07-21
**Status:** Validated with product owner
**Module:** New (extends Customers + Sales)

## Background

The app already has a `Loan`/`LoanRepayment` feature, but it only models one direction:
the business advances cash **to** a customer (e.g. a casual seller needs money before
selling scrap), tracked per account customer, deducted from future purchase payouts.

This design adds the **reverse** direction: a dealer (itself an account customer)
sometimes advances the business cash to buy stock. The business owes that dealer money.
When the business later sells stock to the same dealer, the dealer can choose to have
the sale proceeds applied against what's owed instead of being paid out in full. The
business can also just repay the dealer directly, independent of any sale.

The twist driving most of this design: **only admins may see the amount owed**. A
manager can see that a business loan exists (so they don't get blindsided mid-sale) but
never the figure — unless an admin unlocks it for them via a PIN, mirroring the app's
existing PIN-lock infrastructure but applied to a new purpose (this system currently only
supports a user verifying their *own* PIN; there's no "verify this PIN belongs to some
admin" path yet).

## Decisions made

| Question | Decision |
|---|---|
| Data model | **New tables** (`BusinessLoan`, `BusinessLoanRepayment`), not a `direction` flag on the existing `Loan` table — keeps the new masking logic isolated from the working, unrestricted existing feature |
| Manager + hidden amount, at time of sale | Manager sees an existence-only warning banner (no figure); a "Split Payment" option lets them apply the payoff blindly, gated behind an admin's PIN |
| Manager without the PIN | Leaves the sale **unpaid**, as today — someone with the PIN completes it later via Split Payment on the Unpaid Sales list |
| PIN mechanism | Reuses `User.pinHash` / bcrypt, but a **new** verification path (today's is strictly self-referential) checking against admin users; only counts admins who've **personally set** a PIN — the shared tenant-wide default PIN does not unlock this |
| Reveal shape | The verify-PIN call itself returns the unlocked figures in its response — no separate token/grant to manage; the number lives only in that modal's local state until it's closed |
| Cash-Up integration | **Deferred** — v1 does not affect till reconciliation, unlike the existing Loan feature which does |
| New page | Just a new "Business Loan" tab on the account customer's profile (next to the existing "Loans" tab) — no standalone module-level page |
| Standalone admin actions | Create / manual repay / void are enforced admin-only **server-side**, closing a gap found in the existing Loan feature (its creation is today only UI-gated) |

## 1. Data model

```prisma
model BusinessLoan {
  id              String    @id @default(uuid())
  tenantId        String
  refNumber       String    // BLN-YYYYMMDD-NNNN
  customerId      String    // the dealer
  customer        Customer  @relation(fields: [customerId], references: [id])
  principalAmount Decimal   @db.Decimal(18, 2)
  balanceAmount   Decimal   @db.Decimal(18, 2)
  paymentMethod   PaymentMethod @default(cash)   // cash | eft
  notes           String?
  status          BusinessLoanStatus @default(active)  // active | settled | voided
  voidedAt        DateTime?
  voidedById      String?
  voidReason      String?
  createdByUserId String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  repayments      BusinessLoanRepayment[]

  @@unique([tenantId, refNumber])
  @@index([tenantId])
  @@index([tenantId, customerId])
  @@index([tenantId, status])
}

model BusinessLoanRepayment {
  id              String    @id @default(uuid())
  tenantId        String
  refNumber       String    // BLR-YYYYMMDD-NNNN
  businessLoanId  String
  businessLoan    BusinessLoan @relation(fields: [businessLoanId], references: [id], onDelete: Cascade)
  customerId      String
  amount          Decimal   @db.Decimal(18, 2)
  paymentMethod   PaymentMethod @default(cash)
  notes           String?
  createdByUserId String?
  createdAt       DateTime  @default(now())
  saleId          String?   // set when auto-applied from a sale's split payment
  sale            Sale?     @relation(fields: [saleId], references: [id])
}

enum BusinessLoanStatus {
  active
  settled
  voided
}
```

`Sale` gains two fields mirroring `Purchase`'s existing pattern:
`businessLoanDeductionAmount Decimal?`, `splitPayments Json?`, plus the
`businessLoanRepayments BusinessLoanRepayment[]` back-relation.

## 2. Service layer (`businessLoanService.ts`)

Mirrors `loanService.ts` field-for-field, with masking baked into the read path rather
than bolted on after:

- `createBusinessLoan(data, createdByUserId)` — validates dealer exists, not blacklisted,
  active; sets `balanceAmount = principalAmount`; generates `BLN-...` ref.
- `createBusinessLoanRepayment(data, createdByUserId)` — standalone manual repayment;
  rejects if loan voided/settled or `amount > balanceAmount`; flips to `settled` at zero.
- `applyBusinessLoanRepaymentTx(tx, customerId, amount, createdByUserId, saleId?)` — FIFO
  paydown across that dealer's active business loans (oldest first), one
  `BusinessLoanRepayment` row per loan touched, called from sale processing.
- `voidBusinessLoan(id, data, voidedById)` — only if zero repayments exist.
- `getCustomerBusinessLoanSummaryForRole(customerId, role)` — the masking boundary:
  - any role → `{ hasOutstanding: boolean }`
  - `admin` only → adds `{ outstanding, totalAdvanced, totalRepaid, loans: [...] }`
- `verifyAdminPinForBusinessLoan(tenantId, customerId, pin)` — loops `User`s with
  `role: 'admin'` **and** a non-null `pinHash` in the tenant, `bcrypt.compare`s the
  submitted PIN against each; on a match, returns the unlocked summary (same shape as the
  admin branch above) in the same call. No match across any admin → generic failure (never
  reveals which admins exist or whether any admin has set a PIN, to avoid leaking
  information about staff to a manager).

Typed errors mirror the existing feature: `BusinessLoanNotFoundError`,
`BusinessLoanAlreadySettledError`, `BusinessLoanAlreadyVoidedError`,
`BusinessLoanHasRepaymentsError`, `RepaymentExceedsBalanceError`,
`CustomerBlacklistedError`, `CustomerInactiveError`.

## 3. API routes

- `GET /api/customers/[id]/business-loans` — returns the role-shaped summary above
  (manager gets `hasOutstanding` only; admin gets full figures) plus the loan list when
  admin.
- `POST /api/customers/[id]/business-loans` — create. **Admin-only, enforced server-side**
  (403 for anyone else, unlike the existing Loan feature's UI-only gate).
- `POST /api/business-loans/[id]/repay` — manual repayment. Admin-only.
- `POST /api/business-loans/[id]/void` — void. Admin-only.
- `POST /api/business-loans/verify-pin` — body `{ customerId, pin }`. Available to any
  authenticated staff member (a manager is the one calling it), but only succeeds if the
  PIN matches a qualifying admin. Rate-limited: 3 failed attempts per customer per session
  triggers a short lockout, mirroring the existing PIN-lock overlay's "3 tries" pattern.
  Every attempt (success or failure) is logged — who attempted, which customer, outcome,
  timestamp — independent of the standard Prisma audit-log middleware, since this is a
  sensitive **read** being exposed outside its normal audience rather than a write.

## 4. Sales integration

Two settlement paths coexist on a sale, deliberately not merged:

- **"Record Payment"** (existing, unchanged) — partial-friendly, cash/eft only, no loan
  awareness. Stays exactly as it is today for sales that have nothing to do with a
  business loan.
- **"Split Payment"** (new) — available both at sale creation (`sales/new/page.tsx`) and
  when settling a pending sale (Unpaid Sales list). Requires **full settlement in one
  call** (cash + eft + businessLoan legs must sum to exactly the outstanding amount),
  mirroring `purchaseService.processSplitPayment` exactly. The business-loan leg starts
  locked (lock icon, "Enter admin PIN" prompt); unlocking it calls
  `verify-pin` and fills in the real balance for that modal session only.

Buyer-side banner: if `hasOutstandding` is true for the sale's customer, a warning shows
on both the new-sale screen and the unpaid-sale row — "This customer has a pending
business loan" — visible to every role, with no figure attached.

Manager flow when they don't have a PIN: sale gets saved as `status: 'pending'` (today's
existing unpaid-sale mechanic, no change needed there) and picked up later via Split
Payment by whoever has one.

## 5. New tab: "Business Loan" (customer profile)

Sits beside the existing "Loans" tab, same gate (`customerType === 'account'` only).

- **Manager view**: a badge ("Business loan outstanding" / "No business loan") and a note
  that figures are admin-only. No create/repay/void actions available.
- **Admin view**: same shape as today's Loans tab — ref/principal/balance/status/date
  table, an "Outstanding Balance" header figure, "+ New Loan" button, and per-row
  repay/void actions.

## 6. Explicitly out of scope for v1

- **Cash-Up integration** — advances and repayments do not affect the day's till
  reconciliation. Worth a code comment flagging this as deliberate, not an oversight, so
  it isn't "fixed" later without revisiting the product conversation.
- A standalone cross-dealer "Business Loans" module page — this lives only inside each
  dealer's own account profile for now.

## 7. Testing

`tsc --noEmit` and `next lint` clean before every push, matching how this session has
worked throughout. No automated browser/E2E pass from the agent — the product owner
exercises the actual flows themselves (admin creating/repaying a loan, a manager hitting
the warning + PIN gate mid-sale, an admin completing a Split Payment) before considering
any implementation slice done.
