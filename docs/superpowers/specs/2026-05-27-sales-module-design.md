# Sales Module — Mirror of Purchase Module

**Date:** 2026-05-27  
**Status:** Approved for implementation

---

## Context

The purchase module is a production-grade POS transaction system with a 3-column layout, scale weigh mode per line, photo upload, deferred payment (unpaid/credit), inline pending transactions panel, and a full detail/history view. The sales module already has a complete backend (Prisma models, service layer, Zod schemas, API routes) but its frontend is a different 2-column layout with no weigh mode, no photos, and inconsistent design patterns.

Goal: Rework all sales frontend pages to mirror the purchase module exactly — same 3-column POS layout, same design tokens (ModalTitleBar/ModalBtn), same feature set — with only the semantic differences between buying and selling.

---

## Semantic Differences: Purchase vs Sale

| Aspect | Purchase | Sale |
|--------|----------|------|
| Party label | Supplier | Buyer |
| Ref prefix | `PUR-` | `SAL-` |
| Left panel toggle | Casual / Account | Walk-in / Account |
| Walk-in option | No (always registered) | Yes (name + ID + phone) |
| Stock direction | IN | OUT + stock availability check |
| Price field label | Buy Price | Sell Price |
| Loan deduction | Yes | No |
| VAT264 document | Yes | No |
| Vehicle reg / WB ticket | Yes | No |
| Weigh mode (scale) | Yes | Yes (identical) |
| Photos | Yes (`photoR2Keys[]`) | Yes (add `photoR2Keys[]`) |
| Deferred payment | Yes (pending status) | Yes (pending status) |
| Compliance doc | VAT264 | Packing List |

---

## Backend Changes Required

### 1. `prisma/schema.prisma` — Add missing fields to `Sale`

```prisma
model Sale {
  // ADD these (currently missing vs Purchase):
  amountPaid           Decimal?  @db.Decimal(18, 2)
  hasOutstandingBalance Boolean  @default(false)
  photoR2Keys          String[]  @default([])
}
```

### 2. `src/lib/services/saleService.ts` — Add `markSalePaid()`

Mirror `markPurchasePaid()` from purchaseService:
- Validate sale exists and is pending
- Prevent overpayment
- Create Payment record for cash-up
- Set status to 'completed' when fully settled
- Update `amountPaid` and `hasOutstandingBalance`

### 3. `src/app/api/sales/[id]/mark-paid/route.ts` — New endpoint

`PATCH /api/sales/[id]/mark-paid` — mirror `/api/purchases/[id]/mark-paid`

### 4. `src/app/api/sales/[id]/photos/route.ts` — New endpoint

`PATCH /api/sales/[id]/photos` — mirror `/api/purchases/[id]/photos`

---

## Frontend Pages

### Page 1: Create Sale — `src/app/app/(modules)/sales/new/page.tsx`

**Complete rewrite** from current 2-column layout to 3-column POS layout:

#### Left column (310px fixed)
- Walk-in / Account toggle (same visual as Casual/Account in purchase)
  - Walk-in: Name* (required), ID Number (optional), Phone (optional)
  - Account: customer selector widget (same `AccountSelectorPanel`) with blacklist warning badge
- Invoice # input (optional reference)
- Notes textarea
- Payment type radio buttons: Unpaid · Cash · EFT · Cheque · AmpoPay
  - Selecting Unpaid disables the Save button; selecting anything else disables Save Unpaid

#### Center column (flex)
Product grid — same columns as purchase:
- Product select (grouped by category)
- Qty (kg) input (3 decimal places)
- Sell Price (R) input (2 decimal places)
- Sub Total (read-only, calculated)
- **Stock** column — shows `X.XXX available`. Turns red and blocks Save if qty > available stock
- Scale toggle button (⚖)
- Delete row button

**Weigh mode sub-row** (blue `#EFF6FF` background, toggled per line — identical to purchase):
- Scale selector [1][2][3]
- Gross input + [Read] button → calls `/api/scales/{n}/read`
- Tare input + [Read] button
- Net display (read-only = gross − tare)
- Deduction input + Paid Qty display
- Tare Reason (if tare > 0) + Deduction Reason (if deduction > 0)

**Add Line** button below grid.

**Pending Sales panel** (165px fixed height, below product grid):
- Lists current buyer's unpaid sales (fetched when buyer selected)
- Columns: Ref #, Items, Balance, Date, [⋮ actions]
- Action menu per row: Process Payment · Print Slip · View Details

#### Right column (250px fixed)
- Scale 1 digital display (green text on black — same component as purchase)
- Scale 2 digital display
- Product photo uploader (drag-and-drop, same `PhotoUploader` component)

#### Bottom totals panel
- Sub Total / VAT (15% or 0% if buyer is zero-rated) / Total
- `[Save Unpaid]` button (gold — disabled unless payment = Unpaid)
- `[Save Sale ▶]` button (green — disabled if payment = Unpaid OR stock check fails)

---

### Page 2: Sales List — `src/app/app/(modules)/sales/page.tsx`

**Rework** to match purchases list exactly:

