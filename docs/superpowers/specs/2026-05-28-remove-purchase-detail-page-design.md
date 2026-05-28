# Remove Purchase Detail Page & Enrich InlineDetailPanel — Design Spec

**Date:** 2026-05-28
**Status:** Approved

---

## Problem Statement

The purchase detail page (`/app/purchases/[id]`) is redundant:
- Customer info and product lines are already shown in the InlineDetailPanel on the purchases list
- Photos are managed from the scale module
- Print / Download VAT264 / Void are all accessible from the 3-dot row actions
- Weight/tare data is an audit-only concern, not a day-to-day cashier need
- The page has no consistent title, showing raw route strings in the browser/nav

The two things on the detail page that are genuinely useful but missing from the InlineDetailPanel — the voided purchase banner and the loan deduction breakdown — can be added to the panel in a few lines.

---

## Decision

**Option A selected:** Delete the page, enrich both InlineDetailPanels (purchases list + unpaid list).

---

## Scope

### Files to delete
| File | Action |
|------|--------|
| `src/app/app/(modules)/purchases/[id]/page.tsx` | Delete entirely |

### Files to modify
| File | Change |
|------|--------|
| `src/app/app/(modules)/purchases/page.tsx` | Remove "View Full Detail" row action; add voided banner + loan breakdown to InlineDetailPanel |
| `src/app/app/(modules)/purchases/unpaid/page.tsx` | Remove "View Full Detail" row action; add voided banner + loan breakdown to InlineDetailPanel |
| `src/app/app/(modules)/purchases/new/page.tsx` | Remove "View Full Details", "Attach Photo", "Send Receipt" from pending purchases mini-menu; remove `onViewPurchase` prop/button from `PrintResultModal` call |

---

## InlineDetailPanel Additions

Both panels already fetch `/api/purchases/${selectedId}` (full purchase record). No API or type changes needed — all required fields are already in the response.

### 1. Voided banner

**Condition:** `detail.status === 'voided'`

**Placement:** Top of the panel, before customer info.

**Content:** Amber/red notice strip showing:
- Label: "Reversed Purchase"
- Void reason: `detail.voidReason`
- Void date: formatted `detail.voidedAt`

**Style:** Consistent with existing warning patterns in the system (amber background, border, small text).

### 2. Loan deduction breakdown

**Condition:** `detail.loanDeductionAmount` is present and `> 0`

**Placement:** Replaces (or follows) the existing "Total Payout" footer line at the bottom of the products table.

**Content — three lines:**
```
Gross Payout:      R X,XXX.XX
Loan Deduction:  - R   XXX.XX
Cash Paid Out:     R X,XXX.XX
```

`Cash Paid Out = totalAmount - loanDeductionAmount`

**Style:** Same monospace/right-aligned pattern as the existing Total Payout line. Loan Deduction line in muted/gray. Cash Paid Out in bold green (same as Total Payout today).

---

## Removals from `purchases/new/page.tsx`

The pending purchases mini-menu (bottom-right panel on the new purchase form) currently has:

| Item | Action |
|------|--------|
| Process Payment | Keep |
| Print Slip | Keep |
| Attach Photo | **Remove** — photo upload is on the scale |
| Send Receipt | **Remove** — no destination without the detail page |
| View Full Details | **Remove** — no destination |
| View Customer History | Keep |

The `PrintResultModal` is shown after a successful purchase. It has an `onViewPurchase` callback that navigates to the detail page. **Remove that button** from the modal's rendered output for the purchase context. The modal's `onClose` (back to new purchase) and `onDone` (go to dashboard) remain.

---

## Verification Checklist

1. Navigating to `/app/purchases/{any-id}` returns 404
2. Purchases list InlineDetailPanel shows voided banner when `status === 'voided'`
3. Purchases list InlineDetailPanel shows loan breakdown when `loanDeductionAmount > 0`
4. Unpaid purchases panel shows the same additions
5. New purchase form pending panel no longer shows "Attach Photo", "Send Receipt", "View Full Details"
6. PrintResultModal after a completed purchase no longer has a "View Purchase" button
7. All other row actions (Print Slip, Download VAT264, Reverse Purchase) still work
8. `npx tsc --noEmit` → 0 errors
