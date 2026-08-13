-- Customizable print palette for price list documents. Defaults match the
-- original fixed navy/gold scheme so existing documents render unchanged
-- until someone edits the new Colors panel.

-- AlterTable
ALTER TABLE "PriceList" ADD COLUMN "primaryColor" TEXT NOT NULL DEFAULT '#1B3A6B';
ALTER TABLE "PriceList" ADD COLUMN "accentColor" TEXT NOT NULL DEFAULT '#C9A227';
ALTER TABLE "PriceList" ADD COLUMN "headerTextColor" TEXT NOT NULL DEFAULT '#FFFFFF';
ALTER TABLE "PriceList" ADD COLUMN "materialTextColor" TEXT NOT NULL DEFAULT '#121212';
ALTER TABLE "PriceList" ADD COLUMN "priceTextColor" TEXT NOT NULL DEFAULT '#1B3A6B';
ALTER TABLE "PriceList" ADD COLUMN "exVatTextColor" TEXT NOT NULL DEFAULT '#737373';
ALTER TABLE "PriceList" ADD COLUMN "rowTintColor" TEXT NOT NULL DEFAULT '#E6EBF5';
