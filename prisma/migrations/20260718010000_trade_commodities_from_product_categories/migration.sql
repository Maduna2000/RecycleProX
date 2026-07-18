-- Trade Commodities used to be freely-typed names (TradeCommodityCategory),
-- completely disconnected from the real Product/ProductCategory taxonomy —
-- so a customer's typed commodity ("Steel (Ferrous)") could never reliably
-- match a real product category ("Ferrous"), and the purchases screen's
-- product filter silently broke as a result. This replaces the standalone
-- model with a single `isTradeCommodity` flag directly on ProductCategory:
-- the Manage Trade Commodities screen now just toggles which real product
-- categories are exposed as account-customer commodity options, so the
-- purchases screen's category filter can never drift out of sync again.

-- AlterTable
ALTER TABLE "ProductCategory" ADD COLUMN "isTradeCommodity" BOOLEAN NOT NULL DEFAULT false;

-- Backfill A: an existing active TradeCommodityCategory name that matches a
-- real ProductCategory (case-insensitive, same tenant) -> flip the flag on.
UPDATE "ProductCategory" pc
SET "isTradeCommodity" = true
FROM "TradeCommodityCategory" tc
WHERE tc."isActive" = true
  AND tc."tenantId" = pc."tenantId"
  AND lower(tc."name") = lower(pc."name");

-- Backfill B: an existing active TradeCommodityCategory name with NO
-- matching product category -> create one (top-level, active, pre-flagged)
-- so no historically-selected commodity silently disappears.
INSERT INTO "ProductCategory" ("id", "tenantId", "name", "sortOrder", "isActive", "isTradeCommodity", "createdAt", "updatedAt")
SELECT gen_random_uuid(), tc."tenantId", tc."name", 0, true, true, now(), now()
FROM "TradeCommodityCategory" tc
WHERE tc."isActive" = true
  AND NOT EXISTS (
    SELECT 1 FROM "ProductCategory" pc
    WHERE pc."tenantId" = tc."tenantId" AND lower(pc."name") = lower(tc."name")
  );

-- DropTable
DROP TABLE "TradeCommodityCategory";
