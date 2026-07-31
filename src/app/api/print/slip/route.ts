import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { getAllSettings } from '@/lib/services/settingsService'
import { buildPurchaseReceipt, buildSaleReceipt } from '@/lib/print/thermal'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'

class SlipRecordNotFoundError extends Error {}

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
          },
        })
        if (!purchase) throw new SlipRecordNotFoundError('Purchase not found')
        return purchase
      })

      // Build receipt data
      const lines = purchase.lines.map(line => ({
        productName: line.product.name,
        qty: Number(line.quantity),
        unitPrice: line.unitPrice.toString(),
        lineTotal: new Decimal(line.unitPrice).times(line.quantity).toString(),
      }))

      receiptBuffer = await buildPurchaseReceipt({
        companyName: cfg.yardName,
        refNumber: purchase.refNumber,
        customerName: `${purchase.customer.firstName} ${purchase.customer.lastName}`,
        customerIdNo: purchase.customer.idNumber ?? undefined,
        lines,
        totalAmount: purchase.totalAmount.toString(),
        paymentMethod: purchase.paymentMethod,
        cashierName: session.user.name ?? 'Cashier',
        createdAt: purchase.createdAt,
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
        companyName: cfg.yardName,
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
    logger.error({ err, type, id }, 'print-slip.failed')
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Print failed' },
      { status: 500 }
    )
  }
}
