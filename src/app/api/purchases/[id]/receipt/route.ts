import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getPurchase } from '@/lib/services/purchaseService'
import { getAllSettings } from '@/lib/services/settingsService'
import { generatePurchaseReceiptPdf } from '@/lib/pdf/slip'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

/**
 * GET /api/purchases/[id]/receipt?format=pdf|thermal
 * - pdf     → returns thermal-style PDF receipt
 * - thermal → returns ESC/POS buffer as application/octet-stream
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Await params for Next.js 15 compatibility
  const { id } = await context.params

  const format = req.nextUrl.searchParams.get('format') ?? 'pdf'

  try {
    const { purchase, settings } = await runWithRequestTenant(req, async () => {
      const [purchase, settings] = await Promise.all([
        getPurchase(id),
        getAllSettings(),
      ])
      return { purchase, settings }
    })

    const thermalLines = purchase.lines.map((l) => ({
      productCode: l.product.code,
      productName: l.product.name,
      qty:         Number(l.quantity),
      unitPrice:   l.unitPrice.toString(),
      lineTotal:   l.lineTotal.toString(),
      grossQty:    l.grossQty?.toString(),
      tareQty:     l.tareQty?.toString(),
    }))

    // Parse splitPayments from JSON if present
    const splitPayments = purchase.splitPayments as {
      cash: string
      eft: string
      cheque: string
      loan: string
    } | null

    if (format === 'thermal') {
      const { buildPurchaseReceipt } = await import('@/lib/print/thermal')
      const buf = await buildPurchaseReceipt({
        companyName:    settings.yardName,
        companyAddress: settings.yardAddress,
        companyPhone:   settings.yardPhone,
        vatNumber:      settings.vatNumber,
        refNumber:      purchase.refNumber,
        status:         purchase.status,
        customerCode:   purchase.customer.accountCode ?? undefined,
        customerName:   `${purchase.customer.firstName} ${purchase.customer.lastName}`,
        customerIdNo:   purchase.customer.idNumber ?? undefined,
        customerPhone:  purchase.customer.phone ?? undefined,
        customerVatNumber: purchase.customer.vatNumber ?? undefined,
        lines:          thermalLines,
        totalAmount:    purchase.totalAmount.toString(),
        vatAmount:      purchase.vatAmount ? purchase.vatAmount.toString() : undefined,
        paymentMethod:  purchase.paymentMethod,
        cashierName:    session.user.name ?? 'Cashier',
        scaleOperatorName: purchase.scaleOrder?.operator.fullName,
        createdAt:      purchase.createdAt,
        footerText:     settings.purchaseNoteDeclaration,
        loanDeduction:  purchase.loanDeductionAmount ? { amount: purchase.loanDeductionAmount.toString() } : undefined,
        splitPayments:  splitPayments ?? undefined,
      })
      return new NextResponse(buf.buffer as ArrayBuffer, {
        headers: {
          'Content-Type':        'application/octet-stream',
          'Content-Disposition': `attachment; filename="receipt-${purchase.refNumber}.bin"`,
        },
      })
    }

    // Legacy-format PDF receipt — same layout as the thermal printout, see
    // generatePurchaseReceiptPdf's own header comment.
    const pdfBytes = await generatePurchaseReceiptPdf({
      refNumber:      purchase.refNumber,
      // Daily sequence number already embedded in the ref number
      // (PUR-YYYYMMDD-NNNN) — see generatePurchaseReceiptPdf's own caller
      // in purchaseService.ts for why this is used as "Slip No."
      slipNo:         Number(purchase.refNumber.split('-').pop()),
      status:         purchase.status,
      customerCode:   purchase.customer.accountCode ?? undefined,
      customerName:   `${purchase.customer.firstName} ${purchase.customer.lastName}`,
      customerIdNo:   purchase.customer.idNumber ?? undefined,
      customerPhone:  purchase.customer.phone ?? undefined,
      customerVatNumber: purchase.customer.vatNumber ?? undefined,
      lines:          thermalLines,
      totalAmount:    purchase.totalAmount.toString(),
      vatAmount:      purchase.vatAmount ? purchase.vatAmount.toString() : undefined,
      paymentMethod:  purchase.paymentMethod,
      cashierName:    session.user.name ?? 'Cashier',
      scaleOperatorName: purchase.scaleOrder?.operator.fullName,
      createdAt:      purchase.createdAt,
      footerText:     settings.purchaseNoteDeclaration,
      loanDeduction:  purchase.loanDeductionAmount ? { amount: purchase.loanDeductionAmount.toString() } : undefined,
      splitPayments:  splitPayments ?? undefined,
      companyName:    settings.yardName,
      companyAddress: settings.yardAddress,
      companyPhone:   settings.yardPhone,
      vatNumber:      settings.vatNumber,
    })

    return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="receipt-${purchase.refNumber}.pdf"`,
      },
    })
  } catch (err) {
    logger.error({ err, purchaseId: id }, 'GET /api/purchases/[id]/receipt failed')
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 })
  }
}
