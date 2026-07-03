import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { getAllSettings, LOGO_SETTING_KEY } from '@/lib/services/settingsService'
import { fetchR2Bytes } from '@/lib/r2'
import { purchaseLineAmounts, purchaseHeaderAmounts } from '@/lib/utils/vat'
import { generateTransactionNote, type NoteLine } from '@/lib/pdf/transactionNote'

/**
 * GET /api/purchases/[id]/note?download=1
 * A4 Purchase Note PDF — inline for viewing, ?download=1 for attachment.
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
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { include: { product: true } },
      },
    })
    if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })

    const settings = await getAllSettings()
    const logoKey = settings[LOGO_SETTING_KEY]
    const logoPng = logoKey ? await fetchR2Bytes(logoKey) : null

    const zeroRated = purchase.customer.zeroRated
    const lines: NoteLine[] = purchase.lines.map((l) => {
      const a = purchaseLineAmounts(l, zeroRated)
      return {
        code: l.product.code,
        name: l.product.name,
        unit: l.product.unit,
        unitPrice: l.unitPrice.toString(),
        grossQty: l.grossQty?.toString() ?? null,
        tareQty: l.tareQty?.toString() ?? null,
        quantity: l.quantity.toString(),
        vat: a.vat.toFixed(2),
        lineTotal: a.grandTotal.toFixed(2),
      }
    })

    const header = purchaseHeaderAmounts(purchase, zeroRated)
    const grand = header.grandTotal
    const deduction = purchase.loanDeductionAmount ? new Decimal(purchase.loanDeductionAmount.toString()) : new Decimal(0)
    const paid = new Decimal(purchase.amountPaid.toString())
    const balance =
      purchase.status === 'pending'
        ? Decimal.max(grand.minus(deduction).minus(paid), new Decimal(0))
        : new Decimal(0)

    const status =
      purchase.status === 'voided' ? 'VOIDED'
      : purchase.status === 'pending' ? (paid.greaterThan(0) ? 'PARTIAL' : 'UNPAID')
      : 'PAID'

    const customer = purchase.customer
    const pdfBytes = await generateTransactionNote({
      type: 'PURCHASE NOTE',
      refNumber: purchase.refNumber,
      date: purchase.createdAt,
      status,
      company: {
        name: settings['yardName'] ?? 'RecycleProX',
        address: settings['yardAddress'] ?? '',
        phone: settings['yardPhone'] ?? undefined,
        vat: settings['yardVat'] ?? settings['vatNumber'] ?? undefined,
      },
      logoPng,
      partyLabel: 'Supplier',
      partyName: customer.companyName?.trim() || `${customer.firstName} ${customer.lastName}`,
      partyIdNumber: customer.idNumber ?? undefined,
      partyPhone: customer.phone ?? undefined,
      partyAddress: customer.physicalAddress ?? undefined,
      vehicleReg: purchase.vehicleReg ?? undefined,
      wbTicketNumber: purchase.wbTicketNumber ?? undefined,
      lines,
      subTotal: header.subTotal.toFixed(2),
      vatAmount: header.vat.toFixed(2),
      grandTotal: grand.toFixed(2),
      loanDeduction: deduction.greaterThan(0) ? deduction.toFixed(2) : undefined,
      amountPaid: paid.greaterThan(0) || purchase.status === 'completed' ? (purchase.status === 'completed' && paid.isZero() ? grand.minus(deduction).toFixed(2) : paid.toFixed(2)) : undefined,
      balanceDue: balance.greaterThan(0) ? balance.toFixed(2) : undefined,
      paymentMethod: purchase.paymentMethod,
      splitPayments: purchase.splitPayments as { cash?: string; eft?: string; cheque?: string; loan?: string } | null,
      notes: purchase.notes ?? undefined,
      generatedAt: new Date(),
    })

    const buffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="purchase-note-${purchase.refNumber}.pdf"`,
      },
    })
  } catch (err) {
    logger.error({ err, purchaseId: id }, 'GET /api/purchases/[id]/note failed')
    return NextResponse.json({ error: 'Failed to generate purchase note' }, { status: 500 })
  }
}
