import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getScaleOrderById, saveSlipKey, resolveCustomerName, resolveCustomerPhone, resolveCustomerIdNumber, ScaleOrderNotFoundError } from '@/lib/services/scaleService'
import { getAllSettings } from '@/lib/services/settingsService'
import { generateScaleOrderSlip } from '@/lib/pdf/scaleSlip'
import { uploadBytes, scaleOrderSlipKey } from '@/lib/r2'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import Decimal from 'decimal.js'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [order, settings] = await runWithRequestTenant(req, () =>
      Promise.all([getScaleOrderById(params.id), getAllSettings()]),
    )
    const yardName = settings.yard_name ?? settings.company_name ?? 'Renovo Pro'

    const slipLines = order.lines.length > 0
      ? order.lines.map(l => ({
          productName:  l.product.name,
          categoryName: l.product.category,
          weight:       l.weight ? `${new Decimal(l.weight.toString()).toFixed(2)} ${l.product.unit}` : '—',
        }))
      : [{
          productName:  order.product.name,
          categoryName: order.product.category,
          weight:       order.weight ? `${new Decimal(order.weight.toString()).toFixed(2)} ${order.product.unit}` : '—',
        }]

    const idNumber = resolveCustomerIdNumber(order)
    const pdfBytes = await generateScaleOrderSlip({
      orderNumber:      order.orderNumber,
      createdAt:        order.createdAt,
      customerName:     resolveCustomerName(order),
      customerPhone:    resolveCustomerPhone(order),
      customerIdNumber: idNumber || undefined,
      lines:            slipLines,
      operatorName:     order.operator.fullName,
      yardName,
    })

    // Save to R2 — awaited (not fire-and-forget): a detached, un-awaited
    // promise chain here risks running after this function has already
    // returned its response, at which point req itself may no longer be
    // valid to read headers off. runWithRequestTenant re-derives tenant
    // context from `req` directly (see i-need-you-to-vectorized-pumpkin.md
    // Section 12) rather than Next's ambient headers(), but that only
    // works while this handler's own invocation is still alive — hence
    // still awaited here. Failure here still shouldn't block the response
    // the user is waiting on, so errors are caught and logged rather than
    // thrown.
    try {
      const key = scaleOrderSlipKey(order.id)
      await uploadBytes(key, pdfBytes, 'application/pdf')
      await runWithRequestTenant(req, () => saveSlipKey(order.id, key))
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'Failed to save slip to R2')
    }

    logger.info({ orderId: order.id, userId: session.user.id }, 'scaleOrder.slip.generated')

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="scale-order-${order.orderNumber}.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof ScaleOrderNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/scale/orders/[id]/slip failed')
    return NextResponse.json({ error: 'Failed to generate slip' }, { status: 500 })
  }
}
