'use client'

import { useEffect } from 'react'
import { useConfigStore } from '@/stores/configStore'

// Electron-only — a hosted browser tab / local-server PWA has no
// desktop.env to refresh, so this is a no-op there (window.electronAPI is
// undefined). The main process pushes a status change whenever the Portal
// hands back a changed runtimeConfig on heartbeat (electron/main.js's
// sendConfigStatus); this just relays it into the store for AppShell's
// restart chip to read — same pattern as useAppUpdate.ts.
export function useDesktopConfigRefresh() {
  const setNeedsRestart = useConfigStore((s) => s.setNeedsRestart)

  useEffect(() => {
    if (!window.electronAPI?.isElectron) return
    const unsubscribe = window.electronAPI.onConfigStatus((s) => {
      if (s.status === 'ready') setNeedsRestart(true)
    })
    return unsubscribe
  }, [setNeedsRestart])
}
