import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getSale, SaleNotFoundError } from '@/lib/services/saleService'
import { getAllSettings } from '@/lib/services/settingsService'
import { generateTransactionSlip } from '@/lib/pdf/slip'

// GET /api/sales/[id]/packing-list
// Returns a PDF packing list for the sale (items + quantities).
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    const pdfBytes = await generateTransactionSlip({
      type:           'SALE',
      refNumber:      `PL-${sale.refNumber}`,
      date:           sale.createdAt,
      partyLabel:     'Buyer',
      partyName:      sale.buyerName ?? 'Walk-in Customer',
      partyIdNumber:  sale.buyerIdNumber ?? undefined,
      partyPhone:     sale.buyerPhone   ?? undefined,
      lines,
      totalAmount:    sale.totalAmount.toString(),
      paymentMethod:  sale.paymentMethod,
      cashierName:    session.user.name ?? 'Cashier',
      notes:          sale.notes ?? undefined,
      companyName:    settings.yardName,
      companyAddress: settings.yardAddress,
      companyPhone:   settings.yardPhone,
      vatNumber:      settings.vatNumber,
    })

    return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="packing-list-${sale.refNumber}.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof SaleNotFoundError) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }
    logger.error({ err, id: params.id }, 'GET /api/sales/[id]/packing-list failed')
    return NextResponse.json({ error: 'Failed to generate packing list' }, { status: 500 })
  }
}
