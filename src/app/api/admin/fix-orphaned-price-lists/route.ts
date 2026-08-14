import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

/**
 * ONE-TIME ADMIN ROUTE — delete after use.
 *
 * Repairs PriceList rows whose priceGroupId doesn't match any existing
 * PriceGroup row (causing "Inconsistent query result: Field priceGroup is
 * required..." on GET /api/price-lists). Root cause: a migration retry
 * race between two Vercel projects sharing the same database.
 *
 * GET  — dry run, reports what's orphaned and what it would repair to.
 * POST — actually repairs: sets each orphaned row's priceGroupId to its
 *        tenant's default PriceGroup, or the tenant's oldest PriceGroup
 *        if no default is set.
 */
async function diagnose() {
  const priceLists = await prisma.$queryRaw<{ id: string; tenantId: string; title: string; priceGroupId: string }[]>`
    SELECT id, "tenantId", title, "priceGroupId" FROM "PriceList"
  `
  const priceGroups = await prisma.$queryRaw<{ id: string; tenantId: string; name: string; isDefault: boolean; createdAt: Date }[]>`
    SELECT id, "tenantId", name, "isDefault", "createdAt" FROM "PriceGroup" ORDER BY "createdAt" ASC
  `
  const groupIds = new Set(priceGroups.map((g) => g.id))
  const orphaned = priceLists.filter((p) => !groupIds.has(p.priceGroupId))

  const repairs = orphaned.map((p) => {
    const tenantGroups = priceGroups.filter((g) => g.tenantId === p.tenantId)
    const target = tenantGroups.find((g) => g.isDefault) ?? tenantGroups[0]
    return {
      priceListId: p.id, tenantId: p.tenantId, title: p.title,
      badPriceGroupId: p.priceGroupId,
      repairToPriceGroupId: target?.id ?? null,
      repairToPriceGroupName: target?.name ?? null,
    }
  })

  return { totalPriceLists: priceLists.length, totalPriceGroups: priceGroups.length, orphanedCount: orphaned.length, repairs }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin'].includes(session.user.role)) return NextResponse.json({ error: 'Admin role required' }, { status: 403 })

  try {
    const result = await runWithRequestTenant(req, () => diagnose())
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/admin/fix-orphaned-price-lists failed')
    return NextResponse.json({ error: 'Failed to diagnose' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin'].includes(session.user.role)) return NextResponse.json({ error: 'Admin role required' }, { status: 403 })

  try {
    const result = await runWithRequestTenant(req, async () => {
      const { repairs } = await diagnose()
      const applied: typeof repairs = []
      const skipped: typeof repairs = []
      for (const r of repairs) {
        if (!r.repairToPriceGroupId) { skipped.push(r); continue }
        await prisma.priceList.update({ where: { id: r.priceListId }, data: { priceGroupId: r.repairToPriceGroupId } })
        applied.push(r)
      }
      return { applied, skipped }
    })
    logger.info({ userId: session.user.id, ...result }, 'admin.fixOrphanedPriceLists')
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'POST /api/admin/fix-orphaned-price-lists failed')
    return NextResponse.json({ error: 'Failed to repair' }, { status: 500 })
  }
}
