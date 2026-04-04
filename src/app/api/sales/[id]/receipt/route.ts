import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getSale } from '@/lib/services/saleService'
import { generateTransactionSlip } from '@/lib/pdf/slip'

/**
 * GET /api/sales/[id]/receipt?format=pdf|thermal
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const format = req.nextUrl.searchParams.get('format') ?? 'pdf'

  try {
    const sale = await getSale(params.id)

    if (format === 'thermal') {
      const { buildSaleReceipt } = await import('@/lib/print/thermal')
      const buf = await buildSaleReceipt({
        refNumber:      sale.refNumber,
        buyerName:      sale.buyerName ?? undefined,
        buyerIdNumber:  sale.buyerIdNumber ?? undefined,
        lines: sale.lines.map((l) => ({
          productName: l.product.name,
          qty:         Number(l.quantity),
          unitPrice:   l.unitPrice.toString(),
          lineTotal:   l.lineTotal.toString(),
        })),
        totalAmount:   sale.totalAmount.toString(),
        paymentMethod: sale.paymentMethod,
        cashierName:   session.user.name ?? 'Cashier',
        createdAt:     sale.createdAt,
      })
      return new NextResponse(buf.buffer as ArrayBuffer, {
        headers: {
          'Content-Type':        'application/octet-stream',
          'Content-Disposition': `attachment; filename="receipt-${sale.refNumber}.bin"`,
        },
      })
    }

    // PDF (default)
    const pdfBytes = await generateTransactionSlip({
      type:          'SALE',
      refNumber:     sale.refNumber,
      date:          sale.createdAt,
      partyLabel:    'Buyer',
      partyName:     sale.buyerName ?? 'Walk-in Customer',
      partyIdNumber: sale.buyerIdNumber ?? undefined,
      partyPhone:    sale.buyerPhone ?? undefined,
      lines: sale.lines.map((l) => ({
        productName: l.product.name,
        qty:         Number(l.quantity),
        unitPrice:   l.unitPrice.toString(),
        lineTotal:   l.lineTotal.toString(),
      })),
      totalAmount:   sale.totalAmount.toString(),
      paymentMethod: sale.paymentMethod,
      cashierName:   session.user.name ?? 'Cashier',
      notes:         sale.notes ?? undefined,
    })

    return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="sale-${sale.refNumber}.pdf"`,
      },
    })
  } catch (err) {
    logger.error({ err, id: params.id }, 'GET /api/sales/[id]/receipt failed')
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 })
  }
}
