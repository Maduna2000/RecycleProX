# RENOV PRO — FULL SYSTEM AUDIT REPORT

**Date:** 2023-10-27
**Auditor:** Jules (AI Software Engineer)

---

## SECTION A — MODULE COMPLETENESS

### MODULE: 1. PORTAL
**Status:** PARTIAL
**EXISTS:**
- `src/app/app/(portal)/dashboard/page.tsx` — Dashboard exists with tile grid.
- `src/app/api/reports/today/route.ts` — Stats polled for dashboard.
**MISSING:**
- Top-right live scale readings (UI component exists but not active in header).
- Status bar at the bottom (version, user, time) is not fully implemented per requirements (only static text).
- Module tab bar (currently uses a breadcrumb-style nav instead of a persistent tab bar).

### MODULE: 2. ACCOUNTS (Customers)
**Status:** PARTIAL
**EXISTS:**
- `src/lib/services/customerService.ts` — Full CRUD logic.
- `src/app/app/(modules)/customers/page.tsx` — List view.
- `src/app/app/(modules)/customers/[id]/page.tsx` — Detail/Edit view.
**MISSING:**
- SA ID number validation logic is missing in the service (currently just checks length/presence).
- Quick-create casual customer during purchase is missing (form exists but not integrated as a "quick" step in the POS).
**WRONG:**
- Customer balance calculation exists in `paymentService.ts` but is not displayed on the customer detail page.

### MODULE: 3. CASUAL DETAILS
**Status:** PARTIAL
**EXISTS:**
- `src/app/app/(modules)/casual/page.tsx` — Page with A-Z filter.
- `src/app/api/casual/import/route.ts` — Import function exists.
**MISSING:**
- Dedicated "Casual View" is just a filtered version of Accounts; does not have the specialized photo/ID capture workflow optimized for high-speed walk-ins.

### MODULE: 4. PURCHASES
**Status:** PARTIAL
**EXISTS:**
- `src/lib/services/purchaseService.ts` — `createPurchase()` and `voidPurchase()` implemented with transactions.
- `src/app/app/(modules)/purchases/new/page.tsx` — POS entry form with scale and signature integration.
**MISSING:**
- **Auto-generation of VAT264 PDF and Purchase Note PDF** after confirmation is missing in the service layer.
- `vat264R2Key` and `purchaseNoteR2Key` are never written to the `Purchase` record in the database.
**WRONG:**
- `purchaseService.ts` line 150: uses `.toFixed(2)` on loan deduction amount.

### MODULE: 5. SALES
**Status:** PARTIAL
**EXISTS:**
- `src/lib/services/saleService.ts` — `createSale()` handles Stock OUT.
- `src/app/app/(modules)/sales/new/page.tsx` — Page exists.
**MISSING:**
- Packing List PDF generation is missing.
- Thermal receipt print prompt in the UI after save is missing.

### MODULE: 6. PHOTO VIEWER
**Status:** PARTIAL
**EXISTS:**
- `src/app/app/(modules)/photos/page.tsx` — Basic photo browser.
- `src/app/api/photos/search/route.ts` — Search API exists.
**MISSING:**
- **MediaFile model** is missing from `schema.prisma`. Photos are currently stored as `String[]` on records, violating the "central media registry" rule.
- Split-table layout (transactions top, items bottom) is not implemented.
- Bulk PDF generation and export missing.

### MODULE: 7. PAYMENTS
**Status:** PARTIAL
**EXISTS:**
- `src/lib/services/paymentService.ts` — Logic for settling account balances.
- `src/app/app/(modules)/payments/page.tsx` — UI exists.
**MISSING:**
- Duplicate payment prevention (ticket-based) is not implemented.
- Pay multiple tickets in one payment logic is missing.

### MODULE: 8. CASH-UP
**Status:** PARTIAL
**EXISTS:**
- `src/lib/services/cashUpService.ts` — End-of-day math implemented.
- `src/app/app/(modules)/cashup/page.tsx` — UI exists.
**MISSING:**
- Drill-down [View] links per line showing source transactions are missing in the UI.
- On approval: setting next day opening float via `FloatMovement` is incomplete (model missing).

### MODULE: 9. POLICE REGISTER
**Status:** PARTIAL
**EXISTS:**
- `src/lib/pdf/policeRegister.ts` — PDF generator.
- `src/app/api/police-register/route.ts` — API route.
**MISSING:**
- Disposal (sales) inclusion in the register is missing (currently only shows purchases).
- Police visit history tracking (officer name, badge, date) UI is missing.

