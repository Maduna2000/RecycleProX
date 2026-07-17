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

  const results = []
  for (const t of tenants) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userCount = await withTenantId<number>(t.id, () => (prisma as any).user.count())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categoryCount = await withTenantId<number>(t.id, () => (prisma as any).productCategory.count())
    results.push({
      tenantId: t.id,
      companySlug: t.companySlug,
      companyName: t.companyName,
      status: t.status,
      createdAt: t.createdAt,
      userCount,
      categoryCount,
      stuck: userCount === 0,
      partiallySeeded: userCount > 0 && categoryCount === 0,
    })
  }

  return NextResponse.json({ tenants: results })
}
