-- Ties together the per-loan LoanRepayment rows a single FIFO repayment
-- action splits across more than one active loan, so the Loans-tab ledger
-- can show one combined entry per real-world repayment instead of one row
-- per loan it happened to cross.

-- AlterTable
ALTER TABLE "LoanRepayment" ADD COLUMN "batchId" TEXT;

-- CreateIndex
CREATE INDEX "LoanRepayment_tenantId_batchId_idx" ON "LoanRepayment"("tenantId", "batchId");
