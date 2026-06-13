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

-- Migration complete: ScaleProduct and ScaleCategory tables have been dropped.
-- Scale orders now use the main Product catalog.
-- IMPORTANT: TRUNCATE statements removed to preserve production data.
-- The old tables are dropped idempotently below (safe no-op if already gone).
DROP TABLE IF EXISTS "ScaleProduct" CASCADE;
DROP TABLE IF EXISTS "ScaleCategory" CASCADE;