### MODULE: 10. PRICING
**Status:** PARTIAL
**EXISTS:**
- `src/app/app/(modules)/price-groups/page.tsx` — UI for groups.
**MISSING:**
- PriceHistory is written in `productService.ts` but the model should track more details per requirement (tier-based logic in pricing module).
- Inline editable "Top Product Prices" grid with tiers as columns is missing.

### MODULE: 11. LOANS
**Status:** COMPLETE
**EXISTS:**
- `src/lib/services/loanService.ts` — Full CRUD and repayment logic.
- Popup trigger in `NewPurchasePage.tsx` correctly checks for outstanding balance.

### MODULE: 12. SCALE STOCK TAKE
**Status:** PARTIAL
**EXISTS:**
- `src/lib/services/stocktakeService.ts` — Logic for adjustments.
- `src/app/app/(modules)/stocktake/page.tsx` — UI exists.
**MISSING:**
- Month-end enforcement/dashboard warnings are missing.

### MODULE: 13. STOCK LEVEL GRID
**Status:** PARTIAL
**EXISTS:**
- `src/app/app/(modules)/stock/page.tsx` — Movements and on-hand views.
**MISSING:**
- Product-to-product transfer (upgrade/downgrade) logic and API.
- Low stock alerts on dashboard.

### MODULE: 14. REPORTS
**Status:** PARTIAL
**EXISTS:**
- Basic KPI aggregation in `reports/today` API.
**MISSING:**
- Two-panel tree UI layout.
- Profit Summary, Cash Loans, and Cancelled reports are missing.

### MODULE: 15. FLOAT
**Status:** PARTIAL
**EXISTS:**
- `src/lib/services/floatService.ts` — Basic opening/closing logic.
**MISSING:**
- **FloatMovement table** (ledger) is missing. Current implementation uses a single `CashFloat` record per day.

### MODULE: 16. AUDIT LOG
**Status:** PARTIAL
**EXISTS:**
- `src/lib/db/prisma.ts` — Middleware records INSERT/UPDATE/DELETE.
**MISSING:**
- `AsyncLocalStorage` integration for `userId` is missing (currently uses best-effort extraction from the payload).

---

## SECTION B — ZERO TOLERANCE VIOLATIONS

