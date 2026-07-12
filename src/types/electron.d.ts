/**
 * Type declarations for the Electron contextBridge API
 * exposed via electron/preload.js.
 * When running in a browser (Vercel), window.electronAPI is undefined.
 */

interface ElectronAPI {
  isElectron:       boolean
  minimize:         () => void
  maximize:         () => void
  close:            () => void
  readScale:        (scaleNum: number) => Promise<{ weight: number; unit: string }>
  printSlip:        (data: { type: 'purchase' | 'sale'; id: string }) => Promise<{ success: boolean }>
  openCashDrawer:   () => Promise<boolean>
  activateDevice:   (activationCode: string) => Promise<unknown>
  getLicenseStatus: () => Promise<LicenseStatus>
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

  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
