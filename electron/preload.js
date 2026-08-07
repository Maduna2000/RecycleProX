/**
 * Renovo Pro Desktop — Electron Preload
 * Exposes safe IPC APIs to the renderer (Next.js) via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Scale hardware
  readScale:     (scaleNum) => ipcRenderer.invoke('read-scale', scaleNum),

  // Thermal printer
  printSlip:     (data)     => ipcRenderer.invoke('print-slip', data),
  openCashDrawer:()         => ipcRenderer.invoke('open-cash-drawer'),

  // Licensing (electron/licenseManager.js)
  activateDevice: (activationCode) => ipcRenderer.invoke('license-activate', activationCode),
  getLicenseStatus: ()             => ipcRenderer.invoke('license-status'),

  // Auto-updater — main process pushes status changes (checking / available /
  // downloading / ready / none), renderer never polls for this itself.
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('update-status', listener)
    return () => ipcRenderer.removeListener('update-status', listener)
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Detect if running inside Electron
  isElectron: true,
})
