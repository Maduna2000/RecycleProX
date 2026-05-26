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
