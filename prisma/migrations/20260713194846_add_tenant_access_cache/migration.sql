-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "lastAccessCheckAt" TIMESTAMP(3),
ADD COLUMN     "lastAccessCheckResult" JSONB;