### B1. Decimal.js violations
**CRITICAL:** Every match for `.toFixed()` in service files (Rule: money MUST use Decimal.js only):
- `src/lib/services/cashUpService.ts:49`: `openingBalance.toFixed(2)` (logging)
- `src/lib/services/cashUpService.ts:52`: `openingBalance.toFixed(2)` (logging)
- `src/lib/services/cashUpService.ts:63`: `openingBalance: openingBalance.toFixed(2)` (DB write)
- `src/lib/services/cashUpService.ts:185`: `variance: variance.toFixed(2)` (logging)
- `src/lib/services/expenseService.ts:57`: `amount: amount.toFixed(2)` (DB write)
- `src/lib/services/expenseService.ts:58`: `vatAmount: vatAmount.toFixed(2)` (DB write)
- `src/lib/services/expenseService.ts:155`: `total: total.toFixed(2)` (return value)
- `src/lib/services/floatService.ts:14`: `new Decimal(data.openingAmount).toFixed(2)` (DB write)
- `src/lib/services/floatService.ts:19`: `new Decimal(data.openingAmount).toFixed(2)` (DB write)
- `src/lib/services/floatService.ts:75`: `amount.toFixed(2)` (DB write)
- `src/lib/services/floatService.ts:77`: `amount.toFixed(2)` (logging)
- `src/lib/services/loanService.ts:113`: `repayAmount: repayAmount.toFixed(2)` (logging)
- `src/lib/services/loanService.ts:113`: `newBalance: newBalance.toFixed(2)` (logging)
- `src/lib/services/loanService.ts:147`: `principal: principal.toFixed(2)` (logging)
- `src/lib/services/loanService.ts:166`: `currentBalance.toFixed(2)` (error message)
- `src/lib/services/loanService.ts:197`: `amount: repayAmount.toFixed(2)` (logging)
- `src/lib/services/loanService.ts:197`: `newBalance: newBalance.toFixed(2)` (logging)
- `src/lib/services/loanService.ts:306`: `totalAdvanced: totalAdvanced.toFixed(2)` (return value)
- `src/lib/services/loanService.ts:307`: `totalRepaid: totalRepaid.toFixed(2)` (return value)
- `src/lib/services/loanService.ts:308`: `outstanding: outstanding.toFixed(2)` (return value)
- `src/lib/services/loanService.ts:337`: `advanced: advanced.toFixed(2)` (return value)
- `src/lib/services/loanService.ts:338`: `repaid: repaid.toFixed(2)` (return value)
- `src/lib/services/loanService.ts:339`: `netCashOut: netCashOut.toFixed(2)` (return value)
- `src/lib/services/paymentService.ts:205`: `totalPurchases: totalPurchases.toFixed(2)` (return value)
- `src/lib/services/paymentService.ts:205`: `totalPaid: totalPaid.toFixed(2)` (return value)
- `src/lib/services/paymentService.ts:205`: `balance: balance.toFixed(2)` (return value)
- `src/lib/services/purchaseService.ts:150`: `deduction.toFixed(2)` (function arg)
- `src/lib/services/purchaseService.ts:157`: `totalAmount: totalAmount.toFixed(2)` (logging)
- `src/lib/services/saleService.ts:134`: `totalAmount: totalAmount.toFixed(2)` (logging)
- `src/lib/services/stockService.ts:81`: `totalIn: totalIn.toFixed(3)` (return value)
- `src/lib/services/stockService.ts:82`: `totalOut: totalOut.toFixed(3)` (return value)
- `src/lib/services/stockService.ts:83`: `onHand: onHand.toFixed(3)` (return value)
- `src/lib/services/stocktakeService.ts:77`: `grossQty: ...toFixed(4)` (DB write)
- `src/lib/services/stocktakeService.ts:78`: `tareQty: ...toFixed(4)` (DB write)
- `src/lib/services/stocktakeService.ts:86`: `systemQty: systemQty.toFixed(4)` (upsert data)
- `src/lib/services/stocktakeService.ts:87`: `countedQty: counted.toFixed(4)` (upsert data)
- `src/lib/services/stocktakeService.ts:88`: `variance: variance.toFixed(4)` (upsert data)
- `src/lib/services/stocktakeService.ts:93-95`: multiple `.toFixed(4)` for create data.
- `src/lib/services/stocktakeService.ts:101`: `variance: variance.toFixed(4)` (logging)

### B2. console.log violations
- **Status:** PASS. All logging uses `pino`.

### B3. Auth violations
**CRITICAL:** Every API route must have `const session = await auth()` as Line 1.
- `src/app/api/ping/route.ts`: **MISSING** auth check.
- `src/app/api/r2/test/route.ts`: **MISSING** auth check.
- `src/app/api/scales/[n]/read/route.ts`: Auth check is on Line 19 (starts with try block).
- `src/app/api/scales/[n]/status/route.ts`: Auth check is on Line 13.
- `src/app/api/loans/[id]/route.ts`: Auth check is on Line 11.
- `src/app/api/loans/[id]/repay/route.ts`: Auth check is on Line 17.
- `src/app/api/loans/[id]/void/route.ts`: Auth check is on Line 16.
- `src/app/api/purchases/[id]/receipt/route.ts`: Auth check is on Line 17.
- `src/app/api/expenses/[id]/attachments/[attachId]/route.ts`: Auth check is on Line 11.
- `src/app/api/price-groups/[id]/copy-from-defaults/route.ts`: Auth check is on Line 10.
- `src/app/api/sales/[id]/receipt/route.ts`: Auth check is on Line 17.
- `src/app/api/customers/[id]/loans/route.ts`: Auth check is on Line 10.
- `src/app/api/customers/[id]/documents/[docId]/route.ts`: Auth check is on Line 11.
- `src/app/api/cashup/[id]/route.ts`: Auth check is on Line 12.
- `src/app/api/cashup/[id]/approve/route.ts`: Auth check is on Line 12.
- `src/app/api/police-visits/[id]/route.ts`: Auth check is on Line 21.

