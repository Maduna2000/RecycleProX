import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { tenantContext } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import { authorizeInternalRequest } from '@/lib/internal/authorizeInternalRequest'

// Server-to-server only — called by the Portal's cross-tenant Users page.
// Iterates every tenant schema, so this is N queries where N = tenant
// count; capped and per-tenant-timed-out so one broken schema can't hang
// the whole summary. Read-only, no business data beyond aggregate counts.
const MAX_TENANTS = 100
const PER_TENANT_TIMEOUT_MS = 3000

export async function GET(req: NextRequest) {
  if (!authorizeInternalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const tenants = await registryPrisma.tenant.findMany({
    take: MAX_TENANTS,
    orderBy: { createdAt: 'desc' },
    select: { companySlug: true, companyName: true, schemaName: true },
  })

  const summaries = await Promise.all(
    tenants.map(async (tenant) => {
      try {
        const result = await Promise.race([
          tenantContext.run({ schemaName: tenant.schemaName, companySlug: tenant.companySlug }, async () => {
            const [userCount, lastActive] = await Promise.all([
              prisma.user.count(),
              prisma.user.findFirst({ where: { lastLoginAt: { not: null } }, orderBy: { lastLoginAt: 'desc' }, select: { lastLoginAt: true } }),
            ])
            return { userCount, lastActivityAt: lastActive?.lastLoginAt ?? null }
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), PER_TENANT_TIMEOUT_MS)),
        ])

        if (result === null) {
          logger.warn({ companySlug: tenant.companySlug }, 'Tenant summary timed out')
          return { companySlug: tenant.companySlug, companyName: tenant.companyName, userCount: null, lastActivityAt: null }
        }
        return { companySlug: tenant.companySlug, companyName: tenant.companyName, ...result }
      } catch (err) {
        logger.error({ err, companySlug: tenant.companySlug }, 'Tenant summary query failed')
        return { companySlug: tenant.companySlug, companyName: tenant.companyName, userCount: null, lastActivityAt: null }
      }
    })
  )

  return NextResponse.json({ tenants: summaries })
}
