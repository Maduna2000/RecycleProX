/**
 * RecycleProX Basic — Electron Main Process
 * Wraps the Next.js app as a real Windows desktop application.
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron')
const path = require('path')

let mainWindow = null
let tray = null

const isDev  = !app.isPackaged
const PORT   = process.env.PORT || 3000
const APP_URL = isDev ? `http://localhost:${PORT}/app/dashboard` : `http://localhost:${PORT}/app/dashboard`

// ─── Prevent multiple instances ───────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// ─── Create main window ───────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1280,
    height:          800,
    minWidth:        1024,
    minHeight:       600,
    frame:           false,        // custom title bar
    titleBarStyle:   'hidden',
    backgroundColor: '#1B3A6B',   // navy — prevents white flash on load
    show:            false,        // show after ready-to-show
    webPreferences: {
      preload:            path.join(__dirname, 'preload.js'),
      contextIsolation:   true,
      nodeIntegration:    false,
      sandbox:            false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  })

  mainWindow.loadURL(APP_URL)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── System tray ──────────────────────────────────────────────────────────────

function createTray() {
  try {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png')
    const icon     = nativeImage.createFromPath(iconPath)
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
    tray.setToolTip('RecycleProX Basic')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open',  click: () => mainWindow?.show() },
      { label: 'Lock',  click: () => mainWindow?.webContents.executeJavaScript("window.__rpxLock?.()") },
      { type: 'separator' },
      { label: 'Quit',  click: () => app.quit() },
    ]))
    tray.on('double-click', () => mainWindow?.show())
  } catch (_) {
    // Tray icon missing — non-fatal
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Window controls (custom title bar) ─────────────────────────────────

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())

// ─── IPC: Scale reading ───────────────────────────────────────────────────────

ipcMain.handle('read-scale', async (_event, scaleNum) => {
  try {
    // Delegate to the Next.js API route running locally
    const res = await fetch(`http://localhost:${PORT}/api/scale/read?scale=${scaleNum}`)
    if (!res.ok) throw new Error(`Scale API returned ${res.status}`)
    return await res.json()
  } catch (err) {
    throw new Error(`Scale read failed: ${err.message}`)
  }
})

// ─── IPC: Thermal print ───────────────────────────────────────────────────────

ipcMain.handle('print-slip', async (_event, data) => {
  try {
    const res = await fetch(`http://localhost:${PORT}/api/print/slip`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`Print API returned ${res.status}`)
    return await res.json()
  } catch (err) {
    throw new Error(`Print failed: ${err.message}`)
  }
})

ipcMain.handle('open-cash-drawer', async () => {
  try {
    const res = await fetch(`http://localhost:${PORT}/api/print/cash-drawer`, { method: 'POST' })
    return res.ok
  } catch (_) {
    return false
  }
})
