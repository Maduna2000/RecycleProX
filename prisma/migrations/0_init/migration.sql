-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'manager', 'cashier', 'scale_operator');

-- CreateEnum
CREATE TYPE "ScaleOrderStatus" AS ENUM ('pending', 'processed', 'voided');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('casual', 'account');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('pending', 'completed', 'voided');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'eft', 'cheque', 'card');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('kg', 'ton', 'each', 'litre');

-- CreateEnum
CREATE TYPE "StockDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "PrimaryFunction" AS ENUM ('customer', 'supplier', 'both');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'VOID', 'LOGIN', 'LOGOUT', 'PRINT', 'EXPORT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MarketSector" AS ENUM ('formal', 'informal');

-- CreateEnum
CREATE TYPE "DealerCategory" AS ENUM ('casual', 'dealer_1', 'dealer_2', 'dealer_3');

-- CreateEnum
CREATE TYPE "CustomerDocumentType" AS ENUM ('trading_licence', 'sars_certificate', 'company_registration', 'id_copy', 'other');

-- CreateEnum
CREATE TYPE "FloatMovementType" AS ENUM ('opening', 'top_up', 'withdrawal', 'adjustment');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('pending', 'approved', 'voided');

-- CreateEnum
CREATE TYPE "CashUpStatus" AS ENUM ('open', 'submitted', 'approved', 'voided');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ZAR', 'SZL');

-- CreateEnum
CREATE TYPE "StocktakeStatus" AS ENUM ('open', 'completed', 'voided');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('active', 'settled', 'voided');

-- CreateEnum
CREATE TYPE "PoliceVisitStatus" AS ENUM ('active', 'completed', 'expired');

-- CreateEnum
CREATE TYPE "PoliceVisitReason" AS ENUM ('routine_inspection', 'stolen_goods_investigation', 'person_enquiry', 'other');

