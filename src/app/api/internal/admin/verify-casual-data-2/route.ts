import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { prisma } from '@/lib/db/prisma'

// ONE-TIME USE — read-only. Follow-up on the casual/account investigation:
// user correctly pushed back that walk-ins created via Scale Orders should
// still be leaving some un-converted casual customers behind, and asked to
// confirm nothing was deleted / stranded. This checks:
//   1. Customer DELETE audit rows (were any casual customers hard-deleted?)
//   2. INSERT vs current-count gap (283 inserts vs 264 current customers)
//   3. Whether any OTHER Postgres schema (pre-dating the shared-table
//      tenancy cutover) still holds a Customer table with casual rows that
//      never got backfilled and that the app no longer queries.
// Delete after use.
export async function GET(req: Request) {
  const { response } = await requireRole(['admin'])
  if (response) return response

  const result = await runWithRequestTenant(req, async () => {
    const totalCustomers = await prisma.customer.count()
    const casualCount = await prisma.customer.count({ where: { customerType: 'casual' } })
    const accountCount = await prisma.customer.count({ where: { customerType: 'account' } })

    const totalInserts = await prisma.auditLog.count({ where: { tableName: 'Customer', action: 'INSERT' } })
    const totalDeletes = await prisma.auditLog.count({ where: { tableName: 'Customer', action: 'DELETE' } })

    const deleteLogs = await prisma.auditLog.findMany({
      where: { tableName: 'Customer', action: 'DELETE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, recordId: true, changedById: true, oldValues: true, createdAt: true },
    })

    type OldVals = { customerType?: string; firstName?: string; lastName?: string; idNumber?: string }
    const deletedCasuals = deleteLogs.filter((l) => (l.oldValues as OldVals | null)?.customerType === 'casual')

    // Recently-created customers (last 7 days) that are still casual right
    // now — if Scale Orders is actively creating walk-ins, there should be
    // a live trickle of these even if older ones get converted later.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentInserts = await prisma.auditLog.findMany({
      where: { tableName: 'Customer', action: 'INSERT', createdAt: { gte: sevenDaysAgo } },
      select: { recordId: true, newValues: true, createdAt: true },
    })
    const recentCasualCreates = recentInserts.filter((l) => (l.newValues as OldVals | null)?.customerType === 'casual')
    const recentAccountCreates = recentInserts.filter((l) => (l.newValues as OldVals | null)?.customerType === 'account')
    const recentScaleOrders = await prisma.scaleOrder.count({ where: { createdAt: { gte: sevenDaysAgo } } })

    // Of the customers created as casual in the last 7 days via that
    // insert log, how many are STILL casual right now (not yet converted)?
    const recentCasualIds = recentCasualCreates.map((l) => l.recordId)
    const stillCasualNow = recentCasualIds.length
      ? await prisma.customer.count({ where: { id: { in: recentCasualIds }, customerType: 'casual' } })
      : 0

    // Cross-schema check: is there a Postgres schema other than public that
    // still has a Customer table (a stranded pre-cutover tenant schema)?
    let otherSchemas: { schema_name: string }[] = []
    let schemaCheckError: string | null = null
    try {
      otherSchemas = await prisma.$queryRaw<{ schema_name: string }[]>`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name NOT IN ('public', 'information_schema')
        AND schema_name NOT LIKE 'pg_%'
      `
    } catch (e) {
      schemaCheckError = e instanceof Error ? e.message : String(e)
    }

    const schemaCustomerTables: { schema_name: string; table_exists: boolean }[] = []
    for (const s of otherSchemas) {
      try {
        const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'Customer'`,
          s.schema_name,
        )
        schemaCustomerTables.push({ schema_name: s.schema_name, table_exists: rows.length > 0 })
      } catch {
        schemaCustomerTables.push({ schema_name: s.schema_name, table_exists: false })
      }
    }

    return {
      totalCustomers,
      casualCount,
      accountCount,
      totalCustomerInserts: totalInserts,
      totalCustomerDeletes: totalDeletes,
      insertVsCurrentGap: totalInserts - totalCustomers,
      deletedCasualCustomers: deletedCasuals.length,
      deletedCasualDetails: deletedCasuals.map((l) => ({
        recordId: l.recordId,
        changedBy: l.changedById ?? 'unknown/system',
        oldValues: l.oldValues,
        createdAt: l.createdAt,
      })),
      allDeleteLogs: deleteLogs.map((l) => ({
        recordId: l.recordId,
        oldCustomerType: (l.oldValues as OldVals | null)?.customerType,
        oldName: `${(l.oldValues as OldVals | null)?.firstName ?? ''} ${(l.oldValues as OldVals | null)?.lastName ?? ''}`,
        createdAt: l.createdAt,
      })),
      recentInsertsLast7Days: recentInserts.length,
      recentCasualCreatesLast7Days: recentCasualCreates.length,
      recentAccountCreatesLast7Days: recentAccountCreates.length,
      recentCasualStillCasualNow: stillCasualNow,
      recentScaleOrdersLast7Days: recentScaleOrders,
      otherPostgresSchemas: otherSchemas.map((s) => s.schema_name),
      schemaCustomerTables,
      schemaCheckError,
    }
  })

  return NextResponse.json(result)
}
