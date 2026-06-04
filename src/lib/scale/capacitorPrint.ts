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
