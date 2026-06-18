/**
 * Type declarations for the Electron contextBridge API
 * exposed via electron/preload.js.
 * When running in a browser (Vercel), window.electronAPI is undefined.
 */

interface ElectronAPI {
  isElectron:     boolean
  minimize:       () => void
  maximize:       () => void
  close:          () => void
  readScale:      (scaleNum: number) => Promise<{ weight: number; unit: string }>
  printSlip:      (data: { type: 'purchase' | 'sale'; id: string }) => Promise<{ success: boolean }>
  openCashDrawer: () => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
