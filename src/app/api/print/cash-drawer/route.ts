import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAllSettings } from '@/lib/services/settingsService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

/**
 * POST /api/print/cash-drawer
 * Opens the cash drawer connected to the thermal printer.
 * Uses ESC/POS drawer kick command.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const cfg = await runWithRequestTenant(req, () => getAllSettings())
  if (!cfg.printerType || cfg.printerType === 'none') {
    return NextResponse.json({ error: 'No printer configured' }, { status: 400 })
  }

  try {
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

    // ESC/POS cash drawer kick command
    // Pin 2 (cash drawer 1): ESC p 0 25 250
    // This sends a pulse to pin 2 for 25*2ms on, 250*2ms off
    printer.openCashDrawer()
    await printer.execute()

    logger.info({ iface }, 'cash-drawer.opened')
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err }, 'cash-drawer.failed')
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cash drawer failed' },
      { status: 500 }
    )
  }
}
