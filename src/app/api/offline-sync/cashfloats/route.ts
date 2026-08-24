import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const PAGE_LIMIT = 500

/**
 * GET /api/offline-sync/cashfloats?cursor=<ISO updatedAt>&limit=500
 * Float HISTORY only — today's live current balance stays a last-known-value
 * cache-aside, same reasoning as /api/offline-sync/cashups.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? String(PAGE_LIMIT), 10) || PAGE_LIMIT, PAGE_LIMIT)

  try {
    const rows = await runWithRequestTenant(req, () => prisma.cashFloat.findMany({
      where: cursor ? { updatedAt: { gt: new Date(cursor) } } : undefined,
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: {
        id: true, floatDate: true, openingAmount: true, closingAmount: true,
        notes: true, createdByUserId: true, createdAt: true, updatedAt: true,
      },
    }))

    const items = rows.map((f) => ({
      id: f.id,
      floatDate: f.floatDate.toISOString().slice(0, 10),
      openingAmount: f.openingAmount.toString(),
      closingAmount: f.closingAmount?.toString(),
      notes: f.notes ?? undefined,
      createdByUserId: f.createdByUserId ?? undefined,
      createdAt: f.createdAt.toISOString(),
    }))

    const nextCursor = rows.length > 0 ? rows[rows.length - 1]!.updatedAt.toISOString() : null
    return NextResponse.json({ items, nextCursor, hasMore: rows.length === limit })
  } catch (err) {
    logger.error({ err }, 'GET /api/offline-sync/cashfloats failed')
    return NextResponse.json({ error: 'Failed to fetch float history for offline sync' }, { status: 500 })
  }
}
