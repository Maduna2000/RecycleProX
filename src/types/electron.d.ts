/**
 * Type declarations for the Electron contextBridge API
 * exposed via electron/preload.js.
 * When running in a browser (Vercel), window.electronAPI is undefined.
 */

interface ElectronAPI {
  isElectron:       boolean
  readScale:        (scaleNum: number) => Promise<{ weight: number; unit: string }>
  // `id` looks up a synced record server-side; `data` prints directly from
  // client-supplied fields with no DB lookup, for a purchase/sale created
  // offline that has no server id yet — see src/app/api/print/slip/route.ts.
  printSlip:        (data: { type: 'purchase' | 'sale'; id: string } | { type: 'purchase' | 'sale'; data: Record<string, unknown> }) => Promise<{ success: boolean }>
  openCashDrawer:   () => Promise<boolean>
  activateDevice:   (activationCode: string) => Promise<unknown>
  getLicenseStatus: () => Promise<LicenseStatus>
  // Auto-updater — see electron/main.js's setupAutoUpdater. Returns an
  // unsubscribe function, matching the addEventListener-style convention.
  onUpdateStatus:   (callback: (status: UpdateStatus) => void) => () => void
  installUpdate:    () => Promise<void>
  // Auto-provisioned desktop.env — see electron/main.js's sendConfigStatus
  // and the heartbeat-loop callback that fires it.
  onConfigStatus:   (callback: (status: ConfigStatus) => void) => () => void
  restartApp:       () => Promise<void>
}

declare global {
  // Mirrors electron/licenseManager.js's getAccessState() return shape.
  // Declared here (not as a plain module-level interface) so it's visible
  // as an ambient global type to consumers like LicenseGate.tsx without an
  // import — this file is a module (due to `export {}` below), so anything
  // meant to be globally ambient must live inside this block.
  interface LicenseStatus {
    state:           'not_activated' | 'blocked' | 'normal' | 'grace_warning' | 'read_only'
    reason?:         string
    daysSinceCheck?: number
    offlineGraceDays?: number
  }

  // Mirrors electron/main.js's sendUpdateStatus() payload shape.
  interface UpdateStatus {
    status:  'available' | 'none' | 'downloading' | 'ready'
    version?: string
    percent?: number
  }

  // Mirrors electron/main.js's sendConfigStatus() payload shape. Only ever
  // 'ready' today (the Portal handed back a changed runtimeConfig) — kept
  // as a status union rather than a bare boolean so it can grow the same
  // way UpdateStatus did without a breaking shape change.
  interface ConfigStatus {
    status: 'ready'
  }

  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
