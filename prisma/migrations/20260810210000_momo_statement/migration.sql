-- A day's MoMo (mobile money) wallet statement, exported as CSV from the
-- provider's portal and uploaded by the cashier. Purely a reconciliation
-- aid — sits alongside CashUp, never feeds its formula.

-- CreateTable
CREATE TABLE "MomoStatementImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "statementDate" DATE NOT NULL,
    "totalSent" DECIMAL(18,2) NOT NULL,
    "totalReceived" DECIMAL(18,2) NOT NULL,
    "totalFees" DECIMAL(18,2) NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(18,2),
    "closingBalance" DECIMAL(18,2),
    "r2Key" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MomoStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MomoStatementLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "externalTxnId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromName" TEXT,
    "toName" TEXT,
    "toMessage" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MomoStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MomoStatementImport_tenantId_statementDate_key" ON "MomoStatementImport"("tenantId", "statementDate");

-- CreateIndex
CREATE INDEX "MomoStatementImport_tenantId_idx" ON "MomoStatementImport"("tenantId");

-- CreateIndex
CREATE INDEX "MomoStatementImport_tenantId_statementDate_idx" ON "MomoStatementImport"("tenantId", "statementDate");

-- CreateIndex
CREATE INDEX "MomoStatementLine_tenantId_idx" ON "MomoStatementLine"("tenantId");

-- CreateIndex
CREATE INDEX "MomoStatementLine_tenantId_importId_idx" ON "MomoStatementLine"("tenantId", "importId");

-- AddForeignKey
ALTER TABLE "MomoStatementLine" ADD CONSTRAINT "MomoStatementLine_importId_fkey" FOREIGN KEY ("importId") REFERENCES "MomoStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS — same FORCE ROW LEVEL SECURITY + tenant_isolation policy pattern as
-- every other tenant-owned table.
ALTER TABLE "MomoStatementImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MomoStatementImport" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MomoStatementImport"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "MomoStatementLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MomoStatementLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MomoStatementLine"
  USING       ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK  ("tenantId" = current_setting('app.current_tenant_id', true));
