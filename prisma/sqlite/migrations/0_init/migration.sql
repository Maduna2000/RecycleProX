-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "pinHash" TEXT,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "forcePasswordChange" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdByUserId" TEXT
);

-- CreateTable
CREATE TABLE "UserModuleAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "grantedById" TEXT,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserModuleAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValues" TEXT,
    "newValues" TEXT,
    "changedById" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "rowHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerType" TEXT NOT NULL DEFAULT 'casual',
    "primaryFunction" TEXT NOT NULL DEFAULT 'supplier',
    "idNumber" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATETIME,
    "gender" TEXT,
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
    "creditLimit" DECIMAL,
    "policeRegisterNo" TEXT,
    "licenseNumber" TEXT,
    "licenseExpiry" DATETIME,
    "tradeCommodities" TEXT,
    "customerNotes" TEXT,
    "idPhotoR2Key" TEXT,
    "priceGroupId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklistReason" TEXT,
    "blacklistedAt" DATETIME,
    "blacklistedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdByUserId" TEXT,
    "dealerCategory" TEXT,
    "marketSector" TEXT,
    "zeroRated" BOOLEAN NOT NULL DEFAULT false,
    "accountCode" TEXT,
    "companyRegNumber" TEXT,
    "landline" TEXT,
    CONSTRAINT "Customer_priceGroupId_fkey" FOREIGN KEY ("priceGroupId") REFERENCES "PriceGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT,
    CONSTRAINT "CustomerDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categoryId" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "defaultBuyPrice" DECIMAL NOT NULL,
    "defaultSellPrice" DECIMAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "minStockLevel" DECIMAL,
    "buyMarginPct" DECIMAL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceGroupProductOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "priceGroupId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "buyPrice" DECIMAL NOT NULL,
    "sellPrice" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PriceGroupProductOverride_priceGroupId_fkey" FOREIGN KEY ("priceGroupId") REFERENCES "PriceGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriceGroupProductOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "buyPrice" DECIMAL NOT NULL,
    "sellPrice" DECIMAL NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "colorHex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "iconName" TEXT,
    "parentId" TEXT,
    CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeCommodityCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CategoryStepConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "requireWeight" BOOLEAN NOT NULL DEFAULT true,
    "requirePhotos" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdByUserId" TEXT,
    CONSTRAINT "CategoryStepConfig_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "totalAmount" DECIMAL NOT NULL,
    "vatAmount" DECIMAL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "voidedAt" DATETIME,
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "signatureR2Key" TEXT,
    "vat264R2Key" TEXT,
    "loanDeductionAmount" DECIMAL,
    "photoR2Keys" TEXT NOT NULL DEFAULT '[]',
    "amountPaid" DECIMAL NOT NULL DEFAULT 0,
    "hasOutstandingBalance" BOOLEAN NOT NULL DEFAULT false,
    "pdfEmailed" BOOLEAN NOT NULL DEFAULT false,
    "purchaseNoteR2Key" TEXT,
    "vehicleReg" TEXT,
    "wbTicketNumber" TEXT,
    "splitPayments" TEXT,
    "scaleOrderId" TEXT,
    CONSTRAINT "Purchase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_scaleOrderId_fkey" FOREIGN KEY ("scaleOrderId") REFERENCES "ScaleOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "lineTotal" DECIMAL NOT NULL,
    "vatApplied" BOOLEAN,
    "vatAmount" DECIMAL,
    "priceSource" TEXT NOT NULL DEFAULT 'default',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grossQty" DECIMAL,
    "tareQty" DECIMAL,
    "tareReason" TEXT,
    "deductionQty" DECIMAL,
    "deductionReason" TEXT,
    CONSTRAINT "PurchaseLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNumber" TEXT NOT NULL,
    "buyerId" TEXT,
    "buyerName" TEXT,
    "buyerIdNumber" TEXT,
    "buyerPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "totalAmount" DECIMAL NOT NULL,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "voidedAt" DATETIME,
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "customerId" TEXT,
    "photoR2Key" TEXT,
    "amountPaid" DECIMAL,
    "hasOutstandingBalance" BOOLEAN NOT NULL DEFAULT false,
    "photoR2Keys" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "lineTotal" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deductionQty" DECIMAL,
    "deductionReason" TEXT,
    "grossQty" DECIMAL,
    "tareQty" DECIMAL,
    "tareReason" TEXT,
    CONSTRAINT "SaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "amount" DECIMAL NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "voidedAt" DATETIME,
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpenseType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseType_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ExpenseType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNumber" TEXT NOT NULL,
    "expenseTypeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "estimatedAmount" DECIMAL,
    "changeReceived" DECIMAL,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "includesVat" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "chequeNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "cashUpId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_expenseTypeId_fkey" FOREIGN KEY ("expenseTypeId") REFERENCES "ExpenseType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpenseAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expenseId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT,
    CONSTRAINT "ExpenseAttachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CashFloat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "floatDate" DATETIME NOT NULL,
    "openingAmount" DECIMAL NOT NULL,
    "closingAmount" DECIMAL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Stocktake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "stockSnapshot" TEXT,
    "voidReason" TEXT,
    "voidedAt" DATETIME,
    "voidedByUserId" TEXT,
    CONSTRAINT "Stocktake_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Stocktake_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StocktakeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stocktakeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "systemQty" DECIMAL NOT NULL,
    "countedQty" DECIMAL NOT NULL,
    "variance" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "grossQty" DECIMAL,
    "tareQty" DECIMAL,
    "photoR2Key" TEXT,
    CONSTRAINT "StocktakeEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StocktakeEntry_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CashUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionDate" DATETIME NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "openedByUserId" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" TEXT,
    "closedAt" DATETIME,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    "systemCashSales" DECIMAL NOT NULL DEFAULT 0,
    "systemCashPurchases" DECIMAL NOT NULL DEFAULT 0,
    "systemCashPayments" DECIMAL NOT NULL DEFAULT 0,
    "systemCashExpected" DECIMAL NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL NOT NULL DEFAULT 0,
    "drawingsReceived" DECIMAL NOT NULL DEFAULT 0,
    "expensesTotal" DECIMAL NOT NULL DEFAULT 0,
    "cardPaymentsTotal" DECIMAL NOT NULL DEFAULT 0,
    "loansTotal" DECIMAL NOT NULL DEFAULT 0,
    "finPeriodCumulative" DECIMAL NOT NULL DEFAULT 0,
    "declaredCash" DECIMAL,
    "variance" DECIMAL,
    "notes" TEXT,
    "denominations" TEXT,
    "rejectedByUserId" TEXT,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "principalAmount" DECIMAL NOT NULL,
    "balanceAmount" DECIMAL NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "voidedAt" DATETIME,
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Loan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanRepayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNumber" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseId" TEXT,
    CONSTRAINT "LoanRepayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LoanRepayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanRepayment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PoliceVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitDate" DATETIME NOT NULL,
    "officerName" TEXT NOT NULL,
    "badgeNumber" TEXT,
    "stationName" TEXT,
    "rank" TEXT,
    "contactNumber" TEXT,
    "visitReason" TEXT,
    "visitNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "startedAt" DATETIME,
    "signedAt" DATETIME,
    "launchedByUserId" TEXT,
    "registerR2Key" TEXT,
    "signatureR2Key" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PoliceSearchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitId" TEXT NOT NULL,
    "searchType" TEXT NOT NULL,
    "queryText" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PoliceSearchLog_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "PoliceVisit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "r2Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "linkedModel" TEXT NOT NULL,
    "linkedId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FloatMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cashFloatId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "balanceAfter" DECIMAL NOT NULL,
    "referenceNote" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FloatMovement_cashFloatId_fkey" FOREIGN KEY ("cashFloatId") REFERENCES "CashFloat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransactionPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "totalAmount" DECIMAL NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransactionPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransactionPaymentLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionPaymentId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "amountAllocated" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionPaymentLink_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransactionPaymentLink_transactionPaymentId_fkey" FOREIGN KEY ("transactionPaymentId") REFERENCES "TransactionPayment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScaleOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "productId" TEXT NOT NULL,
    "weight" DECIMAL,
    "photoR2Keys" TEXT NOT NULL DEFAULT '[]',
    "slipR2Key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "operatorId" TEXT NOT NULL,
    "notes" TEXT,
    "voidedAt" DATETIME,
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "casualFirstName" TEXT,
    "casualLastName" TEXT,
    "casualPhone" TEXT,
    "lineCount" INTEGER NOT NULL DEFAULT 1,
    "casualIdNumber" TEXT,
    CONSTRAINT "ScaleOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScaleOrder_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScaleOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScaleOrder_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScaleOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "weight" DECIMAL,
    "photoR2Keys" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScaleOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ScaleOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScaleOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" DATETIME
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "tableName" TEXT NOT NULL PRIMARY KEY,
    "lastPulledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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

-- CreateIndex
CREATE INDEX "SyncOutbox_status_idx" ON "SyncOutbox"("status");

