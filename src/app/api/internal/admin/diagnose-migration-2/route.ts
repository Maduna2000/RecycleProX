import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { requireRole } from '@/lib/auth-helpers'

// ONE-TIME USE — recovery route for Migration 2 (20260716000002_tenant_id_constraints)
// having failed partway (P3009) on first attempt. Postgres auto-rolls back
// a failed migration's DDL transaction, so the table structure is safely
// back to "Migration 1 only" — this route just (1) reports which tables
// still have NULL tenantId (likely rows created by live traffic between the
// backfill and this deploy, since production was still running the old
// tenant-unaware app code in that window), (2) re-runs the idempotent
// backfill to catch them, and (3) does NOT touch _prisma_migrations —
// resolving that is a separate, deliberate step once NULLs are confirmed
// at zero.
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

export async function GET() {
  const { response } = await requireRole(['admin'])
  if (response) return response

  const prisma = new PrismaClient()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant = await (prisma as any).tenant.findUnique({ where: { schemaName: 'public' } })
    if (!tenant) {
      return NextResponse.json({ error: 'No Tenant row for schemaName "public"' }, { status: 400 })
    }

    const nullCountsBefore: Record<string, number> = {}
    for (const table of TENANT_SCOPED_TABLES) {
      const rows = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}" WHERE "tenantId" IS NULL`)
      nullCountsBefore[table] = (rows as Array<{ n: number }>)[0]?.n ?? 0
    }

    const backfilled: Record<string, number> = {}
    let totalBackfilled = 0
    for (const table of TENANT_SCOPED_TABLES) {
      if (nullCountsBefore[table] === 0) continue
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
        tenant.id,
      )
      backfilled[table] = Number(result)
      totalBackfilled += Number(result)
    }

    const migrationRows = await prisma.$queryRawUnsafe(
      `SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations" WHERE migration_name = '20260716000002_tenant_id_constraints'`,
    )

    return NextResponse.json({
      status: 'checked',
      tenantId: tenant.id,
      nullCountsBeforeFix: Object.fromEntries(Object.entries(nullCountsBefore).filter(([, n]) => n > 0)),
      rowsBackfilledJustNow: backfilled,
      totalBackfilledJustNow: totalBackfilled,
      migration2BookkeepingRows: migrationRows,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
