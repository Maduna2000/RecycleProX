-- Cash-up currently only *displays* a warning when a new session's currency
-- differs from the previous session's ("Previous session was in ZAR, this
-- one is SZL — confirm this is intentional."), but there was never a way to
-- actually confirm it, and nothing blocked the module while unconfirmed.
-- This adds a persisted confirmation so the mismatch must be explicitly
-- acknowledged by a manager/admin before the session can be submitted.

-- AlterTable
ALTER TABLE "CashUp" ADD COLUMN "currencyConfirmedAt" TIMESTAMP(3);
ALTER TABLE "CashUp" ADD COLUMN "currencyConfirmedByUserId" TEXT;
