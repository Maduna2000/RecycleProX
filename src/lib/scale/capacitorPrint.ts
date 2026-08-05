// Capacitor bridge for Bluetooth thermal printing.
// Calls window.Capacitor.Plugins.ThermalPrinter — injected by the Capacitor
// runtime when the web app runs inside the Scale Station Android app.
// When running in a plain browser this module is safe to import but all
// print functions will throw / return empty results.

import { ConnectionType, PaperWidth, PAPER_WIDTH_COLUMNS } from '@/lib/schemas/printer'
import { usePrinterStore } from '@/stores/printerStore'

export interface Printer {
  name:    string
  address: string
  type:    'classic' | 'ble'
}

/** Device discovered during Bluetooth scan */
export interface DiscoveredDevice {
  name:    string | null
  address: string
  type:    'classic' | 'ble'
  rssi?:   number  // Signal strength (optional)
  paired:  boolean
}

/** Result from Bluetooth scan */
export interface ScanResult {
  devices: DiscoveredDevice[]
  error?:  string
}

/** Result from pairing attempt */
export interface PairResult {
  success: boolean
  error?:  string
}

/** Result from network connection test */
export interface NetworkTestResult {
  success:     boolean
  latencyMs?:  number
  error?:      string
}

/** Result from test print */
export interface TestPrintResult {
  success: boolean
  error?:  string
}

/** Debug info about Capacitor availability - useful for troubleshooting tablets */
export interface CapacitorDiagnostics {
  hasWindow: boolean
  hasCapacitor: boolean
  isNativePlatform: boolean
  hasThermalPrinter: boolean
  userAgent: string
  screenWidth: number
  screenHeight: number
}

