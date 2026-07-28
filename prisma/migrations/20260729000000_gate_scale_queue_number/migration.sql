-- Queue number linking a Gate visitor entry to the Scale Station weigh-in it
-- leads to. Both new columns live on existing, already tenant-scoped/RLS-
-- protected tables (GateEntry, ScaleOrder) - no new table, no new RLS policy
-- needed.

-- AlterTable
ALTER TABLE "GateEntry" ADD COLUMN "queueNumber" INTEGER;
ALTER TABLE "GateEntry" ADD COLUMN "queueNumberUsedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ScaleOrder" ADD COLUMN "gateEntryId" TEXT;

-- CreateIndex
CREATE INDEX "ScaleOrder_tenantId_gateEntryId_idx" ON "ScaleOrder"("tenantId", "gateEntryId");

-- AddForeignKey
ALTER TABLE "ScaleOrder" ADD CONSTRAINT "ScaleOrder_gateEntryId_fkey" FOREIGN KEY ("gateEntryId") REFERENCES "GateEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
