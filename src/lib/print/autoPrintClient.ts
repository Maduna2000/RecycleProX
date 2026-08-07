'use client'

/**
 * Auto-print-on-payment-completion — shared between the Electron desktop
 * app and a PWA installed from the local-server deployment
 * (scripts/local-server/), since both point at the exact same
 * /api/print/slip and /api/print/cash-drawer routes; Electron's own IPC
 * handlers (electron/main.js) are themselves nothing more than fetch()
 * proxies to these same routes, not a distinct native capability.
 *
 * Deliberately NOT enabled for an arbitrary browser tab (e.g. staff on the
 * hosted Vercel site from an office laptop with no printer attached) —
 * only Electron, or a page served from 127.0.0.1/localhost (the
 * local-server-on-the-till-PC scenario), can be trusted to have real
 * hardware nearby. Anywhere else, printing stays purely opt-in via the
 * manual PrintResultModal.
 */
export function canAutoPrint(): boolean {
  if (typeof window === 'undefined') return false
  if (window.electronAPI?.isElectron) return true
  const host = window.location.hostname
  return host === '127.0.0.1' || host === 'localhost'
}

type PrintSlipPayload =
  | { type: 'purchase' | 'sale'; id: string }
  | { type: 'purchase' | 'sale'; data: Record<string, unknown> }

// openDrawer defaults to true for the original post-transaction print — a
// reprint from history (a past, already-settled record) must pass
// { openDrawer: false } so re-printing a slip doesn't pop the till open.
export async function autoPrintReceipt(payload: PrintSlipPayload, opts?: { openDrawer?: boolean }): Promise<void> {
  const openDrawer = opts?.openDrawer ?? true

  if (window.electronAPI?.isElectron) {
    await window.electronAPI.printSlip(payload)
    if (openDrawer) await window.electronAPI.openCashDrawer()
    return
  }

  const res = await fetch('/api/print/slip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Print failed')
  }
  if (openDrawer) await fetch('/api/print/cash-drawer', { method: 'POST' })
}
