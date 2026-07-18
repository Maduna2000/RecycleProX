-- Fixes the Sales Payment module: the Payment table records both money
-- IN (a buyer settling a sale) and money OUT (the yard settling a
-- purchase) with no field to tell them apart — only the free-text
-- `notes` string distinguished them ("Settlement of sale ...", "Settlement
-- of purchase ...", "Split payment for ..."), so every list of "payments"
-- silently mixed both directions. This adds an explicit `source` plus
-- real FKs back to the originating Sale/Purchase (mirroring how
-- LoanRepayment.purchaseId already links a repayment to its funding
-- purchase), and backfills existing rows from the `notes` text one time
-- only — application code sets `source`/`saleId`/`purchaseId` explicitly
-- from now on, so notes-parsing is never needed again after this.

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('sale', 'purchase');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "source" "PaymentSource" NOT NULL DEFAULT 'purchase';
ALTER TABLE "Payment" ADD COLUMN "saleId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "purchaseId" TEXT;

-- Backfill: existing rows already default to 'purchase' (the historically
-- dominant case — createPayment, markPurchasePaid, processSplitPayment all
-- settle a purchase); flip the sale-settlement ones over.
UPDATE "Payment"
SET "source" = 'sale'
WHERE "notes" LIKE 'Settlement of sale %';

-- Backfill saleId for the rows just flipped, matching the ref embedded in
-- notes ("Settlement of sale SAL-...") against Sale.refNumber within the
-- same tenant (refNumber is only unique per tenant, not globally).
UPDATE "Payment" p
SET "saleId" = s.id
FROM "Sale" s
WHERE p."source" = 'sale'
  AND p."tenantId" = s."tenantId"
  AND s."refNumber" = trim(substring(p."notes" from 'Settlement of sale (.*)$'));

-- Backfill purchaseId for the two purchase-settlement notes shapes:
-- "Settlement of purchase PUR-..." and "Split payment for PUR-... (cash|eft)".
UPDATE "Payment" p
SET "purchaseId" = pu.id
FROM "Purchase" pu
WHERE p."source" = 'purchase'
  AND p."tenantId" = pu."tenantId"
  AND (
    (p."notes" LIKE 'Settlement of purchase %'
      AND pu."refNumber" = trim(substring(p."notes" from 'Settlement of purchase (.*)$')))
    OR
    (p."notes" LIKE 'Split payment for %'
      AND pu."refNumber" = trim(substring(p."notes" from 'Split payment for (.*) \(')))
  );

-- CreateIndex
CREATE INDEX "Payment_tenantId_source_idx" ON "Payment"("tenantId", "source");
CREATE INDEX "Payment_tenantId_saleId_idx" ON "Payment"("tenantId", "saleId");
CREATE INDEX "Payment_tenantId_purchaseId_idx" ON "Payment"("tenantId", "purchaseId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
