import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { getAllSettings } from '@/lib/services/settingsService'
import { buildPurchaseReceipt, buildSaleReceipt } from '@/lib/print/thermal'
import { derivePurchasePaymentStatus, isPurchaseReceiptEligible } from '@/lib/services/purchaseService'
import { purchaseHeaderAmounts } from '@/lib/utils/vat'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'

class SlipRecordNotFoundError extends Error {}
class SlipNotPayableError extends Error {}

/**
 * POST /api/print/slip
 * Prints a purchase or sale receipt to the configured thermal printer.
 * Body: { type: 'purchase' | 'sale', id: string }
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { type, id } = await req.json()

  if (!type || !id) {
    return NextResponse.json({ error: 'Missing type or id' }, { status: 400 })
  }

  if (type !== 'purchase' && type !== 'sale') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  // Get printer config
  const cfg = await runWithRequestTenant(req, () => getAllSettings())
  if (!cfg.printerType || cfg.printerType === 'none') {
    return NextResponse.json({ error: 'No printer configured' }, { status: 400 })
  }

  try {
    let receiptBuffer: Buffer

    if (type === 'purchase') {
      // Fetch purchase with related data
      const purchase = await runWithRequestTenant(req, async () => {
        const purchase = await prisma.purchase.findUnique({
          where: { id },
          include: {
            customer: true,
            lines: { include: { product: true } },
            scaleOrder: { include: { operator: { select: { fullName: true } } } },
          },
        })
        if (!purchase) throw new SlipRecordNotFoundError('Purchase not found')
        return purchase
      })

      const paymentStatus = derivePurchasePaymentStatus(purchase)
      if (!isPurchaseReceiptEligible(paymentStatus)) {
        throw new SlipNotPayableError(
          paymentStatus === 'voided' ? 'Cannot print a receipt for a voided purchase' : 'Receipt is only available once the purchase has been paid'
        )
      }

      const doneByUser = purchase.createdByUserId
        ? await prisma.user.findUnique({ where: { id: purchase.createdByUserId }, select: { fullName: true } })
        : null

      const zeroRated = purchase.customer.zeroRated
      const header = purchaseHeaderAmounts(purchase, zeroRated)

      // Build receipt data
      const lines = purchase.lines.map(line => ({
        productCode: line.product.code,
        productName: line.product.name,
        qty: Number(line.quantity),
        unitPrice: line.unitPrice.toString(),
        lineTotal: line.lineTotal.toString(),
        grossQty: line.grossQty ? Number(line.grossQty) : undefined,
        tareQty:  line.tareQty  ? Number(line.tareQty)  : undefined,
      }))

      receiptBuffer = await buildPurchaseReceipt({
        refNumber:         purchase.refNumber,
        customerCode:      purchase.customer.accountCode ?? undefined,
        customerName:      purchase.customer.companyName?.trim() || `${purchase.customer.firstName} ${purchase.customer.lastName}`,
        customerIdNo:      purchase.customer.idNumber ?? undefined,
        customerVatNumber: purchase.customer.vatNumber ?? undefined,
        lines,
        totalAmount:       header.grandTotal.toFixed(2),
        subtotalAmount:    header.subTotal.toFixed(2),
        vatAmount:         header.vat.toFixed(2),
        vatRatePct:        cfg.vatRate ?? '15',
        paymentMethod:     purchase.paymentMethod,
        cashierName:       doneByUser?.fullName ?? session.user.name ?? 'Cashier',
        scaleOpName:       purchase.scaleOrder?.operator?.fullName,
        createdAt:         purchase.createdAt,
        status:            paymentStatus,
        slipNo:            purchase.wbTicketNumber ?? undefined,
        splitPayments:     purchase.splitPayments as { cash: string; eft: string; cheque: string; loan: string } | undefined,
        companyName:       cfg.yardName,
        companyAddress:    cfg.yardAddress,
        companyPhone:      cfg.yardPhone,
        companyVatNumber:  cfg.yardVat ?? cfg.vatNumber,
      })
    } else {
      // Fetch sale with related data
      const sale = await runWithRequestTenant(req, async () => {
        const sale = await prisma.sale.findUnique({
          where: { id },
          include: {
            customer: true,
            lines: { include: { product: true } },
          },
        })
        if (!sale) throw new SlipRecordNotFoundError('Sale not found')
        return sale
      })

      // Build receipt data
      const lines = sale.lines.map(line => ({
        productName: line.product.name,
        qty: Number(line.quantity),
        unitPrice: line.unitPrice.toString(),
        lineTotal: new Decimal(line.unitPrice).times(line.quantity).toString(),
      }))

      receiptBuffer = await buildSaleReceipt({
        refNumber: sale.refNumber,
        buyerName: sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : undefined,
        buyerIdNumber: sale.customer?.idNumber ?? undefined,
        lines,
        totalAmount: sale.totalAmount.toString(),
        paymentMethod: sale.paymentMethod,
        cashierName: session.user.name ?? 'Cashier',
        createdAt: sale.createdAt,
      })
    }

    // Connect to printer and send
    const { ThermalPrinter, PrinterTypes, CharacterSet } = await import('node-thermal-printer')

    const iface = cfg.printerType === 'tcp'
      ? `tcp://${cfg.printerIp ?? '127.0.0.1'}:${cfg.printerTcpPort ?? '9100'}`
      : cfg.printerSerialPort ?? 'COM1'

    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: iface,
      characterSet: CharacterSet.PC850_MULTILINGUAL,
      removeSpecialCharacters: false,
      lineCharacter: '-',
    })

    const connected = await printer.isPrinterConnected()
    if (!connected) {
      return NextResponse.json({ error: 'Printer not reachable' }, { status: 503 })
    }

    // Send the raw buffer to the printer
    printer.raw(receiptBuffer)
    await printer.execute()

    logger.info({ type, id, iface }, 'receipt.printed')
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof SlipRecordNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof SlipNotPayableError) return NextResponse.json({ error: err.message }, { status: 400 })
    logger.error({ err, type, id }, 'print-slip.failed')
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Print failed' },
      { status: 500 }
    )
  }
}
