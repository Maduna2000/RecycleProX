-- Phase 2 of the shared-table tenancy migration (see
-- i-need-you-to-vectorized-pumpkin.md Section 3). Runs only after
-- 20260716000001_add_tenant_id_nullable has applied AND every existing row
-- has been backfilled with a real tenantId (see
-- scripts/scratch-backfill-tenant-a.ts for this scratch project's dry run;
-- the real Golden Key backfill is the equivalent UPDATE ... WHERE tenantId
-- IS NULL per table, run once against production after this migration has
-- been fully verified here) — SET NOT NULL below fails otherwise. Drops the old
-- single-column unique indexes/constraints (schema-per-tenant made them
-- globally unique; shared tables make them unique per-tenant instead) and
-- replaces them with tenantId-prefixed composite indexes/constraints.
-- Generated via `prisma migrate diff` against the already-nullable-column
-- state, then hand-appended with the tenantId->Tenant FK constraints at the
-- bottom (tenantId is a plain scalar column, not a Prisma @relation, so
-- Prisma's own diff never generates these — see Section 2 "FK design").

-- DropIndex
DROP INDEX "AuditLog_changedById_idx";

-- DropIndex
DROP INDEX "AuditLog_createdAt_idx";

-- DropIndex
DROP INDEX "AuditLog_tableName_recordId_idx";

-- DropIndex
DROP INDEX "CashFloat_floatDate_idx";

-- DropIndex
DROP INDEX "CashFloat_floatDate_key";

-- DropIndex
DROP INDEX "CashUp_openedByUserId_idx";

-- DropIndex
DROP INDEX "CashUp_sessionDate_key";

-- DropIndex
DROP INDEX "CashUp_status_idx";

-- DropIndex
DROP INDEX "CategoryStepConfig_categoryId_idx";

-- DropIndex
DROP INDEX "Customer_accountCode_key";

-- DropIndex
DROP INDEX "Customer_companyName_idx";

-- DropIndex
DROP INDEX "Customer_contactPerson_idx";

-- DropIndex
DROP INDEX "Customer_customerType_idx";

-- DropIndex
DROP INDEX "Customer_idNumber_idx";

-- DropIndex
DROP INDEX "Customer_idNumber_key";

-- DropIndex
DROP INDEX "Customer_lastName_idx";

-- DropIndex
DROP INDEX "Customer_phone_idx";

-- DropIndex
DROP INDEX "CustomerDocument_customerId_idx";

-- DropIndex
DROP INDEX "Expense_createdAt_idx";

-- DropIndex
DROP INDEX "Expense_expenseTypeId_idx";

-- DropIndex
DROP INDEX "Expense_refNumber_key";

-- DropIndex
DROP INDEX "Expense_status_idx";

-- DropIndex
DROP INDEX "ExpenseAttachment_expenseId_idx";

-- DropIndex
DROP INDEX "ExpenseType_name_key";

-- DropIndex
DROP INDEX "ExpenseType_parentId_idx";

-- DropIndex
DROP INDEX "FloatMovement_cashFloatId_idx";

-- DropIndex
DROP INDEX "FloatMovement_createdAt_idx";

-- DropIndex
DROP INDEX "Loan_createdAt_idx";

-- DropIndex
DROP INDEX "Loan_customerId_idx";

-- DropIndex
DROP INDEX "Loan_refNumber_key";

-- DropIndex
DROP INDEX "Loan_status_idx";

-- DropIndex
DROP INDEX "LoanRepayment_createdAt_idx";

-- DropIndex
DROP INDEX "LoanRepayment_customerId_idx";

-- DropIndex
DROP INDEX "LoanRepayment_loanId_idx";

-- DropIndex
DROP INDEX "LoanRepayment_purchaseId_idx";

-- DropIndex
DROP INDEX "LoanRepayment_refNumber_key";

-- DropIndex
DROP INDEX "MediaFile_linkedModel_linkedId_idx";

-- DropIndex
DROP INDEX "MediaFile_uploadedAt_idx";

-- DropIndex
DROP INDEX "Payment_createdAt_idx";

-- DropIndex
DROP INDEX "Payment_customerId_idx";

-- DropIndex
DROP INDEX "Payment_refNumber_idx";

-- DropIndex
DROP INDEX "Payment_refNumber_key";

-- DropIndex
DROP INDEX "PoliceSearchLog_createdAt_idx";

-- DropIndex
DROP INDEX "PoliceSearchLog_visitId_idx";

-- DropIndex
DROP INDEX "PoliceVisit_createdAt_idx";

-- DropIndex
DROP INDEX "PoliceVisit_status_idx";

-- DropIndex
DROP INDEX "PoliceVisit_visitDate_idx";

-- DropIndex
DROP INDEX "PriceGroup_name_key";

-- DropIndex
DROP INDEX "PriceGroupProductOverride_priceGroupId_productId_key";

-- DropIndex
DROP INDEX "PriceGroupProductOverride_productId_idx";

-- DropIndex
DROP INDEX "PriceHistory_createdAt_idx";

-- DropIndex
DROP INDEX "PriceHistory_productId_idx";

-- DropIndex
DROP INDEX "Product_categoryId_idx";

-- DropIndex
DROP INDEX "Product_category_idx";

-- DropIndex
DROP INDEX "Product_code_key";

-- DropIndex
DROP INDEX "Product_isActive_idx";

-- DropIndex
DROP INDEX "ProductCategory_name_key";

-- DropIndex
DROP INDEX "Purchase_createdAt_idx";

-- DropIndex
DROP INDEX "Purchase_customerId_idx";

-- DropIndex
DROP INDEX "Purchase_customerId_status_createdAt_idx";

-- DropIndex
DROP INDEX "Purchase_refNumber_idx";

-- DropIndex
DROP INDEX "Purchase_refNumber_key";

-- DropIndex
DROP INDEX "Purchase_status_idx";

-- DropIndex
DROP INDEX "PurchaseLine_productId_idx";

-- DropIndex
DROP INDEX "PurchaseLine_purchaseId_idx";

-- DropIndex
DROP INDEX "Sale_buyerId_idx";

-- DropIndex
DROP INDEX "Sale_createdAt_idx";

-- DropIndex
DROP INDEX "Sale_customerId_idx";

-- DropIndex
DROP INDEX "Sale_refNumber_idx";

-- DropIndex
DROP INDEX "Sale_refNumber_key";

-- DropIndex
DROP INDEX "Sale_status_idx";

-- DropIndex
DROP INDEX "SaleLine_productId_idx";

-- DropIndex
DROP INDEX "SaleLine_saleId_idx";

-- DropIndex
DROP INDEX "ScaleOrder_createdAt_idx";

-- DropIndex
DROP INDEX "ScaleOrder_customerId_idx";

-- DropIndex
DROP INDEX "ScaleOrder_operatorId_idx";

-- DropIndex
DROP INDEX "ScaleOrder_orderNumber_key";

-- DropIndex
DROP INDEX "ScaleOrder_productId_idx";

-- DropIndex
DROP INDEX "ScaleOrder_status_idx";

-- DropIndex
DROP INDEX "ScaleOrderLine_orderId_idx";

-- DropIndex
DROP INDEX "ScaleOrderLine_productId_idx";

-- DropIndex
DROP INDEX "StockMovement_createdAt_idx";

-- DropIndex
DROP INDEX "StockMovement_direction_idx";

-- DropIndex
DROP INDEX "StockMovement_productId_createdAt_idx";

-- DropIndex
DROP INDEX "StockMovement_productId_idx";

-- DropIndex
DROP INDEX "StockMovement_source_idx";

-- DropIndex
DROP INDEX "Stocktake_createdAt_idx";

-- DropIndex
DROP INDEX "Stocktake_refNumber_key";

-- DropIndex
DROP INDEX "Stocktake_status_idx";

-- DropIndex
DROP INDEX "StocktakeEntry_productId_idx";

-- DropIndex
DROP INDEX "StocktakeEntry_stocktakeId_idx";

-- DropIndex
DROP INDEX "StocktakeEntry_stocktakeId_productId_key";

-- DropIndex
DROP INDEX "SystemSettings_key_key";

-- DropIndex
DROP INDEX "TradeCommodityCategory_isActive_idx";

-- DropIndex
DROP INDEX "TradeCommodityCategory_name_key";

-- DropIndex
DROP INDEX "TradeCommodityCategory_sortOrder_idx";

-- DropIndex
DROP INDEX "TransactionPayment_createdAt_idx";

-- DropIndex
DROP INDEX "TransactionPayment_customerId_idx";

-- DropIndex
DROP INDEX "TransactionPayment_refNumber_key";

-- DropIndex
DROP INDEX "TransactionPaymentLink_purchaseId_idx";

-- DropIndex
DROP INDEX "TransactionPaymentLink_transactionPaymentId_purchaseId_key";

-- DropIndex
DROP INDEX "User_username_key";

-- DropIndex
DROP INDEX "UserModuleAccess_userId_moduleKey_key";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CashFloat" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CashUp" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CategoryStepConfig" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CustomerDocument" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ExpenseAttachment" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ExpenseType" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "FloatMovement" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LoanRepayment" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MediaFile" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PoliceSearchLog" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PoliceVisit" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PriceGroup" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PriceGroupProductOverride" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PriceHistory" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ProductCategory" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Purchase" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseLine" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Sale" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SaleLine" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ScaleOrder" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ScaleOrderLine" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Stocktake" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StocktakeEntry" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SystemSettings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TradeCommodityCategory" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TransactionPayment" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TransactionPaymentLink" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "UserModuleAccess" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_tableName_recordId_idx" ON "AuditLog"("tenantId", "tableName", "recordId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_changedById_idx" ON "AuditLog"("tenantId", "changedById");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CashFloat_tenantId_idx" ON "CashFloat"("tenantId");

-- CreateIndex
CREATE INDEX "CashFloat_tenantId_floatDate_idx" ON "CashFloat"("tenantId", "floatDate");

-- CreateIndex
CREATE UNIQUE INDEX "CashFloat_tenantId_floatDate_key" ON "CashFloat"("tenantId", "floatDate");

-- CreateIndex
CREATE INDEX "CashUp_tenantId_idx" ON "CashUp"("tenantId");

-- CreateIndex
CREATE INDEX "CashUp_tenantId_status_idx" ON "CashUp"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CashUp_tenantId_openedByUserId_idx" ON "CashUp"("tenantId", "openedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CashUp_tenantId_sessionDate_key" ON "CashUp"("tenantId", "sessionDate");

-- CreateIndex
CREATE INDEX "CategoryStepConfig_tenantId_idx" ON "CategoryStepConfig"("tenantId");

-- CreateIndex
CREATE INDEX "CategoryStepConfig_tenantId_categoryId_idx" ON "CategoryStepConfig"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idNumber_idx" ON "Customer"("tenantId", "idNumber");

-- CreateIndex
CREATE INDEX "Customer_tenantId_phone_idx" ON "Customer"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Customer_tenantId_lastName_idx" ON "Customer"("tenantId", "lastName");

-- CreateIndex
CREATE INDEX "Customer_tenantId_customerType_idx" ON "Customer"("tenantId", "customerType");

-- CreateIndex
CREATE INDEX "Customer_tenantId_companyName_idx" ON "Customer"("tenantId", "companyName");

-- CreateIndex
CREATE INDEX "Customer_tenantId_contactPerson_idx" ON "Customer"("tenantId", "contactPerson");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_idNumber_key" ON "Customer"("tenantId", "idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_accountCode_key" ON "Customer"("tenantId", "accountCode");

-- CreateIndex
CREATE INDEX "CustomerDocument_tenantId_idx" ON "CustomerDocument"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerDocument_tenantId_customerId_idx" ON "CustomerDocument"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_idx" ON "Expense"("tenantId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_expenseTypeId_idx" ON "Expense"("tenantId", "expenseTypeId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_status_idx" ON "Expense"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Expense_tenantId_createdAt_idx" ON "Expense"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_tenantId_refNumber_key" ON "Expense"("tenantId", "refNumber");

-- CreateIndex
CREATE INDEX "ExpenseAttachment_tenantId_idx" ON "ExpenseAttachment"("tenantId");

-- CreateIndex
CREATE INDEX "ExpenseAttachment_tenantId_expenseId_idx" ON "ExpenseAttachment"("tenantId", "expenseId");

-- CreateIndex
CREATE INDEX "ExpenseType_tenantId_idx" ON "ExpenseType"("tenantId");

-- CreateIndex
CREATE INDEX "ExpenseType_tenantId_parentId_idx" ON "ExpenseType"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseType_tenantId_name_key" ON "ExpenseType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "FloatMovement_tenantId_idx" ON "FloatMovement"("tenantId");

-- CreateIndex
CREATE INDEX "FloatMovement_tenantId_cashFloatId_idx" ON "FloatMovement"("tenantId", "cashFloatId");

-- CreateIndex
CREATE INDEX "FloatMovement_tenantId_createdAt_idx" ON "FloatMovement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Loan_tenantId_idx" ON "Loan"("tenantId");

-- CreateIndex
CREATE INDEX "Loan_tenantId_customerId_idx" ON "Loan"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Loan_tenantId_status_idx" ON "Loan"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Loan_tenantId_createdAt_idx" ON "Loan"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_tenantId_refNumber_key" ON "Loan"("tenantId", "refNumber");

-- CreateIndex
CREATE INDEX "LoanRepayment_tenantId_idx" ON "LoanRepayment"("tenantId");

-- CreateIndex
CREATE INDEX "LoanRepayment_tenantId_loanId_idx" ON "LoanRepayment"("tenantId", "loanId");

-- CreateIndex
CREATE INDEX "LoanRepayment_tenantId_customerId_idx" ON "LoanRepayment"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "LoanRepayment_tenantId_purchaseId_idx" ON "LoanRepayment"("tenantId", "purchaseId");

-- CreateIndex
CREATE INDEX "LoanRepayment_tenantId_createdAt_idx" ON "LoanRepayment"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoanRepayment_tenantId_refNumber_key" ON "LoanRepayment"("tenantId", "refNumber");

-- CreateIndex
CREATE INDEX "MediaFile_tenantId_idx" ON "MediaFile"("tenantId");

-- CreateIndex
CREATE INDEX "MediaFile_tenantId_linkedModel_linkedId_idx" ON "MediaFile"("tenantId", "linkedModel", "linkedId");

-- CreateIndex
CREATE INDEX "MediaFile_tenantId_uploadedAt_idx" ON "MediaFile"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_customerId_idx" ON "Payment"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_createdAt_idx" ON "Payment"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_refNumber_key" ON "Payment"("tenantId", "refNumber");

-- CreateIndex
CREATE INDEX "PoliceSearchLog_tenantId_idx" ON "PoliceSearchLog"("tenantId");

-- CreateIndex
CREATE INDEX "PoliceSearchLog_tenantId_visitId_idx" ON "PoliceSearchLog"("tenantId", "visitId");

-- CreateIndex
CREATE INDEX "PoliceSearchLog_tenantId_createdAt_idx" ON "PoliceSearchLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PoliceVisit_tenantId_idx" ON "PoliceVisit"("tenantId");

-- CreateIndex
CREATE INDEX "PoliceVisit_tenantId_visitDate_idx" ON "PoliceVisit"("tenantId", "visitDate");

-- CreateIndex
CREATE INDEX "PoliceVisit_tenantId_createdAt_idx" ON "PoliceVisit"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PoliceVisit_tenantId_status_idx" ON "PoliceVisit"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PriceGroup_tenantId_idx" ON "PriceGroup"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceGroup_tenantId_name_key" ON "PriceGroup"("tenantId", "name");

-- CreateIndex
CREATE INDEX "PriceGroupProductOverride_tenantId_idx" ON "PriceGroupProductOverride"("tenantId");

-- CreateIndex
CREATE INDEX "PriceGroupProductOverride_tenantId_productId_idx" ON "PriceGroupProductOverride"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceGroupProductOverride_tenantId_priceGroupId_productId_key" ON "PriceGroupProductOverride"("tenantId", "priceGroupId", "productId");

-- CreateIndex
CREATE INDEX "PriceHistory_tenantId_idx" ON "PriceHistory"("tenantId");

-- CreateIndex
CREATE INDEX "PriceHistory_tenantId_productId_idx" ON "PriceHistory"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "PriceHistory_tenantId_createdAt_idx" ON "PriceHistory"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_category_idx" ON "Product"("tenantId", "category");

-- CreateIndex
CREATE INDEX "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "Product_tenantId_isActive_idx" ON "Product"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_code_key" ON "Product"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ProductCategory_tenantId_idx" ON "ProductCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_tenantId_name_key" ON "ProductCategory"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_idx" ON "Purchase"("tenantId");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_customerId_idx" ON "Purchase"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_status_idx" ON "Purchase"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_createdAt_idx" ON "Purchase"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_customerId_status_createdAt_idx" ON "Purchase"("tenantId", "customerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_tenantId_refNumber_key" ON "Purchase"("tenantId", "refNumber");

-- CreateIndex
CREATE INDEX "PurchaseLine_tenantId_idx" ON "PurchaseLine"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseLine_tenantId_purchaseId_idx" ON "PurchaseLine"("tenantId", "purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseLine_tenantId_productId_idx" ON "PurchaseLine"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_idx" ON "Sale"("tenantId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_buyerId_idx" ON "Sale"("tenantId", "buyerId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_customerId_idx" ON "Sale"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_status_idx" ON "Sale"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Sale_tenantId_createdAt_idx" ON "Sale"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_tenantId_refNumber_key" ON "Sale"("tenantId", "refNumber");

-- CreateIndex
CREATE INDEX "SaleLine_tenantId_idx" ON "SaleLine"("tenantId");

-- CreateIndex
CREATE INDEX "SaleLine_tenantId_saleId_idx" ON "SaleLine"("tenantId", "saleId");

-- CreateIndex
CREATE INDEX "SaleLine_tenantId_productId_idx" ON "SaleLine"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "ScaleOrder_tenantId_idx" ON "ScaleOrder"("tenantId");

-- CreateIndex
CREATE INDEX "ScaleOrder_tenantId_customerId_idx" ON "ScaleOrder"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ScaleOrder_tenantId_productId_idx" ON "ScaleOrder"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "ScaleOrder_tenantId_operatorId_idx" ON "ScaleOrder"("tenantId", "operatorId");

-- CreateIndex
CREATE INDEX "ScaleOrder_tenantId_status_idx" ON "ScaleOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ScaleOrder_tenantId_createdAt_idx" ON "ScaleOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScaleOrder_tenantId_orderNumber_key" ON "ScaleOrder"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "ScaleOrderLine_tenantId_idx" ON "ScaleOrderLine"("tenantId");

-- CreateIndex
CREATE INDEX "ScaleOrderLine_tenantId_orderId_idx" ON "ScaleOrderLine"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "ScaleOrderLine_tenantId_productId_idx" ON "ScaleOrderLine"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_idx" ON "StockMovement"("tenantId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_productId_idx" ON "StockMovement"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_direction_idx" ON "StockMovement"("tenantId", "direction");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_source_idx" ON "StockMovement"("tenantId", "source");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_createdAt_idx" ON "StockMovement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_productId_createdAt_idx" ON "StockMovement"("tenantId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "Stocktake_tenantId_idx" ON "Stocktake"("tenantId");

-- CreateIndex
CREATE INDEX "Stocktake_tenantId_status_idx" ON "Stocktake"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Stocktake_tenantId_createdAt_idx" ON "Stocktake"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Stocktake_tenantId_refNumber_key" ON "Stocktake"("tenantId", "refNumber");

-- CreateIndex
CREATE INDEX "StocktakeEntry_tenantId_idx" ON "StocktakeEntry"("tenantId");

-- CreateIndex
CREATE INDEX "StocktakeEntry_tenantId_stocktakeId_idx" ON "StocktakeEntry"("tenantId", "stocktakeId");

-- CreateIndex
CREATE INDEX "StocktakeEntry_tenantId_productId_idx" ON "StocktakeEntry"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeEntry_tenantId_stocktakeId_productId_key" ON "StocktakeEntry"("tenantId", "stocktakeId", "productId");

-- CreateIndex
CREATE INDEX "SystemSettings_tenantId_idx" ON "SystemSettings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSettings_tenantId_key_key" ON "SystemSettings"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TradeCommodityCategory_tenantId_idx" ON "TradeCommodityCategory"("tenantId");

-- CreateIndex
CREATE INDEX "TradeCommodityCategory_tenantId_sortOrder_idx" ON "TradeCommodityCategory"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "TradeCommodityCategory_tenantId_isActive_idx" ON "TradeCommodityCategory"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TradeCommodityCategory_tenantId_name_key" ON "TradeCommodityCategory"("tenantId", "name");

-- CreateIndex
CREATE INDEX "TransactionPayment_tenantId_idx" ON "TransactionPayment"("tenantId");

-- CreateIndex
CREATE INDEX "TransactionPayment_tenantId_customerId_idx" ON "TransactionPayment"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "TransactionPayment_tenantId_createdAt_idx" ON "TransactionPayment"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionPayment_tenantId_refNumber_key" ON "TransactionPayment"("tenantId", "refNumber");

-- CreateIndex
CREATE INDEX "TransactionPaymentLink_tenantId_idx" ON "TransactionPaymentLink"("tenantId");

-- CreateIndex
CREATE INDEX "TransactionPaymentLink_tenantId_purchaseId_idx" ON "TransactionPaymentLink"("tenantId", "purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionPaymentLink_tenantId_transactionPaymentId_purcha_key" ON "TransactionPaymentLink"("tenantId", "transactionPaymentId", "purchaseId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");

-- CreateIndex
CREATE INDEX "UserModuleAccess_tenantId_idx" ON "UserModuleAccess"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserModuleAccess_tenantId_userId_moduleKey_key" ON "UserModuleAccess"("tenantId", "userId", "moduleKey");

-- AddForeignKey (hand-written — see i-need-you-to-vectorized-pumpkin.md
-- Section 2 "FK design": tenantId is a plain scalar column, not a Prisma
-- @relation, so these constraints don't come from `prisma migrate diff`.
-- ON DELETE RESTRICT: a Tenant row must never be deletable while it still
-- has business data attached — the Tenant row is retired (status change),
-- never hard-deleted, so this should never actually fire in practice.)
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserModuleAccess" ADD CONSTRAINT "UserModuleAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceGroup" ADD CONSTRAINT "PriceGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceGroupProductOverride" ADD CONSTRAINT "PriceGroupProductOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TradeCommodityCategory" ADD CONSTRAINT "TradeCommodityCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CategoryStepConfig" ADD CONSTRAINT "CategoryStepConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseType" ADD CONSTRAINT "ExpenseType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashFloat" ADD CONSTRAINT "CashFloat_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StocktakeEntry" ADD CONSTRAINT "StocktakeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashUp" ADD CONSTRAINT "CashUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PoliceVisit" ADD CONSTRAINT "PoliceVisit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PoliceSearchLog" ADD CONSTRAINT "PoliceSearchLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaFile" ADD CONSTRAINT "MediaFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FloatMovement" ADD CONSTRAINT "FloatMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransactionPayment" ADD CONSTRAINT "TransactionPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransactionPaymentLink" ADD CONSTRAINT "TransactionPaymentLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScaleOrder" ADD CONSTRAINT "ScaleOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScaleOrderLine" ADD CONSTRAINT "ScaleOrderLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

