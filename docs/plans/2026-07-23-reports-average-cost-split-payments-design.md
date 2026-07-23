# Reports: Purchase Average Cost + Split Payment Reports

## Context

Two new reports added to the Reports module, following the existing registry pattern (`src/lib/services/reports/registry.ts`): one params schema (`src/lib/schemas/report.ts`), one builder (`src/lib/services/reports/builders/*.ts`), one catalog entry (`src/lib/reports/catalog.ts`).

## 1. Purchase Average Cost Report

**id:** `purchases-average-cost` · **area:** purchases

Every product actually purchased in a date range, one flat row per product (no category grouping), with total quantity and the quantity-weighted average purchase price across every supplier who sold it in the period.

Worked example: 100kg Copper @ R20 from Dealer 1 + 10kg Copper @ R25 from Dealer 2 → one row: Copper, 110kg, avg price ≈ R20.45 (= (100×20 + 10×25) / 110, **not** a simple average of the two unit prices).

- **Params:** `from`/`to` date range (pick one day for a daily view, widen for a week/month), optional `productId` filter.
- **Data:** `purchaseLine.findMany` where `purchase.status = 'completed'` and `createdAt` in range, optionally scoped to one product.
- **Row math:** `mass = Σ quantity`; amounts via `purchaseLineAmounts(line, customer.zeroRated)` for the VAT era-split; `avgPrice = grandTotal / mass`.
- **Shape:** mirrors `buildSalesByProduct` (weighted-average row math already established there) but purchase-side and flat — `groupRows` called with `groups: []` so every product collapses straight to one leaf row, sorted by product name.
- **Columns:** Code, Product, Avg Price (Incl.), Mass, Sub Total, VAT, Grand Total.

## 2. Purchases — Split Payments

**id:** `purchases-split-payments` · **area:** purchases

Every purchase that was actually settled by a cash/EFT/loan split (i.e. `Purchase.splitPayments` is set — this JSON field is the authoritative source, not the `Payment` table, since the loan leg of a split posts straight to `LoanRepayment` and never creates a `Payment` row), grouped by supplier, with the three legs broken into their own columns instead of one collapsed "Split" payment-method label.

- **Params:** `from`/`to` range, optional `customerId` (supplier) filter.
- **Data:** `purchase.findMany` where `createdAt` in range and `splitPayments: { not: Prisma.DbNull }`.
- **Columns:** Ticket, Date, Cash, EFT, Loan, Total — subtotalled per supplier, grand-totalled overall.

## 3. Sales — Split Payments

**id:** `sales-split-payments` · **area:** sales

The sale-side mirror of #2: every sale settled by a cash/EFT/business-loan split (`Sale.splitPayments`), grouped by buyer.

- **Params:** `from`/`to` range, optional `customerId` (buyer) filter.
- **Columns:** Ticket, Date, Cash, EFT, Business Loan, Total.

## Why two split-payment reports, not one

Every other report in the catalog is already split by direction (`purchases-daily` / `sales-daily`, `purchases-by-product-category` / `sales-by-product`, etc.), and purchases/sales split payments have different third-leg semantics (`loan` reduces what the yard is owed vs. `businessLoan` reduces what the yard owes) — keeping them separate matches both the existing catalog convention and avoids conflating two different money-direction concepts into one column.
