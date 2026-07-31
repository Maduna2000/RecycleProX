-- Stable dealer-tier link for PriceGroup, so renaming a price group's
-- display name (e.g. "Dealer 1") can never silently break automatic
-- dealer-tier pricing resolution. Reuses the existing DealerCategory enum
-- (already used by Customer.dealerCategory) - no new enum needed.

-- AlterTable
ALTER TABLE "PriceGroup" ADD COLUMN "dealerTier" "DealerCategory";

-- CreateIndex
CREATE INDEX "PriceGroup_tenantId_dealerTier_idx" ON "PriceGroup"("tenantId", "dealerTier");
