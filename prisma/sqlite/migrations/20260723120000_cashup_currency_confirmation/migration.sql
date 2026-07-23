-- Mirrors prisma/migrations/20260723120000_cashup_currency_confirmation for
-- the Desktop (SQLite) build. Kept manually in sync since
-- scripts/generate-sqlite-schema.ts only derives prisma/sqlite/schema.prisma
-- (gitignored), not this migration history.

-- AlterTable
ALTER TABLE "CashUp" ADD COLUMN "currencyConfirmedAt" DATETIME;
ALTER TABLE "CashUp" ADD COLUMN "currencyConfirmedByUserId" TEXT;
