'use client'

import { useEffect, useRef } from 'react'
import { usePrinterStatusStore } from '@/stores/printerStatusStore'
import { canAutoPrint } from '@/lib/print/autoPrintClient'

const POLL_INTERVAL_MS = 30_000

// Polls the lightweight printer connectivity check so the header status chip
// (and anything else reading usePrinterStatusStore) stays live. Only runs
// where a receipt printer could plausibly be attached — Electron or a
// local-server install (see canAutoPrint) — an office browser tab on the
// hosted site has no printer to check.
export function usePrinterStatus() {
  const setStatus = usePrinterStatusStore((s) => s.setStatus)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!canAutoPrint()) return

    async function check() {
      try {
        const res = await fetch('/api/settings/printer-status', { cache: 'no-store' })
        if (!res.ok) {
          setStatus({ configured: true, connected: false })
          return
        }
        const body = await res.json()
        setStatus({ configured: !!body.configured, connected: !!body.connected })
      } catch {
        setStatus({ configured: true, connected: false })
      }
    }

    check()
    pollRef.current = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [setStatus])
}
