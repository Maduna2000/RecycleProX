import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const PAGE_LIMIT = 500

/**
 * GET /api/offline-sync/purchases?cursor=<ISO createdAt>&limit=500
 *
 * Purpose-built for the desktop app's full-history offline replica (see the
 * "Desktop offline mode" plan) — deliberately separate from GET
 * /api/purchases, which serves the live Purchases list page with a
 * different, UI-driven pagination/filter shape. This one is cursor-paginated
 * on createdAt ascending (stable resume point for a seeder loop) and embeds
 * everything a purchase list/detail page renders (customer summary, line
 * items with product name/code/unit) so the offline reader never needs a
 * follow-up join. Explicit `select` throughout — never reuse an `include`
 * built for an admin single-record view here, since a bulk export is much
 * easier to accidentally leak a sensitive field (e.g. a nested user's
 * password/pin hash) through than a one-off detail page is.
 *
 * Cursor is on `updatedAt`, not `createdAt` — a purchase voided or edited
 * after its first sync must come back around on the next incremental pass,
 * not stay stale forever because it was already "seen" by creation date.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? String(PAGE_LIMIT), 10) || PAGE_LIMIT, PAGE_LIMIT)

  try {
    const rows = await runWithRequestTenant(req, () => prisma.purchase.findMany({
      where: cursor ? { updatedAt: { gt: new Date(cursor) } } : undefined,
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: {
        id: true, refNumber: true, customerId: true, status: true,
        totalAmount: true, vatAmount: true, amountPaid: true, paymentMethod: true,
        notes: true, loanDeductionAmount: true, createdByUserId: true, createdAt: true, updatedAt: true,
        customer: { select: { firstName: true, lastName: true, idNumber: true } },
        scaleOrder: { select: { operator: { select: { fullName: true } } } },
        lines: {
          select: {
            id: true, productId: true, quantity: true, grossQty: true, tareQty: true,
            tareReason: true, unitPrice: true, lineTotal: true, priceSource: true,
            product: { select: { name: true, code: true, unit: true } },
          },
        },
      },
    }))

    const items = rows.map((p) => {
      const total = Number(p.totalAmount)
      const vat = Number(p.vatAmount ?? 0)
      return {
        id: p.id,
        refNumber: p.refNumber,
        customerId: p.customerId,
        customerFirstName: p.customer.firstName,
        customerLastName: p.customer.lastName,
        customerIdNumber: p.customer.idNumber,
        status: p.status,
        totalAmount: p.totalAmount.toString(),
        vatAmount: p.vatAmount?.toString(),
        subTotal: (total - vat).toFixed(2),
        amountPaid: p.amountPaid.toString(),
        paymentMethod: p.paymentMethod,
        notes: p.notes ?? undefined,
        loanDeductionAmount: p.loanDeductionAmount?.toString(),
        scaleOperatorName: p.scaleOrder?.operator.fullName,
        createdByUserId: p.createdByUserId ?? undefined,
        createdAt: p.createdAt.toISOString(),
        lines: p.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          productName: l.product.name,
          productCode: l.product.code,
          unit: l.product.unit,
          quantity: l.quantity.toString(),
          grossQty: l.grossQty?.toString(),
          tareQty: l.tareQty?.toString(),
          tareReason: l.tareReason ?? undefined,
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString(),
          priceSource: l.priceSource,
        })),
      }
    })

    const nextCursor = rows.length > 0 ? rows[rows.length - 1]!.updatedAt.toISOString() : null
    return NextResponse.json({ items, nextCursor, hasMore: rows.length === limit })
  } catch (err) {
    logger.error({ err }, 'GET /api/offline-sync/purchases failed')
    return NextResponse.json({ error: 'Failed to fetch purchases for offline sync' }, { status: 500 })
  }
}
