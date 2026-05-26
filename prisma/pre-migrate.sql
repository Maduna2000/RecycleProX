-- Convert ProductCategory enum column to plain TEXT (idempotent)
-- A prior partial push may have already created the ProductCategory TABLE,
-- which blocks DROP TYPE due to PostgreSQL composite-type dependency.
-- Drop that table first (prisma db push recreates it clean).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductCategory' AND typcategory = 'E') THEN
    DROP TABLE IF EXISTS "ProductCategory";
    ALTER TABLE "Product" ALTER COLUMN "category" TYPE TEXT USING "category"::text;
    DROP TYPE "ProductCategory";
  END IF;
END $$;

-- Unify scale portal with main product catalog (wipe test data, idempotent)
-- Must truncate child tables before dropping parent tables
TRUNCATE TABLE "ScaleOrderLine" CASCADE;
TRUNCATE TABLE "ScaleOrder"     CASCADE;
DROP TABLE IF EXISTS "ScaleProduct" CASCADE;
DROP TABLE IF EXISTS "ScaleCategory" CASCADE;