#### Filters bar
- Search input (ref #, buyer name, ID number)
- Status dropdown (All · Pending · Completed · Voided)
- Payment Method dropdown (All · Cash · EFT · Cheque · AmpoPay · Unpaid)
- Date From / Date To
- Clear Filters button

#### DataTable columns
| Column | Notes |
|--------|-------|
| Ref # | Sortable, monospace |
| Buyer | Name + ID chip (same avatar pattern as purchase Customer column) |
| Lines | Count badge |
| Total | Sortable, E-currency |
| Method | Payment badge |
| Date | Sortable |
| Status | StatusBadge (completed / pending / voided) |

#### Row actions
- View Full Detail
- Print Receipt
- Void Sale (manager/admin only, danger)

#### Inline detail panel (same slide-up panel as purchase)
- Left: Buyer info (name, ID, phone, notes, payment method, date)
- Right: Line items table (Product, Qty, Sell Price, Line Total)

#### Design tokens
Replace any `DialogHeader`/`DialogTitle`/`Button` in void dialog with `ModalTitleBar` + `ModalBtn`.

---

### Page 3: Sale Detail — `src/app/app/(modules)/sales/[id]/page.tsx`

**Rework** to match purchases/[id]/page.tsx:

- Header: `[← Sales]` · Ref # · Status badge · Payment badge · `[New Sale]`
- Voided banner (red, shows void reason + timestamp) — if `status === 'voided'`
- Pending banner (amber) with outstanding balance — if `status === 'pending'`
- **Buyer card** (left): Name, ID Number, Phone, Notes
- **Lines table** (right): Product, Qty, Sell Price, Line Total, weight details (Gross/Tare if present)
- **Photos section**: `PhotoViewer` component (same as purchase detail)
- **Action buttons**: Print Receipt · Print Packing List · Void Sale (manager, danger)
- All dialogs (void confirm) use `ModalTitleBar` + `ModalBtn`

---

### Page 4: Unpaid Sales — `src/app/app/(modules)/sales/unpaid/page.tsx`

**New page** — mirrors `purchases/unpaid/page.tsx`:

- Grand total outstanding banner at top
- Grouped by buyer:
  - Account customers grouped by `customerId`
  - Walk-in buyers grouped by `buyerName` (no customer record)
- Per group header: buyer avatar/initials · name · ID (if known) · total outstanding · count of sales
- Per sale row: Ref # · Item count · Total · Amount Paid · Balance · Date · `[Pay]` button
- `[Pay]` opens a payment dialog: enter amount, select method (Cash/EFT/Cheque/AmpoPay), confirm
- Uses `ModalTitleBar` + `ModalBtn` for the payment dialog

---

## Navigation

Add "Unpaid Sales" link to the sales module navigation (same position as "Unpaid" in purchases nav).

---

## Stock Availability Check

The stock check per line in the create form:
- Fetches current stock on hand for the selected product: `GET /api/stock/on-hand?productId={id}`
- Shows available qty inline in the Stock column
- Disables Save if **any** line's qty > available stock
- The service layer (`createSale`) already performs a stock check inside the transaction — the UI check is a UX guard only, not the source of truth

---

## Design Tokens

All new/reworked dialogs, modals, and action buttons use:
- `ModalTitleBar` from `@/components/ui/dialog`
- `ModalBtn` from `@/components/ui/dialog` (variant: primary / outline / danger)
- Color tokens from `@/lib/design-tokens`
- No raw `Button` from shadcn in modal contexts

---

## Files Changed / Created

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `amountPaid`, `hasOutstandingBalance`, `photoR2Keys` to `Sale` |
| `src/lib/services/saleService.ts` | Add `markSalePaid()`, `updateSalePhotos()` |
| `src/app/api/sales/[id]/mark-paid/route.ts` | New: PATCH endpoint |
| `src/app/api/sales/[id]/photos/route.ts` | New: PATCH endpoint |
| `src/app/app/(modules)/sales/new/page.tsx` | Full rewrite — 3-column POS layout |
| `src/app/app/(modules)/sales/page.tsx` | Rework — match purchase list |
| `src/app/app/(modules)/sales/[id]/page.tsx` | Rework — match purchase detail |
| `src/app/app/(modules)/sales/unpaid/page.tsx` | New page — mirror purchases/unpaid |

---

## Verification

1. Create a sale with a walk-in buyer, 2 product lines, one in weigh mode → saved correctly, SAL- ref generated, stock OUT recorded
2. Create a sale with an account customer → buyer info pulled from customer record, blacklist check works
3. Save as Unpaid → status = pending, appears in Unpaid Sales page
4. Pay an unpaid sale → balance cleared, status = completed, payment record created
5. Stock check → entering qty > available turns cell red, Save button disabled
6. Void a completed sale → stock reversal, voided banner shows on detail page
7. Photos → upload on create form, visible in detail page photo viewer
8. Print Receipt → SAL- ref, "SALES RECEIPT" header, correct buyer name
9. Print Packing List → generates correctly
10. `npx tsc --noEmit` → 0 errors
11. Vercel build passes
