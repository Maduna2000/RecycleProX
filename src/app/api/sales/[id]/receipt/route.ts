import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getSale } from '@/lib/services/saleService'
import { getAllSettings } from '@/lib/services/settingsService'
import { generateSaleReceiptPdf } from '@/lib/pdf/slip'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

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
    const [sale, settings] = await runWithRequestTenant(req, () => Promise.all([
      getSale(params.id),
      getAllSettings(),
    ]))

    const thermalLines = sale.lines.map((l) => ({
      productCode: l.product.code,
      productName: l.product.name,
      qty:         Number(l.quantity),
      unitPrice:   l.unitPrice.toString(),
      lineTotal:   l.lineTotal.toString(),
      grossQty:    l.grossQty?.toString(),
      tareQty:     l.tareQty?.toString(),
    }))

    const splitPayments = sale.splitPayments as {
      cash: string; eft: string; businessLoan: string
    } | null

    if (format === 'thermal') {
      const { buildSaleReceipt } = await import('@/lib/print/thermal')
      const buf = await buildSaleReceipt({
        companyName:    settings.yardName,
        companyAddress: settings.yardAddress,
        companyPhone:   settings.yardPhone,
        vatNumber:      settings.vatNumber,
        refNumber:      sale.refNumber,
        status:         sale.status,
        buyerCode:      sale.customer?.accountCode ?? undefined,
        buyerName:      sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : (sale.buyerName ?? undefined),
        buyerIdNumber:  sale.customer?.idNumber ?? sale.buyerIdNumber ?? undefined,
        buyerPhone:     sale.customer?.phone ?? sale.buyerPhone ?? undefined,
        buyerVatNumber: sale.customer?.vatNumber ?? undefined,
        lines:          thermalLines,
        totalAmount:    sale.totalAmount.toString(),
        vatAmount:      sale.vatAmount ? sale.vatAmount.toString() : undefined,
        paymentMethod:  sale.paymentMethod,
        cashierName:    session.user.name ?? 'Cashier',
        createdAt:      sale.createdAt,
        footerText:     settings.saleNoteDeclaration,
        businessLoanDeduction: sale.businessLoanDeductionAmount ? { amount: sale.businessLoanDeductionAmount.toString() } : undefined,
        splitPayments:  splitPayments ?? undefined,
      })
      return new NextResponse(buf.buffer as ArrayBuffer, {
        headers: {
          'Content-Type':        'application/octet-stream',
          'Content-Disposition': `attachment; filename="receipt-${sale.refNumber}.bin"`,
        },
      })
    }

    // Legacy-format PDF receipt — same layout as the thermal printout and
    // as generatePurchaseReceiptPdf, see generateSaleReceiptPdf's own header comment.
    const pdfBytes = await generateSaleReceiptPdf({
      refNumber:      sale.refNumber,
      slipNo:         Number(sale.refNumber.match(/\d+$/)?.[0] ?? 0),
      status:         sale.status,
      buyerCode:      sale.customer?.accountCode ?? undefined,
      buyerName:      sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : (sale.buyerName ?? 'Walk-in Customer'),
      buyerIdNumber:  sale.customer?.idNumber ?? sale.buyerIdNumber ?? undefined,
      buyerPhone:     sale.customer?.phone ?? sale.buyerPhone ?? undefined,
      buyerVatNumber: sale.customer?.vatNumber ?? undefined,
      lines:          thermalLines,
      totalAmount:    sale.totalAmount.toString(),
      vatAmount:      sale.vatAmount ? sale.vatAmount.toString() : undefined,
      paymentMethod:  sale.paymentMethod,
      cashierName:    session.user.name ?? 'Cashier',
      createdAt:      sale.createdAt,
      footerText:     settings.saleNoteDeclaration,
      businessLoanDeduction: sale.businessLoanDeductionAmount ? { amount: sale.businessLoanDeductionAmount.toString() } : undefined,
      splitPayments:  splitPayments ?? undefined,
      companyName:    settings.yardName,
      companyAddress: settings.yardAddress,
      companyPhone:   settings.yardPhone,
      vatNumber:      settings.vatNumber,
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
