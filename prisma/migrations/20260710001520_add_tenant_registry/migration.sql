-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'provisioning');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "planCode" TEXT,
    "featureFlags" JSONB,
    "graceEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_companySlug_key" ON "Tenant"("companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_schemaName_key" ON "Tenant"("schemaName");

