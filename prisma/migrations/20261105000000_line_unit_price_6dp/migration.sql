-- Allow unit prices with up to 6 decimal places on purchase and sale lines.
-- Line totals stay at 2 decimal places (rounded in the service layer).
ALTER TABLE "PurchaseLine" ALTER COLUMN "unitPrice" TYPE DECIMAL(18,6);
ALTER TABLE "SaleLine" ALTER COLUMN "unitPrice" TYPE DECIMAL(18,6);
