# MoMo statement vs cash-up reconciliation

2026-08-17

## Problem

Purchases are mostly paid out via mobile money. The MoMo Statement upload
(`MomoStatementImport`) already parses the day's provider CSV and stores a
`closingBalance`, but it's purely informational — the cash-up submit flow
never looks at it. There's no way to catch a discrepancy between what the
system expects and what actually happened in the mobile money account
before a cash-up gets locked in.

## Design

When a cash-up is submitted (`submitCashUp` in `cashUpService.ts`), right
after `fullExpected` (expected cash) is computed:

1. Look up `getMomoStatementForDate(cashUp.sessionDate)`.
2. If no statement exists for that date, skip the check entirely — submit
   proceeds exactly as it does today.
3. If a statement exists, compare `fullExpected` to the statement's
   `closingBalance` (exact match, both Decimal).
4. On a mismatch:
   - Any role other than `admin` → submission is blocked. A typed error
     (`MomoBalanceMismatchError`) carries both figures and the difference
     for the UI to display.
   - `admin` → same block by default. If the request includes
     `momoOverrideReason` (min 5 chars), the mismatch is allowed through
     and the reason (plus both figures) is recorded on `CashUp.notes`
     with a distinguishing prefix — mirrors `MANUAL_REVERSAL_PREFIX` in
     `loanService.ts`. Manager and below never get this option, even with
     a reason.

No schema migration: reuses `MomoStatementImport.closingBalance` (already
stored) and `CashUp.notes` (already a free-text field).

## Changes

- `src/lib/schemas/cashup.ts` — add optional `momoOverrideReason` to
  `SubmitCashUpSchema` (min 5, max 500 chars when present).
- `src/lib/services/cashUpService.ts` — `submitCashUp` gains the lookup +
  comparison + role check; new `MomoBalanceMismatchError` class carrying
  `expected`, `statementBalance`, `difference`.
- `src/app/api/cashup/[id]/route.ts` — PUT handler passes the caller's
  role into `submitCashUp` and maps `MomoBalanceMismatchError` to a 422
  with the structured figures in the response body (not just a message
  string), so the UI can render the override prompt without re-parsing
  text.
- `src/app/app/(modules)/cashup/page.tsx` — submit flow catches the 422,
  shows expected vs statement vs difference. Admins additionally see a
  reason field + "Override & Submit" button that resubmits with
  `momoOverrideReason` set. Non-admins see the block with no override
  affordance.

## Out of scope

- Forcing a MoMo statement to exist before cash-up can be submitted at
  all (current behavior — no statement, no check — is preserved).
- Any change to how the statement itself is parsed/imported.
- Extending the override to managers.