### B4. Direct Prisma in routes
- `src/app/api/police-register/route.ts`: Direct calls to `prisma.purchase.findMany` and `prisma.systemSettings.findMany`.
- `src/app/api/reports/today/route.ts`: Direct calls to `prisma.purchase.aggregate`, `prisma.sale.aggregate`, `prisma.cashUp.findFirst`.
- `src/app/api/users/route.ts`: Direct calls to `prisma.user.findMany`, `prisma.user.create`.
- `src/app/api/audit-log/route.ts`: Direct call to `prisma.auditLog.findMany`.
- `src/app/api/settings/route.ts`: Direct calls to `prisma.systemSettings.findMany`.
- `src/app/api/customers/[id]/documents/route.ts`: Direct call to `prisma.customerDocument.create`.
- `src/app/api/cashup/live-stats/route.ts`: Direct aggregate calls.

### B5. Missing transactions
- **Status:** PASS. Multi-table writes in `purchaseService.ts` and `saleService.ts` are inside single transactions.

### B6. Integer IDs
- **Status:** PASS. Business models use UUID. `AuditLog.id` uses `BigInt @default(autoincrement())` which is acceptable.

---

## SECTION C — DATABASE SCHEMA AUDIT

### C1. Missing Models
- `MediaFile` (Centralized media tracking)
- `FloatMovement` (Ledger for float top-up/withdrawal)
- `TransactionPayment` (Many-to-many link for paying multiple tickets)

### C2. Missing Fields on existing models
- **PurchaseLine:** `deductionQty`, `deductionReason` (missing)
- **Purchase:** `signatureR2Key`, `vat264R2Key`, `purchaseNoteR2Key` (present)
- **Purchase:** `vehicleReg`, `wbTicketNumber`, `pdfEmailed`, `hasOutstandingBalance` (missing)
- **CashUp:** `financialPeriodBalance` (missing)
- **Customer:** `tradeCommodities` (Json, present), `idPhotoR2Key` (present), `blacklisted`, `blacklistReason`, `blacklistedAt` (present)
- **Customer:** `policeRegisterNo`, `primaryFunction` (present)
- **FloatMovement (if it existed):** `movementType`, `amount`, `balanceAfter`, `referenceNote`
- **Product:** `minStockLevel` (present), `buyMarginPct` (present), `sortOrder` (present)

### C3. Missing Indexes
- **StockMovement:** `@@index([productId, createdAt])` (missing)
- **Purchase:** `@@index([customerId, status, createdAt])` (missing)
- **AuditLog:** `@@index([model, recordId])` (Note: schema has `[tableName, recordId]`)
- **MediaFile:** (Model missing entirely)

### C4. Enum vs String
- `StockMovement.source`: Stored as `String` (should be Enum).
- `StockMovement.direction`: Stored as `StockDirection` enum (correct).
- `Purchase.status`: Stored as `TxStatus` enum (correct).

---

## SECTION D — API COMPLETENESS

### D1. Customers
- GET `/api/customers/[id]/balance` — **MISSING**
- GET `/api/customers/lookup` — **MISSING** (Note: `customerService.lookupByIdNumber` exists but no dedicated route found)

### D2. Purchases
- GET `/api/purchases/[id]/receipt` — **PARTIAL** (Exists, but thermal logic is limited to PDF)
- PATCH `/api/purchases/[id]/mark-paid` — **EXISTS**

### D3. Sales
- GET `/api/sales/[id]/packing-list` — **MISSING**

### D4. Stock
- POST `/api/stock/transfer` — **MISSING**
- GET `/api/stock/export` — **MISSING** (Note: `/api/stock/grid/export` exists)
- GET `/api/stock/low-stock` — **MISSING**

### D5. Cash-Up
- GET `/api/cashup/[id]/totals` — **MISSING** (Logic is inside `submit` but no standalone GET for live computation)

### D6. Float
- GET `/api/float/current` — **MISSING**
- GET `/api/float/history` — **MISSING**
- POST `/api/float/top-up` — **MISSING**
- POST `/api/float/withdraw` — **MISSING**

### D7. Loans
- GET `/api/loans/[id]/statement` — **MISSING**
- GET `/api/loans/customer/[customerId]/outstanding` — **MISSING** (Note: `/api/customers/[id]/loans` exists but is a summary)

### D9. Reports
- GET `/api/reports/cash-loans` — **MISSING**
- GET `/api/reports/cancelled` — **MISSING**
- GET `/api/reports/profit-summary` — **MISSING**

### D10. Photo Viewer
- GET `/api/photo-viewer` — **MISSING**
- GET `/api/photo-viewer/signed-url` — **MISSING**

