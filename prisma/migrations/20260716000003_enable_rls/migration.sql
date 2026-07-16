-- Phase 3 of the shared-table tenancy migration (see
-- i-need-you-to-vectorized-pumpkin.md Section 4.1). Runs only after
-- 20260716000002_tenant_id_constraints has applied (tenantId is NOT NULL
-- with a FK to "Tenant" on every table below). Enables Postgres Row-Level
-- Security as the defense-in-depth backstop behind the application-level
-- tenant scoping added in src/lib/db/prisma.ts (Section 4.3).
--
-- FORCE ROW LEVEL SECURITY is required on every table, not just ENABLE —
-- without FORCE, the table owner role (the app's own DB connection role)
-- is exempt from RLS by default, which would silently defeat the whole
-- policy for exactly the role that matters most.
--
-- current_setting('app.current_tenant_id', true) uses missing_ok = true so
-- that a session with no tenant context set evaluates to NULL, which the
-- ("tenantId" = NULL) comparison never satisfies — fail-closed: zero rows,
-- not all rows, for any connection that forgot to call
-- set_config('app.current_tenant_id', ...). WITH CHECK (not just USING)
-- additionally blocks a write from changing a row's tenantId to move it
-- into a different tenant.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "UserModuleAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserModuleAccess" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserModuleAccess"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "SystemSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemSettings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SystemSettings"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Customer"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "CustomerDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerDocument"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Product"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PriceGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceGroup" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceGroup"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PriceGroupProductOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceGroupProductOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceGroupProductOverride"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PriceHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceHistory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceHistory"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProductCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductCategory"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "TradeCommodityCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TradeCommodityCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TradeCommodityCategory"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "CategoryStepConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CategoryStepConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CategoryStepConfig"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Purchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Purchase" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Purchase"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PurchaseLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PurchaseLine"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Sale"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "SaleLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SaleLine"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockMovement"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ExpenseType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseType" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ExpenseType"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Expense"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ExpenseAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseAttachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ExpenseAttachment"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "CashFloat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashFloat" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashFloat"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Stocktake" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stocktake" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Stocktake"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "StocktakeEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StocktakeEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StocktakeEntry"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "CashUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashUp" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashUp"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Loan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Loan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Loan"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "LoanRepayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanRepayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LoanRepayment"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PoliceVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PoliceVisit" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PoliceVisit"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PoliceSearchLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PoliceSearchLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PoliceSearchLog"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "MediaFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaFile" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MediaFile"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "FloatMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FloatMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FloatMovement"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "TransactionPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransactionPayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TransactionPayment"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "TransactionPaymentLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransactionPaymentLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TransactionPaymentLink"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ScaleOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScaleOrder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScaleOrder"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ScaleOrderLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScaleOrderLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScaleOrderLine"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));
