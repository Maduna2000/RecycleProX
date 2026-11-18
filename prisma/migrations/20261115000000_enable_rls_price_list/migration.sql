-- PriceList and PriceListItem (20260813000000_price_lists) carry a tenantId
-- column but were never given the tenant_isolation policy every other
-- business table has, so any connection saw every company's price lists.
-- Mirrors 20260716000003_enable_rls exactly.

ALTER TABLE "PriceList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceList" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceList"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PriceListItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceListItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceListItem"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));
