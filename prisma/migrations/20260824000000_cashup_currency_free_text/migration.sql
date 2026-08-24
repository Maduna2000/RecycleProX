-- CashUp.currency was a 2-value enum (ZAR/SZL) backing the old per-session
-- currency toggle on the Cash-Up screen. That toggle is being removed in
-- favour of a single tenant-wide currency chosen once in Settings (see
-- SystemSettings key "currency" and src/lib/constants/currencies.ts) and
-- read everywhere — cashup, reports, receipts, float. A 2-value enum can't
-- hold "any world currency", so the column becomes free-text (ISO 4217,
-- max 3 chars). Existing rows keep whatever ZAR/SZL value they already had
-- — this only widens what the column accepts going forward, it does not
-- rewrite history.
ALTER TABLE "CashUp" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "CashUp" ALTER COLUMN "currency" TYPE VARCHAR(3) USING "currency"::text;
ALTER TABLE "CashUp" ALTER COLUMN "currency" SET DEFAULT 'ZAR';

DROP TYPE "Currency";
