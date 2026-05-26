-- Convert ProductCategory enum column to plain TEXT (idempotent)
-- Runs before prisma db push when migrating from enum to String type
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductCategory') THEN
    ALTER TABLE "Product" ALTER COLUMN "category" TYPE TEXT USING "category"::text;
    DROP TYPE "ProductCategory";
  END IF;
END $$;
