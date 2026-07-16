import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { tenantContext } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import { authorizeInternalRequest } from '@/lib/internal/authorizeInternalRequest'

// Server-to-server only — called by the Portal's Company detail page Users
// tab (tenantUsersClient.ts). Read-only: no create/deactivate from here,
// tenant admins still manage their own staff logins inside Web unchanged.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  if (!authorizeInternalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = await (registryPrisma as any).tenant.findUnique({ where: { companySlug: params.slug } })
  if (!tenant) {
    return NextResponse.json({ error: 'Unknown company' }, { status: 404 })
  }

  try {
    const users = await tenantContext.run(
      { tenantId: tenant.id, schemaName: tenant.schemaName, companySlug: tenant.companySlug },
      () =>
        prisma.user.findMany({
          select: {
            id: true,
            fullName: true,
            username: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            lockedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
    )
    return NextResponse.json({ users })
  } catch (err) {
    logger.error({ err, companySlug: params.slug }, 'Failed to list tenant users')
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
  }
}
