import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const PAGE_LIMIT = 500

/**
 * GET /api/offline-sync/payments?cursor=<ISO updatedAt>&limit=500
 *
 * A raw dump of the Payment table — deliberately NOT the "union in direct
 * completed sales with no Payment row" logic listPayments() applies (see
 * paymentService.ts), since the offline reader already has the full Sales
 * replica locally and can reproduce that exact union in JS rather than this
 * route trying to replicate it server-side too. See
 * src/lib/offline/readers/payments.ts.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? String(PAGE_LIMIT), 10) || PAGE_LIMIT, PAGE_LIMIT)

  try {
    const rows = await runWithRequestTenant(req, () => prisma.payment.findMany({
      where: cursor ? { updatedAt: { gt: new Date(cursor) } } : undefined,
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: {
        id: true, refNumber: true, customerId: true, amount: true, paymentMethod: true,
        voidedAt: true, createdByUserId: true, createdAt: true, updatedAt: true, source: true,
        saleId: true, purchaseId: true,
        customer: { select: { firstName: true, lastName: true } },
        sale: { select: { createdByUserId: true } },
      },
    }))

    const items = rows.map((p) => ({
      id: p.id,
      refNumber: p.refNumber,
      customerId: p.customerId ?? undefined,
      customerName: p.customer ? `${p.customer.firstName} ${p.customer.lastName}` : undefined,
      source: p.source,
      saleId: p.saleId ?? undefined,
      purchaseId: p.purchaseId ?? undefined,
      saleCreatedByUserId: p.sale?.createdByUserId ?? undefined,
      amount: p.amount.toString(),
      paymentMethod: p.paymentMethod,
      voidedAt: p.voidedAt?.toISOString(),
      createdByUserId: p.createdByUserId ?? undefined,
      createdAt: p.createdAt.toISOString(),
    }))

    const nextCursor = rows.length > 0 ? rows[rows.length - 1]!.updatedAt.toISOString() : null
    return NextResponse.json({ items, nextCursor, hasMore: rows.length === limit })
  } catch (err) {
    logger.error({ err }, 'GET /api/offline-sync/payments failed')
    return NextResponse.json({ error: 'Failed to fetch payments for offline sync' }, { status: 500 })
  }
}
