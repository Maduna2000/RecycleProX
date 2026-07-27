import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { getPurchase, derivePurchasePaymentStatus, isPurchaseReceiptEligible } from '@/lib/services/purchaseService'
import { getAllSettings } from '@/lib/services/settingsService'
import { getCustomerLoanSummary } from '@/lib/services/loanService'
import { generateTransactionSlip } from '@/lib/pdf/slip'
import { purchaseHeaderAmounts } from '@/lib/utils/vat'
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
    const { purchase, settings, doneByUser, remainingLoanBalance } = await runWithRequestTenant(req, async () => {
      const [purchase, settings] = await Promise.all([
        getPurchase(id),
        getAllSettings(),
      ])

      const doneByUser = purchase.createdByUserId
        ? await prisma.user.findUnique({ where: { id: purchase.createdByUserId }, select: { fullName: true } })
        : null

      const loanDec = purchase.loanDeductionAmount
        ? new Decimal(purchase.loanDeductionAmount.toString())
        : new Decimal(0)

      // Remaining loan balance (current outstanding after applied deduction)
      let remainingLoanBalance: string | undefined
      if (loanDec.greaterThan(0)) {
        const loanSummary = await getCustomerLoanSummary(purchase.customerId)
        if (new Decimal(loanSummary.outstanding).greaterThan(0)) {
          remainingLoanBalance = loanSummary.outstanding
        }
      }

      return { purchase, settings, doneByUser, remainingLoanBalance }
    })

    // A receipt can only be produced once the purchase has actually been paid —
    // pending/unpaid purchases have nothing to show as "paid" on a receipt.
    const paymentStatus = derivePurchasePaymentStatus(purchase)
    if (!isPurchaseReceiptEligible(paymentStatus)) {
      return NextResponse.json(
        { error: paymentStatus === 'voided' ? 'Cannot generate a receipt for a voided purchase' : 'Receipt is only available once the purchase has been paid' },
        { status: 400 },
      )
    }

    const amountPaidDec = new Decimal(purchase.amountPaid.toString())
    const slipAmountPaid = amountPaidDec.greaterThan(0) ? amountPaidDec.toFixed(2) : undefined

    const zeroRated = purchase.customer.zeroRated
    const header = purchaseHeaderAmounts(purchase, zeroRated)
    const vatRatePct = settings.vatRate ?? '15'

    const cashierName = doneByUser?.fullName ?? session.user.name ?? 'Cashier'
    const scaleOpName = purchase.scaleOrder?.operator?.fullName

    const lines = purchase.lines.map((l) => ({
      productCode: l.product.code,
      productName: l.product.name,
      qty:         Number(l.quantity),
      unitPrice:   l.unitPrice.toString(),
      lineTotal:   l.lineTotal.toString(),
      grossQty:    l.grossQty ? Number(l.grossQty) : undefined,
      tareQty:     l.tareQty  ? Number(l.tareQty)  : undefined,
      tareReason:  l.tareReason ?? undefined,
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
        refNumber:         purchase.refNumber,
        customerCode:      purchase.customer.accountCode ?? undefined,
        customerName:      purchase.customer.companyName?.trim() || `${purchase.customer.firstName} ${purchase.customer.lastName}`,
        customerIdNo:      purchase.customer.idNumber ?? undefined,
        customerVatNumber: purchase.customer.vatNumber ?? undefined,
        lines,
        totalAmount:       header.grandTotal.toFixed(2),
        subtotalAmount:    header.subTotal.toFixed(2),
        vatAmount:         header.vat.toFixed(2),
        vatRatePct,
        paymentMethod:     purchase.paymentMethod,
        cashierName,
        scaleOpName,
        createdAt:         purchase.createdAt,
        status:            paymentStatus,
        slipNo:            purchase.wbTicketNumber ?? undefined,
        splitPayments:     splitPayments ?? undefined,
        companyName:       settings.yardName,
        companyAddress:    settings.yardAddress,
        companyPhone:      settings.yardPhone,
        companyVatNumber:  settings.yardVat ?? settings.vatNumber,
      })
      return new NextResponse(buf.buffer as ArrayBuffer, {
        headers: {
          'Content-Type':        'application/octet-stream',
          'Content-Disposition': `attachment; filename="receipt-${purchase.refNumber}.bin"`,
        },
      })
    }

    // Thermal-style PDF receipt
    const pdfBytes = await generateTransactionSlip({
      type:           'PURCHASE',
      refNumber:      purchase.refNumber,
      date:           purchase.createdAt,
      partyLabel:     'Supplier',
      partyName:      purchase.customer.companyName?.trim() || `${purchase.customer.firstName} ${purchase.customer.lastName}`,
      partyIdNumber:  purchase.customer.idNumber ?? undefined,
      partyPhone:     purchase.customer.phone ?? undefined,
      lines,
      totalAmount:    header.grandTotal.toFixed(2),
      ...(header.vat.greaterThan(0) ? {
        vatAmount:      header.vat.toFixed(2),
        subtotalAmount: header.subTotal.toFixed(2),
      } : {}),
      loanDeduction:  purchase.loanDeductionAmount?.toString(),
      paymentMethod:  purchase.paymentMethod,
      cashierName,
      notes:          purchase.notes ?? undefined,
      status:              paymentStatus === 'voided' ? 'pending' : paymentStatus,
      amountPaid:          slipAmountPaid,
      remainingLoanBalance,
      splitPayments:  splitPayments ?? undefined,
      companyName:    settings.yardName,
      companyAddress: settings.yardAddress,
      companyPhone:   settings.yardPhone,
      vatNumber:      settings.yardVat ?? settings.vatNumber,
      receiptFooter:  settings.receiptFooter,
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
