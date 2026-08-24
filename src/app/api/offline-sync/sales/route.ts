import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const PAGE_LIMIT = 500

/**
 * GET /api/offline-sync/sales?cursor=<ISO updatedAt>&limit=500
 * Same purpose/shape rationale as /api/offline-sync/purchases — see that
 * route's own header comment, including the updatedAt-based cursor.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? String(PAGE_LIMIT), 10) || PAGE_LIMIT, PAGE_LIMIT)

  try {
    const rows = await runWithRequestTenant(req, () => prisma.sale.findMany({
      where: cursor ? { updatedAt: { gt: new Date(cursor) } } : undefined,
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: {
        id: true, refNumber: true, buyerId: true, buyerName: true, buyerIdNumber: true, buyerPhone: true,
        customerId: true, status: true, totalAmount: true, vatAmount: true, amountPaid: true,
        paymentMethod: true, notes: true, businessLoanDeductionAmount: true,
        createdByUserId: true, createdAt: true, updatedAt: true,
        customer: { select: { firstName: true, lastName: true, idNumber: true } },
        lines: {
          select: {
            id: true, productId: true, quantity: true, unitPrice: true, lineTotal: true,
            product: { select: { name: true, code: true, unit: true } },
          },
        },
      },
    }))

    const items = rows.map((s) => ({
      id: s.id,
      refNumber: s.refNumber,
      buyerId: s.buyerId ?? undefined,
      buyerName: s.customer ? `${s.customer.firstName} ${s.customer.lastName}` : (s.buyerName ?? undefined),
      buyerIdNumber: s.customer?.idNumber ?? s.buyerIdNumber ?? undefined,
      buyerPhone: s.buyerPhone ?? undefined,
      customerId: s.customerId ?? undefined,
      status: s.status,
      totalAmount: s.totalAmount.toString(),
      vatAmount: s.vatAmount.toString(),
      amountPaid: s.amountPaid?.toString(),
      businessLoanDeductionAmount: s.businessLoanDeductionAmount?.toString(),
      paymentMethod: s.paymentMethod,
      notes: s.notes ?? undefined,
      createdByUserId: s.createdByUserId ?? undefined,
      createdAt: s.createdAt.toISOString(),
      lines: s.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        productName: l.product.name,
        productCode: l.product.code,
        unit: l.product.unit,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toString(),
        lineTotal: l.lineTotal.toString(),
      })),
    }))

    const nextCursor = rows.length > 0 ? rows[rows.length - 1]!.updatedAt.toISOString() : null
    return NextResponse.json({ items, nextCursor, hasMore: rows.length === limit })
  } catch (err) {
    logger.error({ err }, 'GET /api/offline-sync/sales failed')
    return NextResponse.json({ error: 'Failed to fetch sales for offline sync' }, { status: 500 })
  }
}
