'use client'

import { useEffect } from 'react'
import { useUpdateStore } from '@/stores/updateStore'

// Electron-only — a hosted browser tab / local-server PWA has no packaged
// app to update, so this is a no-op there (window.electronAPI is undefined).
// The main process pushes status changes via IPC (electron/main.js's
// setupAutoUpdater); this just relays them into the store for AppShell's
// update chip to read.
export function useAppUpdate() {
  const setStatus = useUpdateStore((s) => s.setStatus)

  useEffect(() => {
    if (!window.electronAPI?.isElectron) return
    const unsubscribe = window.electronAPI.onUpdateStatus((s) => {
      setStatus({
        status: s.status === 'none' ? 'idle' : s.status,
        version: s.version,
        percent: s.percent,
      })
    })
    return unsubscribe
  }, [setStatus])
}
