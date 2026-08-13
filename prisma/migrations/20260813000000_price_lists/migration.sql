-- Daily printed price list documents (Products module builder). Each list is
-- an editable snapshot of buy prices (INC VAT stored; EX VAT always derived
-- at display/print time). At most one list per tenant carries
-- isActiveForPurchases = true — it feeds the Today's Prices panel on the
-- new-purchase screen (enforced in priceListService.activatePriceList).

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'TODAY''S PRICES',
    "listDate" TIMESTAMP(3) NOT NULL,
    "footerText" TEXT NOT NULL DEFAULT 'Prices subject to change without notice. VAT rate applied as per current legislation.',
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showExVat" BOOLEAN NOT NULL DEFAULT true,
    "isActiveForPurchases" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productId" TEXT,
    "displayName" TEXT NOT NULL,
    "priceIncVat" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceList_tenantId_idx" ON "PriceList"("tenantId");

-- CreateIndex
CREATE INDEX "PriceList_tenantId_isActiveForPurchases_idx" ON "PriceList"("tenantId", "isActiveForPurchases");

-- CreateIndex
CREATE INDEX "PriceListItem_tenantId_idx" ON "PriceListItem"("tenantId");

-- CreateIndex
CREATE INDEX "PriceListItem_tenantId_priceListId_idx" ON "PriceListItem"("tenantId", "priceListId");

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
