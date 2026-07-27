-- Allow multiple cash-up sessions per calendar day (e.g. separate shifts).
-- The old (tenantId, sessionDate) unique constraint capped the system at
-- exactly one CashUp row per day, ever — opening a second session for a
-- day that already had one (even an already-approved or voided one) just
-- returned that stale row instead of creating a fresh one, and that row
-- could then never be submitted. Replaced with a plain (non-unique) index —
-- sessionDate is still filtered on constantly — plus a partial unique index
-- that encodes the real invariant: at most one session may be 'open' for a
-- tenant at any time, regardless of date. This also closes a pre-existing
-- gap where two sessions on different days could theoretically both end up
-- 'open' under a race, since that was never actually enforced at the DB
-- level before.

DROP INDEX "CashUp_tenantId_sessionDate_key";

CREATE INDEX "CashUp_tenantId_sessionDate_idx" ON "CashUp"("tenantId", "sessionDate");

CREATE UNIQUE INDEX "CashUp_tenantId_one_open_key" ON "CashUp"("tenantId") WHERE status = 'open';
