-- AlterTable
ALTER TABLE "BusinessLoanRepayment" ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "BusinessLoanRepayment" ADD COLUMN "reversedById" TEXT;
