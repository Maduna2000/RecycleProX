// SCRATCH-PROJECT ONLY — Section 7 verification suite from
// i-need-you-to-vectorized-pumpkin.md. Imports the REAL app modules
// (src/lib/db/prisma.ts, src/lib/db/tenantContext.ts), not a
// reimplementation, so this is a faithful test of the actual production
// code path. Run with DATABASE_URL set to the scratch project's POOLED
// connection string (matches how Vercel actually connects) via:
//   DATABASE_URL="$POOLED" npx tsx scripts/scratch-verify-rls.ts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { withTenantId, tenantContext } from '@/lib/db/tenantContext'

const rawAdmin = new PrismaClient() // no tenant context ever set on this one

let failures = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`PASS  ${name}`)
  } else {
    failures++
    console.log(`FAIL  ${name}`, detail ?? '')
  }
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantA = await (rawAdmin as any).tenant.findUniqueOrThrow({ where: { schemaName: 'public' } })
  console.log(`Tenant A (existing, backfilled): ${tenantA.id}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantB = await (rawAdmin as any).tenant.findUnique({ where: { companySlug: 'scratch-tenant-b' } })
  if (!tenantB) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenantB = await (rawAdmin as any).tenant.create({
      data: { companySlug: 'scratch-tenant-b', schemaName: 'scratch-tenant-b', companyName: 'Scratch Tenant B (throwaway)', status: 'active' },
    })
    console.log(`Created Tenant B: ${tenantB.id}`)
  } else {
    console.log(`Tenant B already exists: ${tenantB.id}`)
  }

  // Seed 2 Customer rows for Tenant B if not already present
  await withTenantId(tenantB.id, async () => {
    const existing = await prisma.customer.count()
    if (existing === 0) {
      await prisma.customer.create({
        data: { tenantId: tenantB.id, firstName: 'B-One', lastName: 'Throwaway', phone: '0000000001', customerType: 'casual', idNumber: 'SCRATCHB0001' },
      })
      await prisma.customer.create({
        data: { tenantId: tenantB.id, firstName: 'B-Two', lastName: 'Throwaway', phone: '0000000002', customerType: 'casual', idNumber: 'SCRATCHB0002' },
      })
      console.log('Seeded 2 Customer rows for Tenant B')
    } else {
      console.log(`Tenant B already has ${existing} Customer row(s)`)
    }
  })

  const tenantACustomerCount = await withTenantId(tenantA.id, () => prisma.customer.count())
  const tenantBCustomerCount = await withTenantId(tenantB.id, () => prisma.customer.count())
  console.log(`Tenant A Customer count: ${tenantACustomerCount}`)
  console.log(`Tenant B Customer count: ${tenantBCustomerCount}`)

  // ── Test 1: Positive test — scoped findMany returns only that tenant's rows ──
  const tenantACustomers = await withTenantId(tenantA.id, () => prisma.customer.findMany({ select: { tenantId: true } }))
  check(
    'Test 1 (positive): Tenant A findMany returns only Tenant A rows',
    tenantACustomers.every((c) => c.tenantId === tenantA.id) && tenantACustomers.length === tenantACustomerCount,
    { sample: tenantACustomers.slice(0, 3) },
  )

  const tenantBCustomers = await withTenantId(tenantB.id, () => prisma.customer.findMany({ select: { tenantId: true } }))
  check(
    'Test 1 (positive): Tenant B findMany returns only Tenant B rows',
    tenantBCustomers.every((c) => c.tenantId === tenantB.id) && tenantBCustomers.length === 2,
    { sample: tenantBCustomers },
  )

  // ── Test 2: THE breach test — deliberately unfiltered raw SQL inside Tenant B's context ──
  // Simulates "a future service function forgot the filter". If this returns
  // Tenant A's rows too, RLS (FORCE ROW LEVEL SECURITY / policy) is broken —
  // nothing else in this suite can be trusted until that's fixed.
  const breachTestRows = await withTenantId(tenantB.id, () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).$queryRawUnsafe('SELECT "tenantId" FROM "Customer"'),
  )
  const breachTestRowsTyped = breachTestRows as Array<{ tenantId: string }>
  const breachTestTenantIds = new Set(breachTestRowsTyped.map((r) => r.tenantId))
  check(
    'Test 2 (BREACH TEST): unfiltered raw SELECT inside Tenant B context sees ONLY Tenant B rows',
    breachTestTenantIds.size === 1 && breachTestTenantIds.has(tenantB.id),
    { distinctTenantIdsSeen: Array.from(breachTestTenantIds), rowCount: breachTestRowsTyped.length },
  )

  // ── Test 3: Negative-context test — app-level guard (requireTenantId throws) ──
  let threwMissingContext = false
  try {
    await prisma.customer.findMany()
  } catch (err) {
    threwMissingContext = err instanceof Error && err.name === 'MissingTenantContextError'
  }
  check('Test 3a (negative, app-level): prisma.customer.findMany() with no context throws MissingTenantContextError', threwMissingContext)

  // ── Test 3b: Negative-context test — DB-level fail-closed (raw connection, no set_config ever called) ──
  const noContextCount = await rawAdmin.$queryRawUnsafe('SELECT count(*)::int AS n FROM "Customer"')
  const noContextN = (noContextCount as Array<{ n: number }>)[0]?.n
  check(
    'Test 3b (negative, DB-level): raw connection with no set_config ever called sees ZERO rows, not all rows',
    noContextN === 0,
    { n: noContextN },
  )

  // ── Test 4: Concurrency test — interleaved tenant contexts must not cross-contaminate ──
  const concurrentResults = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      withTenantId(i % 2 === 0 ? tenantA.id : tenantB.id, async () => {
        const ctx = tenantContext.getStore()
        const count = await prisma.customer.count()
        return { i, expectedTenantId: ctx?.tenantId, count }
      }),
    ),
  )
  const concurrencyOk = concurrentResults.every((r) => {
    const expected = r.expectedTenantId === tenantA.id ? tenantACustomerCount : tenantBCustomerCount
    return r.count === expected
  })
  check('Test 4 (concurrency): 10 interleaved concurrent tenant contexts never cross-contaminate counts', concurrencyOk, concurrentResults)

  // ── Test 5: WITH CHECK — a write cannot smuggle a different tenant's id into data ──
  let writeRejected = false
  try {
    await withTenantId(tenantB.id, () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).$executeRawUnsafe(
        `INSERT INTO "Customer" ("id","tenantId","firstName","lastName","phone","customerType","createdAt","updatedAt") VALUES (gen_random_uuid()::text, $1, 'Attack', 'Row', '000', 'casual', now(), now())`,
        tenantA.id, // attempting to write a row claiming to belong to Tenant A while pinned as Tenant B
      ),
    )
  } catch {
    writeRejected = true
  }
  check('Test 5 (WITH CHECK): writing a row with a foreign tenantId while pinned as Tenant B is rejected', writeRejected)

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await rawAdmin.$disconnect()
  })
