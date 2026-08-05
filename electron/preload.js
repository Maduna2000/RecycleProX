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

  // Detect if running inside Electron
  isElectron: true,
})
