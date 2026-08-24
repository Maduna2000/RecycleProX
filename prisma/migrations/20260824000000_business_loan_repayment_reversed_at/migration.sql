-- AlterTable
ALTER TABLE "BusinessLoanRepayment" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);
ALTER TABLE "BusinessLoanRepayment" ADD COLUMN IF NOT EXISTS "reversedById" TEXT;
