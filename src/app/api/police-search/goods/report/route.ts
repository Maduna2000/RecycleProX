import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { GoodsSearchSchema } from '@/lib/schemas/police'
import { getGoodsTraceReport, PoliceVisitNotActiveError } from '@/lib/services/policeVisitService'
import { generateGoodsTraceReport } from '@/lib/pdf/policeSearchReport'
import { DEFAULT_POLICE_SERVICE_NAME } from '@/lib/police-defaults'

/**
 * GET /api/police-search/goods/report?visitId=&productId=&from=&to=&minQuantity=
 * Goods Trace Report PDF for an active inspection session.
 * The download is logged like a search.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const parsed = GoodsSearchSchema.safeParse({
    visitId:     sp.get('visitId'),
    productId:   sp.get('productId'),
    from:        sp.get('from')        ?? undefined,
    to:          sp.get('to')          ?? undefined,
    minQuantity: sp.get('minQuantity') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const data = await getGoodsTraceReport(parsed.data.visitId, {
      productId:   parsed.data.productId,
      from:        parsed.data.from,
      to:          parsed.data.to,
      minQuantity: parsed.data.minQuantity,
    })
    if (!data) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    const { visit, product, lines, settings } = data

    const pdfBytes = await generateGoodsTraceReport({
      policeServiceName: settings['police_service_name'] ?? DEFAULT_POLICE_SERVICE_NAME,
      dealerName:        settings['yardName']    ?? 'Renovo Pro',
      dealerAddress:     settings['yardAddress'] ?? '—',
      officer: {
        name:        visit.officerName,
        rank:        visit.rank,
        badgeNumber: visit.badgeNumber,
        stationName: visit.stationName,
      },
      generatedAt: new Date(),
      productName: product.name,
      unit:        product.unit,
      from:        parsed.data.from ?? null,
      to:          parsed.data.to   ?? null,
      minQuantity: parsed.data.minQuantity ?? null,
      rows: lines.map((l) => ({
        createdAt:    l.purchase.createdAt,
        refNumber:    l.purchase.refNumber,
        supplierName: `${l.purchase.customer.firstName} ${l.purchase.customer.lastName}`,
        idNumber:     l.purchase.customer.idNumber,
        blacklisted:  l.purchase.customer.blacklisted,
        quantity:     l.quantity.toString(),
        lineTotal:    l.lineTotal.toString(),
      })),
    })

    const safeName = product.name.replace(/[^\w-]/g, '-')
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="goods-trace-${safeName}.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof PoliceVisitNotActiveError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: 409 })
    }
    logger.error({ err }, 'GET goods trace report failed')
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
