-- Mirrors prisma/migrations/20260724000000_cashup_multi_session_per_day for
-- the Desktop (SQLite) build. No tenantId column here (single-tenant), so
-- the "at most one open session" invariant is enforced on the status
-- column itself: among rows where status = 'open', every row.status value
-- is literally 'open', so a unique index on that column filtered to that
-- value allows at most one such row.

DROP INDEX "CashUp_sessionDate_key";

CREATE INDEX "CashUp_sessionDate_idx" ON "CashUp"("sessionDate");

CREATE UNIQUE INDEX "CashUp_one_open_key" ON "CashUp"("status") WHERE status = 'open';
