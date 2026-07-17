import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { withTenantId } from '@/lib/db/tenantContext'
import { prisma } from '@/lib/db/prisma'

// ONE-TIME USE — read-only. Checks every registered Tenant for the
// "provisioned but never seeded" state that provisionCompany() couldn't
// previously recover from (see the bug fix in tenantProvisioningService.ts
// this session). Delete after use.
export async function GET() {
  const { response } = await requireRole(['admin'])
  if (response) return response

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenants = await (registryPrisma as any).tenant.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, companySlug: true, companyName: true, schemaName: true, status: true, createdAt: true },
  })

  // The exact query login()'s resolveDefaultTenant() runs when no tenantSlug
  // is provided (i.e. logging in on the app's own primary domain, no
  // subdomain) — surfaced directly here rather than inferred, since a
  // mismatch here would make every login attempt fail with a generic
  // InvalidCredentialsError before password comparison even runs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultTenant = await (registryPrisma as any).tenant.findUnique({ where: { schemaName: 'public' } })

  const results = []
  for (const t of tenants) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { userCount, categoryCount, sampleUsers, sessionTenantId } = await withTenantId(t.id, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userCount = await (prisma as any).user.count()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const categoryCount = await (prisma as any).productCategory.count()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sampleUsers = await (prisma as any).user.findMany({
        take: 5,
        select: { username: true, fullName: true, role: true, tenantId: true },
      })
      // Raw check of what RLS actually sees as the active tenant for THIS
      // exact query — the direct, unambiguous way to tell "the count is
      // right but coincidentally matches" apart from "the tenant pin
      // didn't actually change between loop iterations."
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionRow = await (prisma as any).$queryRawUnsafe(
        `SELECT current_setting('app.current_tenant_id', true) as tid`,
      )
      return { userCount, categoryCount, sampleUsers, sessionTenantId: sessionRow?.[0]?.tid ?? null }
    })
    results.push({
      tenantId: t.id,
      companySlug: t.companySlug,
      companyName: t.companyName,
      schemaName: t.schemaName,
      status: t.status,
      createdAt: t.createdAt,
      userCount,
      categoryCount,
      sampleUsers,
      sessionTenantIdMatchesExpected: sessionTenantId === t.id,
      sessionTenantId,
      stuck: userCount === 0,
      partiallySeeded: userCount > 0 && categoryCount === 0,
    })
  }

  return NextResponse.json({
    defaultTenantResolvedBySchemaNamePublic: defaultTenant
      ? { id: defaultTenant.id, companySlug: defaultTenant.companySlug, companyName: defaultTenant.companyName }
      : null,
    tenants: results,
  })
}
