-- Reverts the currency-mismatch confirmation gate added in
-- 20260723120000_cashup_currency_confirmation. Not a feature this business
-- wants — a session's currency differing from the previous one's no longer
-- shows a warning or requires manager confirmation before submitting.

ALTER TABLE "CashUp" DROP COLUMN "currencyConfirmedAt";
ALTER TABLE "CashUp" DROP COLUMN "currencyConfirmedByUserId";
