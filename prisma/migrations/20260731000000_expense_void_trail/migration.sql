-- Voiding an expense had no accountability trail at all (unlike Purchase/
-- Sale/Loan/BusinessLoan, which all record who voided, when, and why).
-- Once these fields are set, the audit middleware's changedById fallback
-- chain already recognizes voidedById, so this also plugs into the audit
-- trail automatically.

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "voidedById" TEXT;
ALTER TABLE "Expense" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN "voidReason" TEXT;
