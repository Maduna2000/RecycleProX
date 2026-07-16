import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { requireRole } from '@/lib/auth-helpers'

// ONE-TIME USE — see i-need-you-to-vectorized-pumpkin.md Section 11, step 2.
// Stamps Golden Key's already-registered Tenant id onto every existing row
// across all 36 tenant-scoped tables (their tenantId column was just added,
// nullable, by the migration in this same deploy). Idempotent — every
// UPDATE is guarded by `WHERE "tenantId" IS NULL`. Delete this route after
// running it once successfully.
//
// Session/role-gated (not shared-secret) — this is meant to be triggered by
// a signed-in admin visiting the URL directly, the same working pattern
// used for Golden Key's own Portal onboarding earlier — not called
// server-to-server, so the shared secret (which can't be read locally due
// to Vercel's Sensitive-variable redaction) isn't needed here.
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
      return NextResponse.json({ error: 'No Tenant row for schemaName "public" — Golden Key must already be registered' }, { status: 400 })
    }

    const perTable: Record<string, number> = {}
    let total = 0
    for (const table of TENANT_SCOPED_TABLES) {
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
        tenant.id,
      )
      perTable[table] = Number(result)
      total += Number(result)
    }

    return NextResponse.json({ status: 'complete', tenantId: tenant.id, totalRowsBackfilled: total, perTable })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
