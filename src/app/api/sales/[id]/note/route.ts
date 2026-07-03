import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { getAllSettings, LOGO_SETTING_KEY } from '@/lib/services/settingsService'
import { fetchR2Bytes } from '@/lib/r2'
import { saleLineVat } from '@/lib/utils/vat'
import { generateTransactionNote, type NoteLine } from '@/lib/pdf/transactionNote'

/**
 * GET /api/sales/[id]/note?download=1
 * A4 Sale Note PDF — inline for viewing, ?download=1 for attachment.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const download = req.nextUrl.searchParams.get('download') === '1'

  try {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { include: { product: true } },
      },
    })
    if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

    const settings = await getAllSettings()
    const logoKey = settings[LOGO_SETTING_KEY]
    const logoPng = logoKey ? await fetchR2Bytes(logoKey) : null

    const saleHasVat = new Decimal(sale.vatAmount.toString()).greaterThan(0)
    const lines: NoteLine[] = sale.lines.map((l) => {
      const vat = saleLineVat(l, saleHasVat)
      return {
        code: l.product.code,
        name: l.product.name,
        unit: l.product.unit,
        unitPrice: l.unitPrice.toString(),
        grossQty: l.grossQty?.toString() ?? null,
        tareQty: l.tareQty?.toString() ?? null,
        quantity: l.quantity.toString(),
        vat: vat.toFixed(2),
        lineTotal: new Decimal(l.lineTotal.toString()).plus(vat).toFixed(2),
      }
    })

    const grand = new Decimal(sale.totalAmount.toString())
    const vatAmount = new Decimal(sale.vatAmount.toString())
    const paid = sale.amountPaid !== null
      ? new Decimal(sale.amountPaid.toString())
      : sale.status === 'completed' ? grand : new Decimal(0)
    const balance = Decimal.max(grand.minus(paid), new Decimal(0))

    const status =
      sale.status === 'voided' ? 'VOIDED'
      : sale.status === 'pending' ? (paid.greaterThan(0) ? 'PARTIAL' : 'UNPAID')
      : 'PAID'

    const partyName = sale.customer
      ? (sale.customer.companyName?.trim() || `${sale.customer.firstName} ${sale.customer.lastName}`)
      : (sale.buyerName?.trim() || 'Walk-in Buyer')

    const pdfBytes = await generateTransactionNote({
      type: 'SALE NOTE',
      refNumber: sale.refNumber,
      date: sale.createdAt,
      status,
      company: {
        name: settings['yardName'] ?? 'RecycleProX',
        address: settings['yardAddress'] ?? '',
        phone: settings['yardPhone'] ?? undefined,
        vat: settings['yardVat'] ?? settings['vatNumber'] ?? undefined,
      },
      logoPng,
      partyLabel: 'Buyer',
      partyName,
      partyIdNumber: sale.customer?.idNumber ?? sale.buyerIdNumber ?? undefined,
      partyPhone: sale.customer?.phone ?? sale.buyerPhone ?? undefined,
      partyAddress: sale.customer?.physicalAddress ?? undefined,
      lines,
      subTotal: grand.minus(vatAmount).toFixed(2),
      vatAmount: vatAmount.toFixed(2),
      grandTotal: grand.toFixed(2),
      amountPaid: paid.greaterThan(0) ? paid.toFixed(2) : undefined,
      balanceDue: balance.greaterThan(0) ? balance.toFixed(2) : undefined,
      paymentMethod: sale.paymentMethod,
      notes: sale.notes ?? undefined,
      generatedAt: new Date(),
    })

    const buffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="sale-note-${sale.refNumber}.pdf"`,
      },
    })
  } catch (err) {
    logger.error({ err, saleId: id }, 'GET /api/sales/[id]/note failed')
    return NextResponse.json({ error: 'Failed to generate sale note' }, { status: 500 })
  }
}
