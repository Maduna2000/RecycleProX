import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { getPurchase } from '@/lib/services/purchaseService'
import { getAllSettings } from '@/lib/services/settingsService'
import { getCustomerLoanSummary } from '@/lib/services/loanService'
import { generateTransactionSlip } from '@/lib/pdf/slip'
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
    const { purchase, settings, remainingLoanBalance } = await runWithRequestTenant(req, async () => {
      const [purchase, settings] = await Promise.all([
        getPurchase(id),
        getAllSettings(),
      ])

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

      return { purchase, settings, remainingLoanBalance }
    })

    const amountPaidDec = new Decimal(purchase.amountPaid.toString())

    const slipStatus: 'completed' | 'pending' | 'partial' =
      purchase.status === 'completed'            ? 'completed'
      : amountPaidDec.greaterThan(0)             ? 'partial'
      : 'pending'

    const slipAmountPaid = amountPaidDec.greaterThan(0) ? amountPaidDec.toFixed(2) : undefined

    const lines = purchase.lines.map((l) => ({
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
        companyName:   settings.yardName,
        refNumber:     purchase.refNumber,
        customerName:  `${purchase.customer.firstName} ${purchase.customer.lastName}`,
        customerIdNo:  purchase.customer.idNumber ?? undefined,
        lines,
        totalAmount:   purchase.totalAmount.toString(),
        paymentMethod: purchase.paymentMethod,
        cashierName:   session.user.name ?? 'Cashier',
        createdAt:     purchase.createdAt,
        splitPayments: splitPayments ?? undefined,
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
      partyName:      `${purchase.customer.firstName} ${purchase.customer.lastName}`,
      partyIdNumber:  purchase.customer.idNumber ?? undefined,
      partyPhone:     purchase.customer.phone ?? undefined,
      lines,
      totalAmount:    purchase.totalAmount.toString(),
      ...(purchase.vatAmount && new Decimal(purchase.vatAmount.toString()).greaterThan(0) ? {
        vatAmount:      new Decimal(purchase.vatAmount.toString()).toFixed(2),
        subtotalAmount: new Decimal(purchase.totalAmount.toString()).minus(purchase.vatAmount.toString()).toFixed(2),
      } : {}),
      loanDeduction:  purchase.loanDeductionAmount?.toString(),
      paymentMethod:  purchase.paymentMethod,
      cashierName:    session.user.name ?? 'Cashier',
      notes:          purchase.notes ?? undefined,
      status:              slipStatus,
      amountPaid:          slipAmountPaid,
      remainingLoanBalance,
      splitPayments:  splitPayments ?? undefined,
      companyName:    settings.yardName,
      companyAddress: settings.yardAddress,
      companyPhone:   settings.yardPhone,
      vatNumber:      settings.vatNumber,
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
