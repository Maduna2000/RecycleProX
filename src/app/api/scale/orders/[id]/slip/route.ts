import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getScaleOrderById, saveSlipKey, resolveCustomerName, resolveCustomerPhone, ScaleOrderNotFoundError } from '@/lib/services/scaleService'
import { getAllSettings } from '@/lib/services/settingsService'
import { generateScaleOrderSlip } from '@/lib/pdf/scaleSlip'
import { uploadBytes, scaleOrderSlipKey } from '@/lib/r2'
import Decimal from 'decimal.js'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const order    = await getScaleOrderById(params.id)
    const settings = await getAllSettings()
    const yardName = settings.yard_name ?? settings.company_name ?? 'Renovo Pro'

    const weight = new Decimal(order.weight.toString()).toFixed(3)

    const pdfBytes = await generateScaleOrderSlip({
      orderNumber:   order.orderNumber,
      createdAt:     order.createdAt,
      customerName:  resolveCustomerName(order),
      customerPhone: resolveCustomerPhone(order),
      productName:   order.product.name,
      categoryName:  order.product.category.name,
      weight:        `${weight} ${order.product.unit}`,
      operatorName:  order.operator.fullName,
      yardName,
    })

    // Save to R2 (don't block response on failure)
    const key = scaleOrderSlipKey(order.id)
    uploadBytes(key, pdfBytes, 'application/pdf')
      .then(() => saveSlipKey(order.id, key))
      .catch(err => logger.error({ err, orderId: order.id }, 'Failed to save slip to R2'))

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
