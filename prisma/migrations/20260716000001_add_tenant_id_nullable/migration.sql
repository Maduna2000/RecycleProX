-- Phase 1 of the shared-table tenancy migration (see
-- i-need-you-to-vectorized-pumpkin.md Section 3). Adds `tenantId` as a
-- NULLABLE column with no default to all 35 tenant-scoped tables — cannot
-- be NOT NULL yet because these tables already hold rows (Golden Key's
-- production data, or seed data on a test copy) with no tenant to assign
-- until the backfill step runs. Composite unique constraints, indexes, the
-- FK to Tenant, and the NOT NULL constraint itself land in the next
-- migration (tenant_id_constraints), only after backfill has run.

ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "UserModuleAccess" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CustomerDocument" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Product" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PriceGroup" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PriceGroupProductOverride" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PriceHistory" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ProductCategory" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "TradeCommodityCategory" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CategoryStepConfig" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PurchaseLine" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "SaleLine" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ExpenseType" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ExpenseAttachment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CashFloat" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Stocktake" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "StocktakeEntry" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CashUp" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Loan" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "LoanRepayment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PoliceVisit" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PoliceSearchLog" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "MediaFile" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "FloatMovement" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "TransactionPayment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "TransactionPaymentLink" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ScaleOrder" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ScaleOrderLine" ADD COLUMN "tenantId" TEXT;
