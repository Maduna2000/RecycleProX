import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getAllSettings } from '@/lib/services/settingsService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { resolvePrinterInterface, resolvePrinterWidth } from '@/lib/print/printerInterface'

// POST /api/settings/test-print
// Sends a small test page to the configured thermal printer.
// Only works on a local install — gracefully fails in cloud/Vercel.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cfg = await runWithRequestTenant(req, () => getAllSettings())

  if (!cfg.printerType || cfg.printerType === 'none') {
    return NextResponse.json({ error: 'No printer configured' }, { status: 400 })
  }

  try {
    const { ThermalPrinter, PrinterTypes, CharacterSet } = await import('node-thermal-printer')

    const iface = resolvePrinterInterface(cfg)

    const printerWidth = resolvePrinterWidth(cfg)
    const printer = new ThermalPrinter({
      type:         PrinterTypes.EPSON,
      interface:    iface,
      characterSet: CharacterSet.PC850_MULTILINGUAL,
      removeSpecialCharacters: false,
      lineCharacter: '-',
      width:        printerWidth,
    })

    const connected = await printer.isPrinterConnected()
    if (!connected) {
      return NextResponse.json({ error: 'Printer not reachable at configured address' }, { status: 503 })
    }

    printer.alignCenter()
    printer.bold(true)
    printer.println('RENOVO PRO')
    printer.bold(false)
    printer.drawLine()
    printer.println('Test Print')
    printer.println(new Date().toLocaleString('en-ZA'))
    printer.println(`Paper width: ${cfg.printerPaperWidth ?? '58mm'} (${printerWidth} chars)`)
    printer.drawLine()
    // A real tableCustom() row, not just plain text — this is the exact
    // layout mechanism the real receipts use (thermal.ts's addLines), and a
    // wrong paper-width setting only ever showed up there, never on this
    // test print's previous all-plain-text content. If this row's columns
    // don't line up on the actual paper, the width setting above is wrong.
    printer.tableCustom([
      { text: 'Item', align: 'LEFT', width: 0.4 },
      { text: 'Qty', align: 'RIGHT', width: 0.3 },
      { text: 'Total', align: 'RIGHT', width: 0.3 },
    ])
    printer.tableCustom([
      { text: 'Sample', align: 'LEFT', width: 0.4 },
      { text: '1.00', align: 'RIGHT', width: 0.3 },
      { text: '10.00', align: 'RIGHT', width: 0.3 },
    ])
    printer.drawLine()
    printer.println('If the row above lines up with')
    printer.println('the headers, width is correct.')
    printer.println('Printer is working correctly.')
    printer.newLine()
    printer.cut()

    await printer.execute()

    logger.info({ iface }, 'Test print sent')
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err }, 'test-print failed')
    return NextResponse.json({ error: 'Print failed — check connection' }, { status: 503 })
  }
}
