import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'

// POST /api/settings/test-print
// Sends a small test page to the configured thermal printer.
// Only works on a local install — gracefully fails in cloud/Vercel.
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Read printer settings
  const rows = await prisma.systemSettings.findMany({
    where: { key: { in: ['printerType', 'printerSerialPort', 'printerBaudRate', 'printerIp', 'printerTcpPort'] } },
  })
  const cfg: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  if (!cfg.printerType || cfg.printerType === 'none') {
    return NextResponse.json({ error: 'No printer configured' }, { status: 400 })
  }

  try {
    const { ThermalPrinter, PrinterTypes, CharacterSet } = await import('node-thermal-printer')

    const iface = cfg.printerType === 'tcp'
      ? `tcp://${cfg.printerIp ?? '127.0.0.1'}:${cfg.printerTcpPort ?? '9100'}`
      : cfg.printerSerialPort ?? 'COM1'

    const printer = new ThermalPrinter({
      type:         PrinterTypes.EPSON,
      interface:    iface,
      characterSet: CharacterSet.PC850_MULTILINGUAL,
      removeSpecialCharacters: false,
      lineCharacter: '-',
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
    printer.drawLine()
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