-- CreateEnum
CREATE TYPE "PoliceSearchType" AS ENUM ('register_by_date', 'person', 'goods');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "pinHash" TEXT,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "forcePasswordChange" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserModuleAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "changedById" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "rowHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "customerType" "CustomerType" NOT NULL DEFAULT 'casual',
    "primaryFunction" "PrimaryFunction" NOT NULL DEFAULT 'supplier',
    "idNumber" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "nationality" TEXT,
    "companyName" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "physicalAddress" TEXT,
    "postalAddress" TEXT,
    "vatNumber" TEXT,
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "bankBranchCode" TEXT,
    "creditLimit" DECIMAL(18,2),
    "policeRegisterNo" TEXT,
    "licenseNumber" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "tradeCommodities" JSONB,
    "customerNotes" TEXT,
    "idPhotoR2Key" TEXT,
    "priceGroupId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklistReason" TEXT,
    "blacklistedAt" TIMESTAMP(3),
    "blacklistedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "dealerCategory" "DealerCategory",
    "marketSector" "MarketSector",
    "zeroRated" BOOLEAN NOT NULL DEFAULT false,
    "accountCode" TEXT,
    "companyRegNumber" TEXT,
    "landline" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerDocument" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "documentType" "CustomerDocumentType" NOT NULL,
    "r2Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT,

    CONSTRAINT "CustomerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categoryId" TEXT,
    "unit" "UnitOfMeasure" NOT NULL DEFAULT 'kg',
    "defaultBuyPrice" DECIMAL(18,2) NOT NULL,
    "defaultSellPrice" DECIMAL(18,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "minStockLevel" DECIMAL(18,3),
    "buyMarginPct" DECIMAL(8,4),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceGroupProductOverride" (
    "id" TEXT NOT NULL,
    "priceGroupId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "buyPrice" DECIMAL(18,2) NOT NULL,
    "sellPrice" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceGroupProductOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "buyPrice" DECIMAL(18,2) NOT NULL,
    "sellPrice" DECIMAL(18,2) NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorHex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "iconName" TEXT,
    "parentId" TEXT,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeCommodityCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeCommodityCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryStepConfig" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "requireWeight" BOOLEAN NOT NULL DEFAULT true,
    "requirePhotos" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "CategoryStepConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'completed',
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2),
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "signatureR2Key" TEXT,
    "vat264R2Key" TEXT,
    "loanDeductionAmount" DECIMAL(18,2),
    "photoR2Keys" TEXT[],
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "hasOutstandingBalance" BOOLEAN NOT NULL DEFAULT false,
    "pdfEmailed" BOOLEAN NOT NULL DEFAULT false,
    "purchaseNoteR2Key" TEXT,
    "vehicleReg" TEXT,
    "wbTicketNumber" TEXT,
    "splitPayments" JSONB,
    "scaleOrderId" TEXT,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseLine" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "vatApplied" BOOLEAN,
    "vatAmount" DECIMAL(18,2),
    "priceSource" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grossQty" DECIMAL(18,3),
    "tareQty" DECIMAL(18,3),
    "tareReason" TEXT,
    "deductionQty" DECIMAL(18,3),
    "deductionReason" TEXT,

    CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "buyerId" TEXT,
    "buyerName" TEXT,
    "buyerIdNumber" TEXT,
    "buyerPhone" TEXT,
    "status" "TxStatus" NOT NULL DEFAULT 'completed',
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "photoR2Key" TEXT,
    "amountPaid" DECIMAL(18,2),
    "hasOutstandingBalance" BOOLEAN NOT NULL DEFAULT false,
    "photoR2Keys" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deductionQty" DECIMAL(18,3),
    "deductionReason" TEXT,
    "grossQty" DECIMAL(18,3),
    "tareQty" DECIMAL(18,3),
    "tareReason" TEXT,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "direction" "StockDirection" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "expenseTypeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "estimatedAmount" DECIMAL(18,2),
    "changeReceived" DECIMAL(18,2),
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "includesVat" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "chequeNo" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cashUpId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAttachment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT,

    CONSTRAINT "ExpenseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFloat" (
    "id" TEXT NOT NULL,
    "floatDate" DATE NOT NULL,
    "openingAmount" DECIMAL(18,2) NOT NULL,
    "closingAmount" DECIMAL(18,2),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashFloat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stocktake" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "status" "StocktakeStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stockSnapshot" JSONB,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,

    CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeEntry" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "systemQty" DECIMAL(18,4) NOT NULL,
    "countedQty" DECIMAL(18,4) NOT NULL,
    "variance" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "grossQty" DECIMAL(18,4),
    "tareQty" DECIMAL(18,4),
    "photoR2Key" TEXT,

    CONSTRAINT "StocktakeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashUp" (
    "id" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ZAR',
    "openedByUserId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" "CashUpStatus" NOT NULL DEFAULT 'open',
    "systemCashSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "systemCashPurchases" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "systemCashPayments" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "systemCashExpected" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "drawingsReceived" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expensesTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cardPaymentsTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "loansTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "finPeriodCumulative" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "declaredCash" DECIMAL(18,2),
    "variance" DECIMAL(18,2),
    "notes" TEXT,
    "denominations" JSONB,
    "rejectedByUserId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "principalAmount" DECIMAL(18,2) NOT NULL,
    "balanceAmount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "status" "LoanStatus" NOT NULL DEFAULT 'active',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanRepayment" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseId" TEXT,

    CONSTRAINT "LoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliceVisit" (
    "id" TEXT NOT NULL,
    "visitDate" DATE NOT NULL,
    "officerName" TEXT NOT NULL,
    "badgeNumber" TEXT,
    "stationName" TEXT,
    "rank" TEXT,
    "contactNumber" TEXT,
    "visitReason" "PoliceVisitReason",
    "visitNote" TEXT,
    "status" "PoliceVisitStatus" NOT NULL DEFAULT 'completed',
    "startedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "launchedByUserId" TEXT,
    "registerR2Key" TEXT,
    "signatureR2Key" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoliceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliceSearchLog" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "searchType" "PoliceSearchType" NOT NULL,
    "queryText" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoliceSearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "linkedModel" TEXT NOT NULL,
    "linkedId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloatMovement" (
    "id" TEXT NOT NULL,
    "cashFloatId" TEXT NOT NULL,
    "movementType" "FloatMovementType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "referenceNote" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloatMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionPayment" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionPaymentLink" (
    "id" TEXT NOT NULL,
    "transactionPaymentId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "amountAllocated" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionPaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScaleOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "productId" TEXT NOT NULL,
    "weight" DECIMAL(18,3),
    "photoR2Keys" TEXT[],
    "slipR2Key" TEXT,
    "status" "ScaleOrderStatus" NOT NULL DEFAULT 'pending',
    "operatorId" TEXT NOT NULL,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "casualFirstName" TEXT,
    "casualLastName" TEXT,
    "casualPhone" TEXT,
    "lineCount" INTEGER NOT NULL DEFAULT 1,
    "casualIdNumber" TEXT,

    CONSTRAINT "ScaleOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScaleOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "weight" DECIMAL(18,3),
    "photoR2Keys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScaleOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "UserModuleAccess_userId_idx" ON "UserModuleAccess"("userId");

-- CreateIndex
CREATE INDEX "UserModuleAccess_moduleKey_idx" ON "UserModuleAccess"("moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserModuleAccess_userId_moduleKey_key" ON "UserModuleAccess"("userId", "moduleKey");

-- CreateIndex
CREATE INDEX "AuditLog_tableName_recordId_idx" ON "AuditLog"("tableName", "recordId");

-- CreateIndex
CREATE INDEX "AuditLog_changedById_idx" ON "AuditLog"("changedById");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSettings_key_key" ON "SystemSettings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_idNumber_key" ON "Customer"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_accountCode_key" ON "Customer"("accountCode");

-- CreateIndex
CREATE INDEX "Customer_idNumber_idx" ON "Customer"("idNumber");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_lastName_idx" ON "Customer"("lastName");

-- CreateIndex
CREATE INDEX "Customer_customerType_idx" ON "Customer"("customerType");

-- CreateIndex
CREATE INDEX "Customer_companyName_idx" ON "Customer"("companyName");

-- CreateIndex
CREATE INDEX "Customer_contactPerson_idx" ON "Customer"("contactPerson");

-- CreateIndex
CREATE INDEX "CustomerDocument_customerId_idx" ON "CustomerDocument"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PriceGroup_name_key" ON "PriceGroup"("name");

-- CreateIndex
CREATE INDEX "PriceGroupProductOverride_productId_idx" ON "PriceGroupProductOverride"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceGroupProductOverride_priceGroupId_productId_key" ON "PriceGroupProductOverride"("priceGroupId", "productId");

-- CreateIndex
CREATE INDEX "PriceHistory_productId_idx" ON "PriceHistory"("productId");

-- CreateIndex
CREATE INDEX "PriceHistory_createdAt_idx" ON "PriceHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "ProductCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TradeCommodityCategory_name_key" ON "TradeCommodityCategory"("name");

-- CreateIndex
CREATE INDEX "TradeCommodityCategory_sortOrder_idx" ON "TradeCommodityCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "TradeCommodityCategory_isActive_idx" ON "TradeCommodityCategory"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryStepConfig_categoryId_key" ON "CategoryStepConfig"("categoryId");

-- CreateIndex
CREATE INDEX "CategoryStepConfig_categoryId_idx" ON "CategoryStepConfig"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_refNumber_key" ON "Purchase"("refNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_scaleOrderId_key" ON "Purchase"("scaleOrderId");

-- CreateIndex
CREATE INDEX "Purchase_customerId_idx" ON "Purchase"("customerId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");

-- CreateIndex
CREATE INDEX "Purchase_refNumber_idx" ON "Purchase"("refNumber");

-- CreateIndex
CREATE INDEX "Purchase_customerId_status_createdAt_idx" ON "Purchase"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseLine_purchaseId_idx" ON "PurchaseLine"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseLine_productId_idx" ON "PurchaseLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_refNumber_key" ON "Sale"("refNumber");

-- CreateIndex
CREATE INDEX "Sale_buyerId_idx" ON "Sale"("buyerId");

-- CreateIndex
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- CreateIndex
CREATE INDEX "Sale_status_idx" ON "Sale"("status");

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- CreateIndex
CREATE INDEX "Sale_refNumber_idx" ON "Sale"("refNumber");

-- CreateIndex
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");

-- CreateIndex
CREATE INDEX "SaleLine_productId_idx" ON "SaleLine"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_direction_idx" ON "StockMovement"("direction");

-- CreateIndex
CREATE INDEX "StockMovement_source_idx" ON "StockMovement"("source");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_refNumber_key" ON "Payment"("refNumber");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_refNumber_idx" ON "Payment"("refNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseType_name_key" ON "ExpenseType"("name");

-- CreateIndex
CREATE INDEX "ExpenseType_parentId_idx" ON "ExpenseType"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_refNumber_key" ON "Expense"("refNumber");

-- CreateIndex
CREATE INDEX "Expense_expenseTypeId_idx" ON "Expense"("expenseTypeId");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_createdAt_idx" ON "Expense"("createdAt");

-- CreateIndex
CREATE INDEX "ExpenseAttachment_expenseId_idx" ON "ExpenseAttachment"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "CashFloat_floatDate_key" ON "CashFloat"("floatDate");

-- CreateIndex
CREATE INDEX "CashFloat_floatDate_idx" ON "CashFloat"("floatDate");

-- CreateIndex
CREATE UNIQUE INDEX "Stocktake_refNumber_key" ON "Stocktake"("refNumber");

-- CreateIndex
CREATE INDEX "Stocktake_status_idx" ON "Stocktake"("status");

-- CreateIndex
CREATE INDEX "Stocktake_createdAt_idx" ON "Stocktake"("createdAt");

-- CreateIndex
CREATE INDEX "StocktakeEntry_stocktakeId_idx" ON "StocktakeEntry"("stocktakeId");

-- CreateIndex
CREATE INDEX "StocktakeEntry_productId_idx" ON "StocktakeEntry"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeEntry_stocktakeId_productId_key" ON "StocktakeEntry"("stocktakeId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "CashUp_sessionDate_key" ON "CashUp"("sessionDate");

-- CreateIndex
CREATE INDEX "CashUp_status_idx" ON "CashUp"("status");

-- CreateIndex
CREATE INDEX "CashUp_openedByUserId_idx" ON "CashUp"("openedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_refNumber_key" ON "Loan"("refNumber");

-- CreateIndex
CREATE INDEX "Loan_customerId_idx" ON "Loan"("customerId");

-- CreateIndex
CREATE INDEX "Loan_status_idx" ON "Loan"("status");

-- CreateIndex
CREATE INDEX "Loan_createdAt_idx" ON "Loan"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoanRepayment_refNumber_key" ON "LoanRepayment"("refNumber");

-- CreateIndex
CREATE INDEX "LoanRepayment_loanId_idx" ON "LoanRepayment"("loanId");

-- CreateIndex
CREATE INDEX "LoanRepayment_customerId_idx" ON "LoanRepayment"("customerId");

-- CreateIndex
CREATE INDEX "LoanRepayment_purchaseId_idx" ON "LoanRepayment"("purchaseId");

-- CreateIndex
CREATE INDEX "LoanRepayment_createdAt_idx" ON "LoanRepayment"("createdAt");

-- CreateIndex
CREATE INDEX "PoliceVisit_visitDate_idx" ON "PoliceVisit"("visitDate");

-- CreateIndex
CREATE INDEX "PoliceVisit_createdAt_idx" ON "PoliceVisit"("createdAt");

-- CreateIndex
CREATE INDEX "PoliceVisit_status_idx" ON "PoliceVisit"("status");

-- CreateIndex
CREATE INDEX "PoliceSearchLog_visitId_idx" ON "PoliceSearchLog"("visitId");

-- CreateIndex
CREATE INDEX "PoliceSearchLog_createdAt_idx" ON "PoliceSearchLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFile_r2Key_key" ON "MediaFile"("r2Key");

-- CreateIndex
CREATE INDEX "MediaFile_linkedModel_linkedId_idx" ON "MediaFile"("linkedModel", "linkedId");

-- CreateIndex
CREATE INDEX "MediaFile_uploadedAt_idx" ON "MediaFile"("uploadedAt");

-- CreateIndex
CREATE INDEX "FloatMovement_cashFloatId_idx" ON "FloatMovement"("cashFloatId");

-- CreateIndex
CREATE INDEX "FloatMovement_createdAt_idx" ON "FloatMovement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionPayment_refNumber_key" ON "TransactionPayment"("refNumber");

-- CreateIndex
CREATE INDEX "TransactionPayment_customerId_idx" ON "TransactionPayment"("customerId");

-- CreateIndex
CREATE INDEX "TransactionPayment_createdAt_idx" ON "TransactionPayment"("createdAt");

-- CreateIndex
CREATE INDEX "TransactionPaymentLink_purchaseId_idx" ON "TransactionPaymentLink"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionPaymentLink_transactionPaymentId_purchaseId_key" ON "TransactionPaymentLink"("transactionPaymentId", "purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ScaleOrder_orderNumber_key" ON "ScaleOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "ScaleOrder_customerId_idx" ON "ScaleOrder"("customerId");

-- CreateIndex
CREATE INDEX "ScaleOrder_productId_idx" ON "ScaleOrder"("productId");

-- CreateIndex
CREATE INDEX "ScaleOrder_operatorId_idx" ON "ScaleOrder"("operatorId");

-- CreateIndex
CREATE INDEX "ScaleOrder_status_idx" ON "ScaleOrder"("status");

-- CreateIndex
CREATE INDEX "ScaleOrder_createdAt_idx" ON "ScaleOrder"("createdAt");

-- CreateIndex
CREATE INDEX "ScaleOrderLine_orderId_idx" ON "ScaleOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "ScaleOrderLine_productId_idx" ON "ScaleOrderLine"("productId");

-- AddForeignKey
ALTER TABLE "UserModuleAccess" ADD CONSTRAINT "UserModuleAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_priceGroupId_fkey" FOREIGN KEY ("priceGroupId") REFERENCES "PriceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceGroupProductOverride" ADD CONSTRAINT "PriceGroupProductOverride_priceGroupId_fkey" FOREIGN KEY ("priceGroupId") REFERENCES "PriceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceGroupProductOverride" ADD CONSTRAINT "PriceGroupProductOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryStepConfig" ADD CONSTRAINT "CategoryStepConfig_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_scaleOrderId_fkey" FOREIGN KEY ("scaleOrderId") REFERENCES "ScaleOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseType" ADD CONSTRAINT "ExpenseType_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ExpenseType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_expenseTypeId_fkey" FOREIGN KEY ("expenseTypeId") REFERENCES "ExpenseType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeEntry" ADD CONSTRAINT "StocktakeEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeEntry" ADD CONSTRAINT "StocktakeEntry_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliceSearchLog" ADD CONSTRAINT "PoliceSearchLog_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "PoliceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloatMovement" ADD CONSTRAINT "FloatMovement_cashFloatId_fkey" FOREIGN KEY ("cashFloatId") REFERENCES "CashFloat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPayment" ADD CONSTRAINT "TransactionPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPaymentLink" ADD CONSTRAINT "TransactionPaymentLink_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPaymentLink" ADD CONSTRAINT "TransactionPaymentLink_transactionPaymentId_fkey" FOREIGN KEY ("transactionPaymentId") REFERENCES "TransactionPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleOrder" ADD CONSTRAINT "ScaleOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleOrder" ADD CONSTRAINT "ScaleOrder_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleOrder" ADD CONSTRAINT "ScaleOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleOrder" ADD CONSTRAINT "ScaleOrder_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleOrderLine" ADD CONSTRAINT "ScaleOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ScaleOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleOrderLine" ADD CONSTRAINT "ScaleOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

