-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "subscriptionEndDate" TIMESTAMP(3),
                     ADD COLUMN "subscriptionStatus" TEXT,
                     ADD COLUMN "gracePeriodDays" INTEGER;
