-- Price lists move from one tenant-wide active list to one active list per
-- Price Group. A Casual customer (or no customer selected yet) resolves to
-- whichever group is flagged isDefault, rather than price lists having a
-- separate null/Casual scope of their own — see
-- priceListService.getActivePriceListForCustomer.

-- AddColumn (nullable first — existing rows need a value before NOT NULL)
ALTER TABLE "PriceList" ADD COLUMN "priceGroupId" TEXT;

-- Guarantee every tenant that has at least one PriceList also has at least
-- one PriceGroup flagged isDefault to backfill onto — nothing upstream of
-- this migration guaranteed that, and without it the NOT NULL below fails.
UPDATE "PriceGroup" pg
SET "isDefault" = true
WHERE pg."id" = (
  SELECT id FROM "PriceGroup" pg2
  WHERE pg2."tenantId" = pg."tenantId"
  ORDER BY pg2."createdAt" ASC
  LIMIT 1
)
AND EXISTS (SELECT 1 FROM "PriceList" pl WHERE pl."tenantId" = pg."tenantId")
AND NOT EXISTS (
  SELECT 1 FROM "PriceGroup" pg3
  WHERE pg3."tenantId" = pg."tenantId" AND pg3."isDefault" = true
);

-- Backfill existing price lists to whichever Price Group is currently
-- flagged isDefault for that same tenant.
UPDATE "PriceList" SET "priceGroupId" = (
  SELECT "id" FROM "PriceGroup"
  WHERE "PriceGroup"."tenantId" = "PriceList"."tenantId" AND "PriceGroup"."isDefault" = true
  LIMIT 1
);

-- AlterColumn
ALTER TABLE "PriceList" ALTER COLUMN "priceGroupId" SET NOT NULL;

-- DropIndex — superseded by the partial unique index below, which encodes
-- the feature's real invariant (at most one active list per group) instead
-- of just a lookup index.
DROP INDEX "PriceList_tenantId_isActiveForPurchases_idx";

-- CreateIndex
CREATE INDEX "PriceList_tenantId_priceGroupId_idx" ON "PriceList"("tenantId", "priceGroupId");

-- CreateIndex — at most one active list per (tenantId, priceGroupId),
-- enforced at the database level, same pattern as
-- CashUp_tenantId_one_open_key (20260724000000_cashup_multi_session_per_day).
CREATE UNIQUE INDEX "PriceList_tenantId_priceGroupId_one_active_key" ON "PriceList"("tenantId", "priceGroupId") WHERE "isActiveForPurchases" = true;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_priceGroupId_fkey" FOREIGN KEY ("priceGroupId") REFERENCES "PriceGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