/** Get diagnostic info about Capacitor state - useful for debugging tablet issues */
export function getCapacitorDiagnostics(): CapacitorDiagnostics {
  if (typeof window === 'undefined') {
    return {
      hasWindow: false,
      hasCapacitor: false,
      isNativePlatform: false,
      hasThermalPrinter: false,
      userAgent: '',
      screenWidth: 0,
      screenHeight: 0,
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return {
    hasWindow: true,
    hasCapacitor: !!w.Capacitor,
    isNativePlatform: !!w.Capacitor?.isNativePlatform?.(),
    hasThermalPrinter: !!w.Capacitor?.Plugins?.ThermalPrinter,
    userAgent: navigator.userAgent,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plugin(): any | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  if (!w.Capacitor?.isNativePlatform?.()) return null
  return w.Capacitor?.Plugins?.ThermalPrinter ?? null
}

/** True only when running inside the Capacitor Android app with the plugin present. */
export function isPrintingAvailable(): boolean {
  return plugin() !== null
}

/**
 * Wait for Capacitor to be fully initialized with retries.
 * On tablets, the Capacitor bridge may take longer to initialize due to
 * larger screen rendering. This function retries detection with exponential backoff.
 *
 * @param maxAttempts Maximum number of retry attempts (default: 8)
 * @param initialDelayMs Initial delay between retries in ms (default: 200)
 * @returns Promise<boolean> - true if Capacitor + ThermalPrinter plugin is available
 */
export async function waitForCapacitor(
  maxAttempts: number = 8,
  initialDelayMs: number = 200
): Promise<boolean> {
  // Immediate check - if already available, return instantly
  if (isPrintingAvailable()) return true

  // Not available immediately - might be a browser, or Capacitor not ready yet
  // On tablets, the bridge can take longer to initialize (up to 10+ seconds on some devices)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Exponential backoff: 200, 400, 800, 1600, 3200, 6400, 12800, 25600ms (total ~50s)
    const delay = initialDelayMs * Math.pow(2, attempt - 1)
    await new Promise(resolve => setTimeout(resolve, delay))

    if (isPrintingAvailable()) return true
  }

  // After all retries, Capacitor is not available - likely in browser
  return false
}

/** Returns all Bluetooth devices currently paired with the Android device. */
export async function getPairedPrinters(): Promise<Printer[]> {
  const p = plugin()
  if (!p) return []
  try {
    const result = await p.getPairedPrinters() as { printers: Printer[] }
    return result.printers ?? []
  } catch {
    return []
  }
}

// ── Configured printer check ──────────────────────────────────────────────────
// Backed by printerStore.ts (Zustand, persisted) — the same store
// PrinterSetup.tsx's save/test-print flow already writes to. This used to be
// a separate, never-written localStorage key that nothing but this file's
// own printBytes() ever read — PrinterSetup.tsx saving a printer never
// touched it, so an operator who'd successfully configured and test-printed
// still got "printer not configured" the moment they tried a real order.

export function hasSavedPrinter(): boolean {
  return usePrinterStore.getState().getActivePrinter() !== null
}

// ── Print ─────────────────────────────────────────────────────────────────────

/**
 * Sends ESC/POS bytes to the active printer from printerStore.ts.
 * Throws if not in Capacitor, no printer is configured, or the plugin/network call fails.
 */
export async function printBytes(bytes: Uint8Array): Promise<void> {
  const p = plugin()
  if (!p) throw new Error('Thermal printer is only available in the mobile app')

  const printer = usePrinterStore.getState().getActivePrinter()
  if (!printer) throw new Error('No printer configured — tap the printer icon to set one up')

  if (printer.connectionType === 'network') {
    const parts = printer.address.includes(':') ? printer.address.split(':') : [printer.address, '9100']
    const ip = parts[0] ?? printer.address
    const port = parts[1] ?? '9100'
    await printToNetwork(ip, parseInt(port, 10), bytes)
  } else {
    await p.print({ address: printer.address, data: Array.from(bytes) })
  }
}

// ── Bluetooth Scanning ───────────────────────────────────────────────────────

/**
 * Request Bluetooth permissions (Android 12+ requires BLUETOOTH_SCAN).
 * Should be called before startBluetoothScan().
 */
export async function requestBluetoothPermissions(): Promise<{ granted: boolean }> {
  const p = plugin()
  if (!p) return { granted: false }
  try {
    return await p.requestBluetoothPermissions()
  } catch {
    return { granted: false }
  }
}

/**
 * Start scanning for nearby Bluetooth devices.
 * Returns discovered devices after scan completes.
 * Requires Bluetooth permissions to be granted first.
 */
export async function startBluetoothScan(): Promise<ScanResult> {
  const p = plugin()
  if (!p) return { devices: [], error: 'Not running in mobile app' }
  try {
    return await p.startBluetoothScan()
  } catch (e) {
    return { devices: [], error: String(e) }
  }
}

/**
 * Stop an in-progress Bluetooth scan.
 */
export async function stopBluetoothScan(): Promise<void> {
  const p = plugin()
  if (!p) return
  try {
    await p.stopBluetoothScan()
  } catch {
    // Ignore errors when stopping scan
  }
}

/**
 * Initiate pairing with a Bluetooth device.
 * This will show the system pairing dialog.
 */
export async function pairDevice(address: string): Promise<PairResult> {
  const p = plugin()
  if (!p) return { success: false, error: 'Not running in mobile app' }
  try {
    return await p.pairDevice({ address })
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ── Network Printing ─────────────────────────────────────────────────────────

/**
 * Test connection to a network printer.
 * @param ip IP address of the printer
 * @param port Port number (default: 9100)
 */
export async function testNetworkConnection(ip: string, port: number = 9100): Promise<NetworkTestResult> {
  const p = plugin()
  if (!p) return { success: false, error: 'Not running in mobile app' }
  try {
    return await p.testNetworkConnection({ ip, port })
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

/**
 * Send ESC/POS bytes to a network printer.
 * @param ip IP address of the printer
 * @param port Port number (default: 9100)
 * @param bytes ESC/POS byte array
 */
export async function printToNetwork(ip: string, port: number, bytes: Uint8Array): Promise<void> {
  const p = plugin()
  if (!p) throw new Error('Thermal printer is only available in the mobile app')
  await p.printToNetwork({ ip, port, data: Array.from(bytes) })
}

// ── Test Print ───────────────────────────────────────────────────────────────

/**
 * Generate a test print pattern for the given paper width.
 * Returns ESC/POS bytes that can be sent to the printer.
 */
export function generateTestPrint(paperWidth: PaperWidth): Uint8Array {
  const cols = PAPER_WIDTH_COLUMNS[paperWidth] as 32 | 48
  const ESC = 0x1B
  const GS = 0x1D
  const LF = 0x0A

  const lines: number[] = []

  // Initialize printer
  lines.push(ESC, 0x40) // ESC @ - Initialize

  // Center alignment
  lines.push(ESC, 0x61, 0x01) // ESC a 1 - Center

  // Bold + Double height for header
  lines.push(ESC, 0x45, 0x01) // ESC E 1 - Bold on
  lines.push(GS, 0x21, 0x10)  // GS ! 0x10 - Double height

  // Header
  const header = '*** TEST PRINT ***'
  lines.push(...header.split('').map(c => c.charCodeAt(0)), LF)

  // Normal size
  lines.push(GS, 0x21, 0x00)  // GS ! 0 - Normal size
  lines.push(ESC, 0x45, 0x00) // ESC E 0 - Bold off

  // Blank line
  lines.push(LF)

  // Left alignment
  lines.push(ESC, 0x61, 0x00) // ESC a 0 - Left

  // Paper width info
  const widthLine = `Paper Width: ${paperWidth} (${cols} chars)`
  lines.push(...widthLine.split('').map(c => c.charCodeAt(0)), LF)

  // Timestamp
  const now = new Date().toLocaleString()
  const timeLine = `Time: ${now}`
  lines.push(...timeLine.split('').map(c => c.charCodeAt(0)), LF)

  // Blank line
  lines.push(LF)

  // Character width test - full line of dashes
  const dashLine = '-'.repeat(cols)
  lines.push(...dashLine.split('').map(c => c.charCodeAt(0)), LF)

  // Column test - numbered columns
  let colTest = ''
  for (let i = 1; i <= cols; i++) {
    colTest += (i % 10).toString()
  }
  lines.push(...colTest.split('').map(c => c.charCodeAt(0)), LF)

  // Another dash line
  lines.push(...dashLine.split('').map(c => c.charCodeAt(0)), LF)

  // Blank line
  lines.push(LF)

  // Sample receipt line
  const sampleLine = 'Copper Wire'.padEnd(cols - 10) + '12.50 kg'.padStart(10)
  lines.push(...sampleLine.split('').map(c => c.charCodeAt(0)), LF)

  // Total line
  const totalLine = 'TOTAL:'.padEnd(cols - 10) + 'R 125.00'.padStart(10)
  lines.push(ESC, 0x45, 0x01) // Bold on
  lines.push(...totalLine.split('').map(c => c.charCodeAt(0)), LF)
  lines.push(ESC, 0x45, 0x00) // Bold off

  // Blank line
  lines.push(LF)

  // Center - success message
  lines.push(ESC, 0x61, 0x01) // Center
  const success = '[ PRINT OK ]'
  lines.push(...success.split('').map(c => c.charCodeAt(0)), LF)

  // Feed and cut
  lines.push(LF, LF, LF)
  lines.push(GS, 0x56, 0x00) // GS V 0 - Full cut

  return new Uint8Array(lines)
}

/**
 * Send a test print to the specified printer.
 */
export async function sendTestPrint(
  connectionType: ConnectionType,
  address: string,
  paperWidth: PaperWidth,
  port?: number
): Promise<TestPrintResult> {
  const p = plugin()
  if (!p) return { success: false, error: 'Not running in mobile app' }

  try {
    const bytes = generateTestPrint(paperWidth)

    if (connectionType === 'network') {
      // Parse IP:port from address if needed
      const parts = address.includes(':') ? address.split(':') : [address, String(port ?? 9100)]
      const ip = parts[0] ?? address
      const portStr = parts[1] ?? String(port ?? 9100)
      await printToNetwork(ip, parseInt(portStr, 10), bytes)
    } else {
      // Bluetooth (classic or ble)
      await p.print({ address, data: Array.from(bytes) })
    }

    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}
