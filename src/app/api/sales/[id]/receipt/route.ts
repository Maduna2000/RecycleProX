import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { getSale } from '@/lib/services/saleService'
import { getAllSettings } from '@/lib/services/settingsService'
import { generateTransactionSlip } from '@/lib/pdf/slip'

/**
 * GET /api/sales/[id]/receipt?format=pdf|thermal
 * - pdf     → returns thermal-style PDF receipt
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
    const [sale, settings] = await Promise.all([
      getSale(params.id),
      getAllSettings(),
    ])

    const lines = sale.lines.map((l) => ({
      productName: l.product.name,
      qty:         Number(l.quantity),
      unitPrice:   l.unitPrice.toString(),
      lineTotal:   l.lineTotal.toString(),
    }))

    if (format === 'thermal') {
      const { buildSaleReceipt } = await import('@/lib/print/thermal')
      const buf = await buildSaleReceipt({
        refNumber:      sale.refNumber,
        buyerName:      sale.buyerName ?? undefined,
        buyerIdNumber:  sale.buyerIdNumber ?? undefined,
        lines,
        totalAmount:    sale.totalAmount.toString(),
        paymentMethod:  sale.paymentMethod,
        cashierName:    session.user.name ?? 'Cashier',
        createdAt:      sale.createdAt,
      })
      return new NextResponse(buf.buffer as ArrayBuffer, {
        headers: {
          'Content-Type':        'application/octet-stream',
          'Content-Disposition': `attachment; filename="receipt-${sale.refNumber}.bin"`,
        },
      })
    }

    // Thermal-style PDF receipt
    const vatAmount = new Decimal(sale.vatAmount.toString())
    const pdfBytes = await generateTransactionSlip({
      type:           'SALE',
      refNumber:      sale.refNumber,
      date:           sale.createdAt,
      partyLabel:     'Buyer',
      partyName:      sale.buyerName ?? 'Walk-in Customer',
      partyIdNumber:  sale.buyerIdNumber ?? undefined,
      partyPhone:     sale.buyerPhone ?? undefined,
      lines,
      totalAmount:    sale.totalAmount.toString(),
      ...(vatAmount.greaterThan(0) ? {
        vatAmount:      vatAmount.toFixed(2),
        subtotalAmount: new Decimal(sale.totalAmount.toString()).minus(vatAmount).toFixed(2),
      } : {}),
      paymentMethod:  sale.paymentMethod,
      cashierName:    session.user.name ?? 'Cashier',
      notes:          sale.notes ?? undefined,
      companyName:    settings.yardName,
      companyAddress: settings.yardAddress,
      companyPhone:   settings.yardPhone,
      vatNumber:      settings.vatNumber,
      receiptFooter:  settings.receiptFooter,
    })

    return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="receipt-${sale.refNumber}.pdf"`,
      },
    })
  } catch (err) {
    logger.error({ err, id: params.id }, 'GET /api/sales/[id]/receipt failed')
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 })
  }
}
