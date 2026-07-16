import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registryPrisma } from '@/lib/db/registryPrisma'
import { tenantContext } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import { authorizeInternalRequest } from '@/lib/internal/authorizeInternalRequest'

// Server-to-server only — called by the Portal's Onboarding page to compute
// per-tenant setup progress from real usage, not a self-reported checklist.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  if (!authorizeInternalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const tenant = await registryPrisma.tenant.findUnique({ where: { companySlug: params.slug } })
  if (!tenant) {
    return NextResponse.json({ error: 'Unknown company' }, { status: 404 })
  }

  try {
    const counts = await tenantContext.run({ tenantId: tenant.id, schemaName: tenant.schemaName, companySlug: tenant.companySlug }, () =>
      Promise.all([
        prisma.user.count(),
        prisma.customer.count(),
        prisma.product.count(),
        prisma.purchase.count(),
        prisma.sale.count(),
        prisma.user.findFirst({ where: { lastLoginAt: { not: null } }, select: { id: true } }),
      ])
    )

    const [userCount, customerCount, productCount, purchaseCount, saleCount, anyLogin] = counts

    return NextResponse.json({
      userCount,
      customerCount,
      productCount,
      purchaseCount,
      saleCount,
      hasLoggedIn: !!anyLogin,
    })
  } catch (err) {
    logger.error({ err, companySlug: params.slug }, 'Failed to compute onboarding counts')
    return NextResponse.json({ error: 'Failed to compute onboarding counts' }, { status: 500 })
  }
}
