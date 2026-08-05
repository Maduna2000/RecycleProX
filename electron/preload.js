/**
 * Renovo Pro Desktop — Electron Preload
 * Exposes safe IPC APIs to the renderer (Next.js) via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls (custom title bar)
  minimize:      () => ipcRenderer.send('window-minimize'),
  maximize:      () => ipcRenderer.send('window-maximize'),
  close:         () => ipcRenderer.send('window-close'),
  // main.js forwards native 'maximize'/'unmaximize' window events here so
  // the custom title bar's button can reflect state changes it didn't
  // itself trigger (Aero Snap, taskbar double-click, etc.). Returns an
  // unsubscribe function.
  onWindowStateChange: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized)
    ipcRenderer.on('window-state-changed', listener)
    return () => ipcRenderer.removeListener('window-state-changed', listener)
  },

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
