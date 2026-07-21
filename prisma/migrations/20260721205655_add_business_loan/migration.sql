-- CreateEnum
CREATE TYPE "BusinessLoanStatus" AS ENUM ('active', 'settled', 'voided');

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CashFloat" DROP CONSTRAINT "CashFloat_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CashUp" DROP CONSTRAINT "CashUp_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CategoryStepConfig" DROP CONSTRAINT "CategoryStepConfig_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerDocument" DROP CONSTRAINT "CustomerDocument_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ExpenseAttachment" DROP CONSTRAINT "ExpenseAttachment_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ExpenseType" DROP CONSTRAINT "ExpenseType_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "FloatMovement" DROP CONSTRAINT "FloatMovement_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "LoanRepayment" DROP CONSTRAINT "LoanRepayment_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "MediaFile" DROP CONSTRAINT "MediaFile_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PoliceSearchLog" DROP CONSTRAINT "PoliceSearchLog_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PoliceVisit" DROP CONSTRAINT "PoliceVisit_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PriceGroup" DROP CONSTRAINT "PriceGroup_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PriceGroupProductOverride" DROP CONSTRAINT "PriceGroupProductOverride_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PriceHistory" DROP CONSTRAINT "PriceHistory_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductCategory" DROP CONSTRAINT "ProductCategory_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Purchase" DROP CONSTRAINT "Purchase_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseLine" DROP CONSTRAINT "PurchaseLine_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SaleLine" DROP CONSTRAINT "SaleLine_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ScaleOrder" DROP CONSTRAINT "ScaleOrder_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ScaleOrderLine" DROP CONSTRAINT "ScaleOrderLine_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Stocktake" DROP CONSTRAINT "Stocktake_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "StocktakeEntry" DROP CONSTRAINT "StocktakeEntry_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SystemSettings" DROP CONSTRAINT "SystemSettings_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionPayment" DROP CONSTRAINT "TransactionPayment_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionPaymentLink" DROP CONSTRAINT "TransactionPaymentLink_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "UserModuleAccess" DROP CONSTRAINT "UserModuleAccess_tenantId_fkey";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "businessLoanDeductionAmount" DECIMAL(18,2),
ADD COLUMN     "splitPayments" JSONB;

-- CreateTable
CREATE TABLE "BusinessLoan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "principalAmount" DECIMAL(18,2) NOT NULL,
    "balanceAmount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "status" "BusinessLoanStatus" NOT NULL DEFAULT 'active',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessLoanRepayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "businessLoanId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleId" TEXT,

    CONSTRAINT "BusinessLoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessLoan_tenantId_idx" ON "BusinessLoan"("tenantId");

-- CreateIndex
CREATE INDEX "BusinessLoan_tenantId_customerId_idx" ON "BusinessLoan"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "BusinessLoan_tenantId_status_idx" ON "BusinessLoan"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BusinessLoan_tenantId_createdAt_idx" ON "BusinessLoan"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessLoan_tenantId_refNumber_key" ON "BusinessLoan"("tenantId", "refNumber");

-- CreateIndex
CREATE INDEX "BusinessLoanRepayment_tenantId_idx" ON "BusinessLoanRepayment"("tenantId");

-- CreateIndex
CREATE INDEX "BusinessLoanRepayment_tenantId_businessLoanId_idx" ON "BusinessLoanRepayment"("tenantId", "businessLoanId");

-- CreateIndex
CREATE INDEX "BusinessLoanRepayment_tenantId_customerId_idx" ON "BusinessLoanRepayment"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "BusinessLoanRepayment_tenantId_saleId_idx" ON "BusinessLoanRepayment"("tenantId", "saleId");

-- CreateIndex
CREATE INDEX "BusinessLoanRepayment_tenantId_createdAt_idx" ON "BusinessLoanRepayment"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessLoanRepayment_tenantId_refNumber_key" ON "BusinessLoanRepayment"("tenantId", "refNumber");

-- AddForeignKey
ALTER TABLE "BusinessLoan" ADD CONSTRAINT "BusinessLoan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLoanRepayment" ADD CONSTRAINT "BusinessLoanRepayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLoanRepayment" ADD CONSTRAINT "BusinessLoanRepayment_businessLoanId_fkey" FOREIGN KEY ("businessLoanId") REFERENCES "BusinessLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLoanRepayment" ADD CONSTRAINT "BusinessLoanRepayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
