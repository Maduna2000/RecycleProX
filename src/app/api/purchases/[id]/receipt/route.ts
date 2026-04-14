import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getPurchase } from '@/lib/services/purchaseService'
import { generateTransactionSlip } from '@/lib/pdf/slip'
import { prisma } from '@/lib/db/prisma'

/**
 * GET /api/purchases/[id]/receipt?format=pdf|thermal
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
    const [purchase, settingsRows] = await Promise.all([
      getPurchase(params.id),
      prisma.systemSettings.findMany({
        where: { key: { in: ['yardName', 'yardAddress', 'yardPhone', 'vatNumber', 'receiptFooter'] } },
      }),
    ])

    const settings: Record<string, string> = {}
    for (const row of settingsRows) settings[row.key] = row.value

    const lines = purchase.lines.map((l) => ({
      productName: l.product.name,
      qty:         Number(l.quantity),
      unitPrice:   l.unitPrice.toString(),
      lineTotal:   l.lineTotal.toString(),
      grossQty:    l.grossQty ? Number(l.grossQty) : undefined,
      tareQty:     l.tareQty  ? Number(l.tareQty)  : undefined,
      tareReason:  l.tareReason ?? undefined,
    }))

    if (format === 'thermal') {
      const { buildPurchaseReceipt } = await import('@/lib/print/thermal')
      const buf = await buildPurchaseReceipt({
        refNumber:     purchase.refNumber,
        customerName:  `${purchase.customer.firstName} ${purchase.customer.lastName}`,
        customerIdNo:  purchase.customer.idNumber ?? undefined,
        lines,
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
      loanDeduction:  purchase.loanDeductionAmount?.toString(),
      paymentMethod:  purchase.paymentMethod,
      cashierName:    session.user.name ?? 'Cashier',
      notes:          purchase.notes ?? undefined,
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
    logger.error({ err, id: params.id }, 'GET /api/purchases/[id]/receipt failed')
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 })
  }
}
