import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getAllSettings } from '@/lib/services/settingsService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// GET /api/settings/printer-status
// Lightweight connectivity check for the configured thermal printer — opens
// the socket/port and asks node-thermal-printer whether it's alive, same as
// /api/settings/test-print, but without sending a test slip. Any signed-in
// user can poll this (not admin-only like test-print) since it just backs a
// header status chip visible to every till operator, not a config action.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cfg = await runWithRequestTenant(req, () => getAllSettings())

  if (!cfg.printerType || cfg.printerType === 'none') {
    return NextResponse.json({ configured: false, connected: false })
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
    return NextResponse.json({ configured: true, connected })
  } catch (err) {
    // serialport/node-thermal-printer unavailable (cloud/Vercel build) or a
    // genuine connection failure — either way, report "not connected" rather
    // than surfacing a 500 to a chip that polls every 30s.
    logger.info({ err }, 'printer-status check failed')
    return NextResponse.json({ configured: true, connected: false })
  }
}
