import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { prisma } from '@/lib/db/prisma'

// ONE-TIME USE — read-only. Two stranded pre-cutover schemas were found by
// verify-casual-data-2 that still hold a "Customer" table:
//   tenant_test_verify_co_1783947565
//   tenant_zzz_provisioning_test
// These names strongly suggest leftover E2E test artifacts from validating
// the old schema-per-tenant provisioning flow (matches the "aa35a22 test
// schema" risk flagged in the original migration plan, which was never
// explicitly confirmed clear before cutover). This inspects their actual
// content directly rather than assuming from the name. Hardcoded schema
// names (not interpolated from user input) — these are the two exact
// values already confirmed to exist via the prior read-only check.
// Delete after use.

type CustomerRow = {
  id: string
  firstName: string | null
  lastName: string | null
  idNumber: string | null
  customerType: string
  createdAt: Date
}

async function inspectSchema(schema: string) {
  const countRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint as count FROM "${schema}"."Customer"`,
  )
  const total = Number(countRows[0]?.count ?? 0)

  const typeBreakdown = await prisma.$queryRawUnsafe<{ customertype: string; count: bigint }[]>(
    `SELECT "customerType" as customertype, COUNT(*)::bigint as count FROM "${schema}"."Customer" GROUP BY "customerType"`,
  )

  const samples = await prisma.$queryRawUnsafe<CustomerRow[]>(
    `SELECT id, "firstName", "lastName", "idNumber", "customerType", "createdAt" FROM "${schema}"."Customer" ORDER BY "createdAt" ASC LIMIT 10`,
  )

  return {
    schema,
    totalRows: total,
    typeBreakdown: typeBreakdown.map((t) => ({ customerType: t.customertype, count: Number(t.count) })),
    sampleRows: samples,
  }
}

export async function GET(req: Request) {
  const { response } = await requireRole(['admin'])
  if (response) return response

  const result = await runWithRequestTenant(req, async () => {
    const schemas = ['tenant_test_verify_co_1783947565', 'tenant_zzz_provisioning_test']
    const inspections: (Awaited<ReturnType<typeof inspectSchema>> | { schema: string; error: string })[] = []
    for (const schema of schemas) {
      try {
        inspections.push(await inspectSchema(schema))
      } catch (e) {
        inspections.push({ schema, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return { inspections }
  })

  return NextResponse.json(result)
}
