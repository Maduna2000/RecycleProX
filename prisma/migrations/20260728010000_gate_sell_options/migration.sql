-- Admin-managed picklist a guard chooses from at the Gate Station's
-- "what are they selling?" step, replacing the previous live read from the
-- Products module's category tree. This is a heads-up tag on the visitor
-- log, not the actual purchase transaction, so it shouldn't require or
-- track Products-module data. Also switches the entry from a single
-- categoryName string to a categoryNames array so more than one option can
-- be selected.

-- CreateTable
CREATE TABLE "GateSellOption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "colorHex" TEXT,
    "iconName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateSellOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GateSellOption_tenantId_idx" ON "GateSellOption"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GateSellOption_tenantId_label_key" ON "GateSellOption"("tenantId", "label");

-- RLS — same FORCE ROW LEVEL SECURITY + tenant_isolation policy pattern as
-- every other tenant-owned table (see 20260716000003_enable_rls /
-- 20260719000001_gate_security). FORCE is required, not just ENABLE, so the
-- app's own connection role is subject to it too, not exempt as the table's
-- nominal owner.
ALTER TABLE "GateSellOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GateSellOption" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GateSellOption"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

-- AlterTable: add the new multi-value column first (defaulting to empty),
-- backfill it from the old single-value column so no existing entry loses
-- its recorded category, then drop the old column.
ALTER TABLE "GateEntry" ADD COLUMN "categoryNames" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "GateEntry" SET "categoryNames" = ARRAY["categoryName"] WHERE "categoryName" IS NOT NULL AND "categoryName" <> '';

ALTER TABLE "GateEntry" DROP COLUMN "categoryName";
