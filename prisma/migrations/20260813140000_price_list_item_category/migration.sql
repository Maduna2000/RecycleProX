-- Category snapshot per item — drives the printed category divider bars
-- (COPPER, BRASS, ...), matching the reference document's grouped layout.

-- AlterTable
ALTER TABLE "PriceListItem" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Other';
