import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const PAGE_LIMIT = 500

/** GET /api/offline-sync/stock-movements?cursor=<ISO createdAt>&limit=500 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? String(PAGE_LIMIT), 10) || PAGE_LIMIT, PAGE_LIMIT)

  try {
    const rows = await runWithRequestTenant(req, () => prisma.stockMovement.findMany({
      where: cursor ? { createdAt: { gt: new Date(cursor) } } : undefined,
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true, productId: true, direction: true, quantity: true, source: true,
        sourceId: true, createdAt: true,
        product: { select: { name: true } },
      },
    }))

    const items = rows.map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product.name,
      direction: m.direction,
      quantity: m.quantity.toString(),
      source: m.source,
      sourceId: m.sourceId ?? undefined,
      createdAt: m.createdAt.toISOString(),
    }))

    const nextCursor = items.length > 0 ? items[items.length - 1]!.createdAt : null
    return NextResponse.json({ items, nextCursor, hasMore: items.length === limit })
  } catch (err) {
    logger.error({ err }, 'GET /api/offline-sync/stock-movements failed')
    return NextResponse.json({ error: 'Failed to fetch stock movements for offline sync' }, { status: 500 })
  }
}
