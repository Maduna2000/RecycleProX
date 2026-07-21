-- Enables Row-Level Security on the two tables added by the Business Loan
-- feature. These tables did not exist when 20260716000003_enable_rls ran,
-- so they were missing the same tenant_isolation backstop every other
-- business table has. Mirrors that migration's pattern exactly.

ALTER TABLE "BusinessLoan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessLoan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BusinessLoan"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "BusinessLoanRepayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessLoanRepayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BusinessLoanRepayment"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));
