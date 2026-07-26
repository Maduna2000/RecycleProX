-- Mirrors prisma/migrations/20260724000001_revert_cashup_currency_confirmation
-- for the Desktop (SQLite) build.

ALTER TABLE "CashUp" DROP COLUMN "currencyConfirmedAt";
ALTER TABLE "CashUp" DROP COLUMN "currencyConfirmedByUserId";
