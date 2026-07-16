// PRODUCTION backfill for Golden Key — the real counterpart to
// scripts/scratch-backfill-tenant-a.ts, run once against the real database
// after Migration 1 (20260716000001_add_tenant_id_nullable) has applied
// there and BEFORE Migration 2 (20260716000002_tenant_id_constraints,
// which adds the NOT NULL constraint — this backfill must complete first
// or that migration fails on every existing row).
//
// Golden Key's Tenant row already exists (registered 2026-07-15, schemaName
// "public" — see project_saas_platform_initiative.md) — this script does
// NOT create a Tenant row, only looks up the existing one and stamps its id
// onto every pre-existing business row. Idempotent: every UPDATE is guarded
// by `WHERE "tenantId" IS NULL`, safe to re-run if interrupted partway.
//
// Must run with DATABASE_URL pointed at production's OWNER role (needs
// UPDATE on every row, unfiltered — the restricted app_runtime role won't
// have rows visible to it yet anyway since RLS isn't enabled until the next
// migration). Never run this against a database where RLS is already
// enabled — the owner role bypasses RLS (see the BYPASSRLS finding in
// project_saas_platform_initiative.md) so it would still work, but the
// intended order is backfill-before-RLS, not after.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = await (prisma as any).tenant.findUnique({ where: { schemaName: 'public' } })
  if (!tenant) {
    throw new Error(
      'No Tenant row found for schemaName "public" — Golden Key must already be ' +
        'registered (see registerExistingTenant / /api/internal/tenants/register-existing) ' +
        'before this backfill can run. Refusing to create one here — that is a ' +
        'one-time onboarding action, not something a backfill script should do.',
    )
  }
  console.log(`Golden Key Tenant: ${tenant.id} (companySlug: ${tenant.companySlug})`)

  let totalRowsBackfilled = 0
  for (const table of TENANT_SCOPED_TABLES) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
      tenant.id,
    )
    console.log(`${table}: ${result} row(s) backfilled`)
    totalRowsBackfilled += Number(result)
  }

  console.log(`\nDone. Golden Key Tenant id: ${tenant.id}. Total rows backfilled: ${totalRowsBackfilled}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
