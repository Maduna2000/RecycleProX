/**
 * Renovo Pro Desktop — Electron Preload
 * Exposes safe IPC APIs to the renderer (Next.js) via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Thermal printer
  printSlip:     (data)     => ipcRenderer.invoke('print-slip', data),
  openCashDrawer:()         => ipcRenderer.invoke('open-cash-drawer'),

  // Licensing (electron/licenseManager.js)
  activateDevice: (activationCode) => ipcRenderer.invoke('license-activate', activationCode),
  getLicenseStatus: ()             => ipcRenderer.invoke('license-status'),
  recheckLicense: ()               => ipcRenderer.invoke('license-recheck'),
  getLicenseInfo: ()               => ipcRenderer.invoke('license-info'),

  // Auto-updater — main process pushes status changes (checking / available /
  // downloading / ready / none), renderer never polls for this itself.
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('update-status', listener)
    return () => ipcRenderer.removeListener('update-status', listener)
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Auto-provisioned desktop.env — main process pushes a status change
  // whenever the Portal hands back a changed runtimeConfig on heartbeat
  // (electron/main.js's sendConfigStatus); restartApp() applies it, same
  // "never forced mid-shift" pattern as the app-update chip above.
  onConfigStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('config-status', listener)
    return () => ipcRenderer.removeListener('config-status', listener)
  },
  restartApp: () => ipcRenderer.invoke('restart-app'),

  // Detect if running inside Electron
  isElectron: true,
})
