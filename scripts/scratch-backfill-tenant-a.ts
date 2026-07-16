// SCRATCH-PROJECT ONLY — mirrors the real Golden Key backfill logic from
// i-need-you-to-vectorized-pumpkin.md Section 3, run here first against
// synthetic seed data to verify the mechanism before ever touching
// production. Registers "Tenant A" (standing in for Golden Key) and stamps
// its id onto every existing row across all 35 tenant-scoped tables.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TENANT_SCOPED_TABLES = [
  'User', 'UserModuleAccess', 'AuditLog', 'SystemSettings', 'Customer',
  'CustomerDocument', 'Product', 'PriceGroup', 'PriceGroupProductOverride',
  'PriceHistory', 'ProductCategory', 'TradeCommodityCategory', 'CategoryStepConfig',
  'Purchase', 'PurchaseLine', 'Sale', 'SaleLine', 'StockMovement', 'Payment',
  'ExpenseType', 'Expense', 'ExpenseAttachment', 'CashFloat', 'Stocktake',
  'StocktakeEntry', 'CashUp', 'Loan', 'LoanRepayment', 'PoliceVisit',
  'PoliceSearchLog', 'MediaFile', 'FloatMovement', 'TransactionPayment',
  'TransactionPaymentLink', 'ScaleOrder', 'ScaleOrderLine',
]

async function main() {
  let tenant = await prisma.tenant.findUnique({ where: { companySlug: 'scratch-tenant-a' } })
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { companySlug: 'scratch-tenant-a', schemaName: 'public', companyName: 'Scratch Tenant A (Golden Key stand-in)', status: 'active' },
    })
    console.log(`Created Tenant A: ${tenant.id}`)
  } else {
    console.log(`Tenant A already exists: ${tenant.id}`)
  }

  for (const table of TENANT_SCOPED_TABLES) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
      tenant.id,
    )
    console.log(`${table}: ${result} rows backfilled`)
  }

  console.log(`\nDone. Tenant A id: ${tenant.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
