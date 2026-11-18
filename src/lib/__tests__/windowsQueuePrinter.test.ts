import { describe, it, expect } from 'vitest'
import { WindowsQueuePrinterInterface } from '@/lib/print/windowsQueuePrinter'

// Exercises the real Node <-> PowerShell helper protocol. Uses a printer name
// that cannot exist, so nothing is ever sent to hardware. Windows only.
const onWindows = process.platform === 'win32'

describe.skipIf(!onWindows)('WindowsQueuePrinterInterface (long-lived helper)', () => {
  const bogus = new WindowsQueuePrinterInterface('Renovo Test Printer That Does Not Exist')

  it('reports a missing printer as not connected', async () => {
    expect(await bogus.isPrinterConnected()).toBe(false)
  }, 90_000)

  it('rejects a print to a missing printer with the printer error, not a fallback', async () => {
    await expect(bogus.execute(Buffer.from('test'))).rejects.toThrow(/OpenPrinter failed/)
  }, 30_000)

  it('answers repeat checks quickly once the helper is warm', async () => {
    await bogus.isPrinterConnected() // ensure warm
    const t0 = Date.now()
    for (let i = 0; i < 5; i++) await bogus.isPrinterConnected()
    expect(Date.now() - t0).toBeLessThan(2_000)
  }, 90_000)

  it('refuses an empty printer name without touching the helper', async () => {
    const none = new WindowsQueuePrinterInterface('')
    expect(await none.isPrinterConnected()).toBe(false)
    await expect(none.execute(Buffer.from('x'))).rejects.toThrow(/No Windows printer queue/)
  })
})
