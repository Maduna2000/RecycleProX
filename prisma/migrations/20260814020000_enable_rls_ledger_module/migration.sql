-- Enables Row-Level Security on the four tables added by the Ledger module
-- (20260814010000_ledger_module). These tables did not exist when
-- 20260716000003_enable_rls ran, so — same gap 20260721212348_enable_rls_
-- business_loan caught and fixed for BusinessLoan/BusinessLoanRepayment —
-- they were missing the tenant_isolation backstop every other business
-- table has. Without this, the app-level tenant-scoping wrapper
-- (src/lib/db/prisma.ts) has nothing to enforce: set_config('app.current_
-- tenant_id', ...) only means anything to a table that actually has a
-- policy reading it. Mirrors the original migration's pattern exactly.

ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Account"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "JournalEntry"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "JournalLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "JournalLine"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProductAverageCost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductAverageCost" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductAverageCost"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));
