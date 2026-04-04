import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getPurchase } from '@/lib/services/purchaseService'
import { generateTransactionSlip } from '@/lib/pdf/slip'

/**
 * GET /api/purchases/[id]/receipt?format=pdf|thermal
 * - pdf     → returns PDF bytes (default)
 * - thermal → returns ESC/POS buffer as application/octet-stream
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const format = req.nextUrl.searchParams.get('format') ?? 'pdf'

  try {
    const purchase = await getPurchase(params.id)

    if (format === 'thermal') {
      // Lazy-import to keep server bundle trim
      const { buildPurchaseReceipt } = await import('@/lib/print/thermal')
      const buf = await buildPurchaseReceipt({
        refNumber:     purchase.refNumber,
        customerName:  `${purchase.customer.firstName} ${purchase.customer.lastName}`,
        customerIdNo:  purchase.customer.idNumber ?? undefined,
        lines: purchase.lines.map((l) => ({
          productName: l.product.name,
          qty:         Number(l.quantity),
          unitPrice:   l.unitPrice.toString(),
          lineTotal:   l.lineTotal.toString(),
        })),
        totalAmount:   purchase.totalAmount.toString(),
        paymentMethod: purchase.paymentMethod,
        cashierName:   session.user.name ?? 'Cashier',
        createdAt:     purchase.createdAt,
      })
      return new NextResponse(buf.buffer as ArrayBuffer, {
        headers: {
          'Content-Type':        'application/octet-stream',
          'Content-Disposition': `attachment; filename="receipt-${purchase.refNumber}.bin"`,
        },
      })
    }

    // PDF (default)
    const pdfBytes = await generateTransactionSlip({
      type:          'PURCHASE',
      refNumber:     purchase.refNumber,
      date:          purchase.createdAt,
      partyLabel:    'Supplier',
      partyName:     `${purchase.customer.firstName} ${purchase.customer.lastName}`,
      partyIdNumber: purchase.customer.idNumber ?? undefined,
      partyPhone:    purchase.customer.phone ?? undefined,
      lines: purchase.lines.map((l) => ({
        productName: l.product.name,
        qty:         Number(l.quantity),
        unitPrice:   l.unitPrice.toString(),
        lineTotal:   l.lineTotal.toString(),
      })),
      totalAmount:   purchase.totalAmount.toString(),
      paymentMethod: purchase.paymentMethod,
      cashierName:   session.user.name ?? 'Cashier',
      notes:         purchase.notes ?? undefined,
    })

    return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="purchase-${purchase.refNumber}.pdf"`,
      },
    })
  } catch (err) {
    logger.error({ err, id: params.id }, 'GET /api/purchases/[id]/receipt failed')
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 })
  }
}
