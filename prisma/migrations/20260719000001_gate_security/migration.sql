-- Gate Security module — a yard entry/exit log for the security guard at the
-- gate, modeled on Scale Station's tenant-scoped patterns. GateEntry.customerId
-- is set only on an exact ID-number match against an existing Customer — a
-- non-matching visitor is never turned into a new Customer row (unlike
-- ScaleOrder's quickCreate-on-create behaviour); their details live inline on
-- visitorFirstName/visitorLastName/visitorIdNumber/visitorPhone regardless.
-- "Repeat visitor" detection matches visitorIdNumber against this table's own
-- history, so it works whether or not the person has ever become a real
-- Customer. GatePurposeConfig holds the per-purpose (sell/buy/visitor/other)
-- required-photo toggles an admin sets via Settings.

-- CreateEnum
CREATE TYPE "GateEntryPurpose" AS ENUM ('sell', 'buy', 'visitor', 'other');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'security_guard';

-- CreateTable
CREATE TABLE "GateEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "purpose" "GateEntryPurpose" NOT NULL,
    "categoryName" TEXT,
    "customerId" TEXT,
    "visitorFirstName" TEXT NOT NULL,
    "visitorLastName" TEXT NOT NULL,
    "visitorIdNumber" TEXT NOT NULL,
    "visitorPhone" TEXT,
    "vehicleReg" TEXT,
    "idPhotoR2Key" TEXT,
    "vehiclePhotoR2Key" TEXT,
    "facePhotoR2Key" TEXT,
    "notes" TEXT,
    "operatorId" TEXT NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "exitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatePurposeConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purpose" "GateEntryPurpose" NOT NULL,
    "requireIdPhoto" BOOLEAN NOT NULL DEFAULT false,
    "requireVehiclePhoto" BOOLEAN NOT NULL DEFAULT true,
    "requireFacePhoto" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GatePurposeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GateEntry_tenantId_idx" ON "GateEntry"("tenantId");

-- CreateIndex
CREATE INDEX "GateEntry_tenantId_visitorIdNumber_idx" ON "GateEntry"("tenantId", "visitorIdNumber");

-- CreateIndex
CREATE INDEX "GateEntry_tenantId_customerId_idx" ON "GateEntry"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "GateEntry_tenantId_createdAt_idx" ON "GateEntry"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "GateEntry_tenantId_exitedAt_idx" ON "GateEntry"("tenantId", "exitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GateEntry_tenantId_entryNumber_key" ON "GateEntry"("tenantId", "entryNumber");

-- CreateIndex
CREATE INDEX "GatePurposeConfig_tenantId_idx" ON "GatePurposeConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GatePurposeConfig_tenantId_purpose_key" ON "GatePurposeConfig"("tenantId", "purpose");

-- AddForeignKey
ALTER TABLE "GateEntry" ADD CONSTRAINT "GateEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateEntry" ADD CONSTRAINT "GateEntry_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateEntry" ADD CONSTRAINT "GateEntry_exitedById_fkey" FOREIGN KEY ("exitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS — same FORCE ROW LEVEL SECURITY + tenant_isolation policy pattern as
-- every other tenant-owned table (see 20260716000003_enable_rls). FORCE is
-- required, not just ENABLE, so the app's own connection role is subject to
-- it too, not exempt as the table's nominal owner.
ALTER TABLE "GateEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GateEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GateEntry"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "GatePurposeConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GatePurposeConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GatePurposeConfig"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));
