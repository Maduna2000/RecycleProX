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

-- Deduplicate CashUp rows sharing a sessionDate before "sessionDate" becomes UNIQUE.
-- Within each date, prefers a row with real declaredCash over one without, then
-- approved > submitted > open > voided, then most recent createdAt — and only
-- deletes duplicates in groups that have at least one row with declaredCash set.
-- A date where every row is still bare/open (nothing declared yet, e.g. the
-- currently active session) is left untouched entirely — there's no completed
-- reconciliation yet to prefer over it.
DO $$
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "sessionDate"
        ORDER BY
          ("declaredCash" IS NULL),
          CASE status
            WHEN 'approved'  THEN 0
            WHEN 'submitted' THEN 1
            WHEN 'open'      THEN 2
            WHEN 'voided'    THEN 3
          END,
          "createdAt" DESC
      ) AS rn,
      COUNT(*) FILTER (WHERE "declaredCash" IS NOT NULL) OVER (PARTITION BY "sessionDate") AS declared_count
    FROM "CashUp"
  )
  DELETE FROM "CashUp"
  WHERE id IN (SELECT r.id FROM ranked r WHERE r.rn > 1 AND r.declared_count > 0);
END $$;

-- Backfill Product.categoryId from the legacy free-text Product.category column
-- by matching ProductCategory.name. Idempotent: creates the column if db push
-- hasn't run yet, only fills NULLs, and self-heals on every build (a product
-- whose category string later gains a matching ProductCategory row gets linked).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Product')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ProductCategory')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ProductCategory' AND column_name = 'name') THEN
    ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
    -- Pass 1: exact name match
    UPDATE "Product" p
    SET "categoryId" = pc.id
    FROM "ProductCategory" pc
    WHERE p."categoryId" IS NULL
      AND p."category" = pc."name";
    -- Pass 2: normalized match for legacy slug strings (e.g. 'non_ferrous' → 'Non-Ferrous',
    -- 'e_waste' → 'E-Waste'). Strips non-alphanumerics and lowercases both sides.
    -- DISTINCT ON keeps the pick deterministic when two category names normalize
    -- identically (e.g. a stray 'copper' duplicate of 'Copper').
    UPDATE "Product" p
    SET "categoryId" = pc.id
    FROM (
      SELECT DISTINCT ON (lower(regexp_replace("name", '[^a-zA-Z0-9]', '', 'g')))
             id,
             lower(regexp_replace("name", '[^a-zA-Z0-9]', '', 'g')) AS norm
      FROM "ProductCategory"
      ORDER BY lower(regexp_replace("name", '[^a-zA-Z0-9]', '', 'g')), "name" COLLATE "C"
    ) pc
    WHERE p."categoryId" IS NULL
      AND lower(regexp_replace(p."category", '[^a-zA-Z0-9]', '', 'g')) = pc.norm;
  END IF;
END $$;
