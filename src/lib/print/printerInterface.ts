/**
 * Real RS232/USB-serial transport for node-thermal-printer.
 *
 * node-thermal-printer's own `getInterface()` (lib/interfaces/index.js) only
 * recognises two interface-string shapes — `tcp://host:port` and
 * `printer:name` (an OS print-queue name) — everything else, including a
 * bare COM-port string like "COM3", falls through to its **File** interface,
 * which just writes the raw ESC/POS buffer to a filesystem path via a
 * generic file-write queue. On Windows that means a "serial" printer
 * silently never opens a real serial connection at all: no baud rate, no
 * flow control, `isPrinterConnected()` reduces to `fs.existsSync('COM3')`
 * (which doesn't reflect real device presence for a COM port) — the print
 * job either does nothing or corrupts on the wire. Confirmed by reading
 * node-thermal-printer 4.6.0's source directly, not assumed.
 *
 * node-thermal-printer accepts any object satisfying { isPrinterConnected,
 * execute } as `interface:` (its dispatcher special-cases `typeof === 'object'`
 * to skip the string regex entirely), so this class is a real serialport-based
 * transport, following the exact same open/write/close pattern already proven
 * in production for platform-scale serial reads (see scaleService.ts).
 *
 * Server-side only — dynamically imports `serialport` so this module has no
 * load-time cost/failure in environments where it's unavailable (cloud/Vercel).
 */

const OPEN_TIMEOUT_MS  = 5_000
const WRITE_TIMEOUT_MS = 8_000
export const DEFAULT_PRINTER_BAUD_RATE = 9600

export class SerialPrinterInterface {
  constructor(private readonly path: string, private readonly baudRate: number = DEFAULT_PRINTER_BAUD_RATE) {}

  toJSON() {
    return { transport: 'serial', path: this.path, baudRate: this.baudRate }
  }

  async isPrinterConnected(): Promise<boolean> {
    const { SerialPort } = await import('serialport')
    return new Promise((resolve) => {
      const port = new SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false })
      let settled = false
      // Always attempt a close on the way out, even if `open()` hasn't
      // called back yet (isOpen still false) — confirmed empirically that
      // closing a still-opening port is safe (it just errors "Port is not
      // open", swallowed here) and that a slow/hung open (e.g. a stale
      // Bluetooth virtual COM port) can otherwise keep the native handle
      // alive well past our own timeout, with nothing left to close it.
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        port.close(() => resolve(ok))
      }
      const timer = setTimeout(() => finish(false), OPEN_TIMEOUT_MS)
      port.open((err) => finish(!err))
    })
  }

  async execute(buffer: Buffer): Promise<void> {
    const { SerialPort } = await import('serialport')
    return new Promise((resolve, reject) => {
      const port = new SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false })
      let settled = false
      const finish = (err?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        port.close(() => { if (err) reject(err); else resolve() })
      }
      const timer = setTimeout(() => finish(new Error('Serial printer write timed out — check the cable and port')), WRITE_TIMEOUT_MS)

      port.on('error', (e) => finish(e))
      port.open((openErr) => {
        if (openErr) return finish(openErr)
        port.write(buffer, (writeErr) => {
          if (writeErr) return finish(writeErr)
          port.drain((drainErr) => finish(drainErr ?? undefined))
        })
      })
    })
  }
}

export interface PrinterSettingsLike {
  printerType?:       string
  printerIp?:         string
  printerTcpPort?:    string
  printerSerialPort?: string
  printerBaudRate?:   string
}

/**
 * Resolves saved settings into what `new ThermalPrinter({ interface })`
 * actually needs: a `tcp://host:port` string for TCP (node-thermal-printer's
 * own regex handles that correctly), or a real SerialPrinterInterface object
 * for serial — every call site building a printer connection must go through
 * this, not hand-roll the bare-COM-string form (see class comment above for
 * why that silently does the wrong thing).
 *
 * Return type is declared `string` to match node-thermal-printer's own (stale)
 * .d.ts, which only types `interface` as a string — its actual runtime
 * dispatcher happily accepts any { isPrinterConnected, execute } object and
 * passes it through unchanged (verified against the real source, see above),
 * so this is a deliberate, documented, single-point cast rather than one
 * scattered across every call site.
 */
export function resolvePrinterInterface(cfg: PrinterSettingsLike): string {
  if (cfg.printerType === 'tcp') {
    return `tcp://${cfg.printerIp ?? '127.0.0.1'}:${cfg.printerTcpPort ?? '9100'}`
  }
  const path = cfg.printerSerialPort ?? 'COM1'
  const baudRate = cfg.printerBaudRate ? parseInt(cfg.printerBaudRate, 10) : DEFAULT_PRINTER_BAUD_RATE
  const iface = new SerialPrinterInterface(path, Number.isFinite(baudRate) ? baudRate : DEFAULT_PRINTER_BAUD_RATE)
  return iface as unknown as string
}