---

## SECTION E — FETCH HOOK AUDIT

**1. Custom hook existence:** NO. `src/hooks` only contains `useOfflineFetch.ts` and `useOnlineStatus.ts`.
**2. Hook called in page:** NO. Pages like `/app/purchases` and `/app/customers` use inline `useSWR`.
**3. invalidateQueries matches:** N/A. `queryClient` (TanStack) is NOT used; the app uses `swr.mutate()`.
**4. States:**
- **Page: /app/purchases**
  - Loading state: YES (DataTable loading prop)
  - Error state: NO (not handled in component)
  - Empty state: YES (DataTable emptyMessage prop)
- **Page: /app/customers**
  - Loading state: YES
  - Error state: NO
  - Empty state: NO (Shows blank table)

---

## SECTION F — UI CONSISTENCY AUDIT

- **F1. Sidebar violations:** PASS. Sidebars are defined but NOT rendered in the main `AppShell`.
- **F2. PageShell usage:** PASS. Consistent usage in `/app/app/(modules)`.
- **F3. DataTable usage:** PARTIAL. Custom table markup used in `src/app/app/(modules)/casual/page.tsx`.
- **F4. FormPanel usage:** **CRITICAL.** `FormPanel` component is missing. Forms use raw `Dialog` or `Sheet` components.
- **F5. Design token violations:**
  - `src/app/app/(portal)/dashboard/page.tsx`: hardcoded `bg-[#217346]`, `bg-[#C9A020]`, `bg-[#185ABD]`, `bg-[#1B3A6B]`, `bg-[#C0392B]`.
  - `src/app/app/(modules)/purchases/new/page.tsx`: hardcoded colors in `PosLabel` (`#8BA4D4`), `inputStyle`, `total` display (`#F2AB1A`).
- **F6. Missing states:**
  - `DataTable` in `purchases/page.tsx` is missing `error` prop connection.
  - `DataTable` in `customers/page.tsx` is missing `error` prop.

---

## SECTION G — CROSS-MODULE WIRING AUDIT

- **G1. Purchase → Stock wiring:** **PASS.** `recordMovement` called INSIDE `prisma.$transaction`.
- **G2. Purchase → CashUp wiring:** **PASS.** `calcSystemTotals` queries `Purchase` records directly where `paymentMethod='cash'` and filters by current date.
- **G3. Expense → CashUp wiring:** **PASS.** `getExpenseTotalsForDate()` is called from `cashUpService.calcSystemTotals()`.
- **G4. Float → CashUp wiring:** **PASS.** `cashUpService.openCashUp()` calls `getFloatForDate()` and stores it as `openingBalance`.
- **G5. Loan → Purchase popup wiring:** **PASS.** Implemented in `NewPurchasePage.tsx` using `useSWR` to `/api/customers/${customer.id}/loans`.
- **G6. CashUp approval → Float wiring:** **PASS.** `approveCashUp()` calls `updateClosingAmount()` which updates the `CashFloat` record.

---

## SECTION H — PRIORITY SUMMARY

### CRITICAL (Fix Immediately)
1. **Decimal.js:** Remove all 37 instances of `.toFixed()` in service files and replace with proper Decimal.js formatting or return raw Decimals.
2. **Auth:** Move `await auth()` to Line 1 in all API handlers.
3. **Architecture:** Refactor API routes to use Service layer instead of direct Prisma calls.
4. **UI:** Create a unified `FormPanel` component and migrate all module forms to it.

### HIGH (Significant Feature Gaps)
1. **Schema:** Add `MediaFile`, `FloatMovement`, and `TransactionPayment` models.
2. **PDFs:** Implement auto-generation for VAT264, Purchase Notes, and Packing Lists.
3. **API:** Implement missing routes for Float history, Stock transfers, and standalone Cash-Up totals.

### MEDIUM (Incomplete/Polish)
1. **Hooks:** Migrate inline `useSWR` calls to custom hooks in `src/hooks/`.
2. **Design Tokens:** Replace all hardcoded hex colors with tokens from `design-tokens.ts`.
3. **Police Register:** Include Disposal (Sales) entries.

### LOW (Polish)
1. **Indexes:** Add missing indexes to `StockMovement` and `Purchase` tables.
2. **Casual Details:** Optimize workflow for walk-in sellers (fast photo capture).
