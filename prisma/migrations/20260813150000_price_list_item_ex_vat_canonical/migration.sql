-- The stored price was mislabeled as INC VAT with EX VAT derived by
-- dividing it out — backwards from the app-wide convention (Product.
-- defaultBuyPrice, Purchases) where VAT is added ON TOP of the entered
-- price. Renaming the column to reflect what it actually stores; existing
-- values are carried over as-is (editors will need to re-check/re-enter
-- prices captured before this fix, since the number's meaning has changed).

ALTER TABLE "PriceListItem" RENAME COLUMN "priceIncVat" TO "priceExVat";
