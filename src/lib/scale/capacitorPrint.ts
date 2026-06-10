// Capacitor bridge for Bluetooth thermal printing.
// Calls window.Capacitor.Plugins.ThermalPrinter — injected by the Capacitor
// runtime when the web app runs inside the Scale Station Android app.
// When running in a plain browser this module is safe to import but all
// print functions will throw / return empty results.

const STORAGE_KEY = 'scale_thermal_printer_address'

export interface Printer {
  name:    string
  address: string
  type:    'classic' | 'ble'
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
 * @param maxAttempts Maximum number of retry attempts (default: 5)
 * @param initialDelayMs Initial delay between retries in ms (default: 100)
 * @returns Promise<boolean> - true if Capacitor + ThermalPrinter plugin is available
 */
export async function waitForCapacitor(
  maxAttempts: number = 5,
  initialDelayMs: number = 100
): Promise<boolean> {
  // Immediate check - if already available, return instantly
  if (isPrintingAvailable()) return true

  // Not available immediately - might be a browser, or Capacitor not ready yet
  // On tablets, the bridge can take longer to initialize
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delay = initialDelayMs * Math.pow(2, attempt - 1) // 100, 200, 400, 800, 1600ms
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

// ── Printer address persistence (localStorage) ───────────────────────────────

export function getSavedPrinterAddress(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

export function savePrinterAddress(address: string): void {
  try { localStorage.setItem(STORAGE_KEY, address) } catch { /* ignore */ }
}

export function clearSavedPrinterAddress(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

// ── Print ─────────────────────────────────────────────────────────────────────

/**
 * Sends ESC/POS bytes to the saved printer.
 * Throws if not in Capacitor, no printer is configured, or the plugin returns an error.
 */
export async function printBytes(bytes: Uint8Array): Promise<void> {
  const p = plugin()
  if (!p) throw new Error('Thermal printer is only available in the mobile app')

  const address = getSavedPrinterAddress()
  if (!address) throw new Error('No printer configured — tap the printer icon to set one up')

  await p.print({ address, data: Array.from(bytes) })
}
