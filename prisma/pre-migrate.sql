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
