-- Customer.zeroRated's DB default (false) disagreed with CreateCustomerSchema's
-- Zod default (true, "VAT is opt-in — no VAT applied unless explicitly
-- ticked"). Harmless today since Zod always runs first on the API path;
-- only matters for a direct-DB write bypassing the API. Aligning the
-- column default to match Zod's intent. Existing rows are untouched.

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "zeroRated" SET DEFAULT true;
