import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const PAGE_LIMIT = 500

/**
 * GET /api/offline-sync/cashups?cursor=<ISO updatedAt>&limit=500
 * Cash-up session HISTORY only (list/detail viewing offline) — the
 * currently-open "today" session and live-stats stay a last-known-value
 * cache-aside via src/lib/offline/responseCache.ts instead, deliberately not
 * replicated here. See the "Desktop offline mode" plan's architecture note
 * on why: reconciliation-in-progress state is exactly where a subtly wrong
 * locally-recomputed number would matter most.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? String(PAGE_LIMIT), 10) || PAGE_LIMIT, PAGE_LIMIT)

  try {
    const rows = await runWithRequestTenant(req, () => prisma.cashUp.findMany({
      where: cursor ? { updatedAt: { gt: new Date(cursor) } } : undefined,
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: {
        id: true, sessionDate: true, status: true, currency: true, openingBalance: true,
        systemCashSales: true, systemCashPurchases: true, systemCashPayments: true, systemCashExpected: true,
        declaredCash: true, variance: true, openedByUserId: true, closedAt: true, approvedAt: true,
        notes: true, createdAt: true, updatedAt: true,
      },
    }))

    const items = rows.map((c) => ({
      id: c.id,
      sessionDate: c.sessionDate.toISOString(),
      status: c.status,
      currency: c.currency,
      openingBalance: c.openingBalance.toString(),
      systemCashSales: c.systemCashSales.toString(),
      systemCashPurchases: c.systemCashPurchases.toString(),
      systemCashPayments: c.systemCashPayments.toString(),
      systemCashExpected: c.systemCashExpected.toString(),
      declaredCash: c.declaredCash?.toString() ?? null,
      variance: c.variance?.toString() ?? null,
      openedByUserId: c.openedByUserId,
      closedAt: c.closedAt?.toISOString() ?? null,
      approvedAt: c.approvedAt?.toISOString() ?? null,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
    }))

    const nextCursor = rows.length > 0 ? rows[rows.length - 1]!.updatedAt.toISOString() : null
    return NextResponse.json({ items, nextCursor, hasMore: rows.length === limit })
  } catch (err) {
    logger.error({ err }, 'GET /api/offline-sync/cashups failed')
    return NextResponse.json({ error: 'Failed to fetch cash-up history for offline sync' }, { status: 500 })
  }
}
