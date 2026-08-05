/**
 * Renovo Pro Desktop — Electron Main Process
 *
 * Spawns the bundled standalone Next.js server as a child process pointed
 * at the SAME shared production Postgres database the web app uses (via
 * desktop.env under userData — see loadDesktopEnv below), then loads the
 * window — gated on device activation first. Short internet outages are
 * absorbed by the renderer's own offline queue (src/lib/offline/), not by
 * this process — there is no local database here.
 */
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const licenseManager = require('./licenseManager')

let mainWindow = null
let tray = null
let serverProcess = null
let heartbeatTimer = null

const isDev = !app.isPackaged
const PORT = process.env.PORT || 3100 // distinct from Web's 3000 so both can run side by side during dev

// ─── Diagnostics ────────────────────────────────────────────────────────────
//
// A packaged Windows app built with the default `win` subsystem has no
// attached console — `stdio: 'inherit'` on the spawned server and every
// `console.*` call in this file go to a console that doesn't exist, so
// whatever actually causes a failure (Prisma engine mismatch, unreachable
// DB, a bad desktop.env value, ...) was being logged correctly and then
// silently discarded. Everything below routes that same output to a real
// file instead, so a support request can be answered from evidence instead
// of "it says error 500".
const LOG_DIR = path.join(app.getPath('userData'), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'main.log')

function logToFile(line) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    // Disk full / permissions issue — nothing more we can do about logging
    // the fact that logging itself failed.
  }
}

function formatForLog(args) {
  return args.map((a) => (a instanceof Error ? (a.stack || a.message) : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
}

for (const level of ['log', 'warn', 'error']) {
  const original = console[level].bind(console)
  console[level] = (...args) => {
    original(...args)
    logToFile(`[${level}] ${formatForLog(args)}`)
  }
}

process.on('uncaughtException', (err) => {
  logToFile(`[uncaughtException] ${err.stack || err.message}`)
  dialog.showErrorBox('Renovo Pro — Unexpected Error', `${err.message}\n\nDetails were written to:\n${LOG_FILE}`)
})

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? (reason.stack || reason.message) : String(reason)
  logToFile(`[unhandledRejection] ${message}`)
})

// portal.renovopro.app is a placeholder domain that was never actually
// purchased/pointed anywhere (see project notes) — the Portal's real home
// is its Vercel deployment. Using that as the fallback so a freshly
// installed app (no desktop.env yet — that's only loaded post-activation,
// see loadDesktopEnv below) can still reach the activation endpoint.
const PORTAL_BASE_URL = process.env.RENOVO_PORTAL_BASE_URL || 'https://renovo-pro-portal.vercel.app'

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

// ─── Production config + standalone server ─────────────────────────────────

// Desktop deployments talk to the SAME shared production Postgres database
// used by the web app — never an isolated local copy (Prisma's query engine
// is provider-locked at generate time, so this process can't hot-swap
// between Postgres and SQLite; there is no "offline database", only an
// offline queue in the renderer — see src/lib/offline/). Credentials live in
// a user-editable env file under userData, mirroring the exact pattern
// already proven in scripts/local-server/local-server.env — never bundled
// into the installer, never committed, filled in once per install from the
// same Vercel "Sensitive" values.
function getDesktopEnvPath() {
  return path.join(app.getPath('userData'), 'desktop.env')
}

// Minimal KEY=VALUE parser — deliberately not a dependency on the `dotenv`
// package (only present today as an undeclared transitive/hoisted module,
// not a real package.json dependency); this mirrors local-server/launcher.ps1's
// own manual line-by-line parsing rather than risking that hoisting disappearing.
function parseEnvFile(filePath) {
  const result = {}
  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (key) result[key] = value
  }
  return result
}

class DesktopConfigMissingError extends Error {
  constructor(filePath) {
    super(`Desktop config not found at ${filePath}`)
    this.name = 'DesktopConfigMissingError'
    this.filePath = filePath
  }
}

const REQUIRED_DESKTOP_ENV_KEYS = [
  'DATABASE_URL', 'APP_RUNTIME_DATABASE_URL', 'AUTH_SECRET',
  'RENOVO_PORTAL_BASE_URL', 'INTERNAL_API_SHARED_SECRET',
]

function loadDesktopEnv() {
  const filePath = getDesktopEnvPath()
  if (!fs.existsSync(filePath)) throw new DesktopConfigMissingError(filePath)
  const parsed = parseEnvFile(filePath)
  const missing = REQUIRED_DESKTOP_ENV_KEYS.filter((k) => !parsed[k])
  if (missing.length > 0) {
    throw new Error(`Desktop config at ${filePath} is missing: ${missing.join(', ')}`)
  }
  return parsed
}

// Bundled locations differ between dev (running from the repo) and packaged
// (running from resources/app/, since `asar: false` — see package.json's
// `build.files`) — resolved once at startup rather than assumed.
function resolveBundlePaths() {
  const base = isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'app')
  return {
    standaloneServer: path.join(base, '.next', 'standalone', 'server.js'),
  }
}

// process.execPath inside an Electron main process is the Electron binary
// itself, not a plain `node` binary — spawning it against an arbitrary
// script without ELECTRON_RUN_AS_NODE=1 makes Electron try to launch that
// path as a *new Electron app* rather than executing it as a Node script.
// This is what lets a packaged app run these child processes without
// bundling a separate Node.js binary just for them.
const RUN_AS_NODE_ENV = { ELECTRON_RUN_AS_NODE: '1' }

function startStandaloneServer(desktopEnv) {
  const { standaloneServer } = resolveBundlePaths()
  console.log(`[server] starting standalone server: ${standaloneServer}`)

  serverProcess = spawn(process.execPath, [standaloneServer], {
    env: {
      ...process.env,
      ...RUN_AS_NODE_ENV,
      ...desktopEnv,
      // DATABASE_PROVIDER must stay unset — this build's Prisma client is
      // the standard Postgres one (plain `next build`, no client-swapping),
      // matching scripts/local-server/assemble.ts exactly.
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    },
    // 'inherit' would previously pipe this straight into a console window
    // that doesn't exist in a packaged GUI app (see LOG_FILE above) —
    // including every pino log line the Next.js server writes, e.g. the
    // `logger.error({ err }, 'authorize() failed')` call in src/auth.ts.
    // Piping it into the same log file is the only way that ever reaches
    // disk on an installed copy of the app.
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  serverProcess.stdout.on('data', (chunk) => logToFile(`[server:stdout] ${chunk.toString().trimEnd()}`))
  serverProcess.stderr.on('data', (chunk) => logToFile(`[server:stderr] ${chunk.toString().trimEnd()}`))

  serverProcess.on('exit', (code) => {
    console.error(`[server] standalone server exited unexpectedly (code ${code})`)
    serverProcess = null
  })
}

async function waitForServerReady(maxAttempts = 60) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/login`)
      if (res.ok || res.status === 200 || res.status === 307) return true
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

// ─── Windows ────────────────────────────────────────────────────────────────

function createActivationWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1B3A6B',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow.loadFile(path.join(__dirname, 'activation.html'))
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1B3A6B',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  })

  mainWindow.loadURL(`http://127.0.0.1:${PORT}/app/dashboard`)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.on('closed', () => { mainWindow = null })

  // Renderer has no native title bar to reflect maximize state (frame:
  // false, custom title bar — see WindowControls.tsx), so it needs to be
  // told explicitly whenever the OS-level state changes, including via
  // means the renderer's own button never triggered (double-click on the
  // Windows taskbar icon, Aero Snap, etc.).
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window-state-changed', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-state-changed', false))
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png')
    const icon = nativeImage.createFromPath(iconPath)
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
    tray.setToolTip('Renovo Pro')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: () => mainWindow?.show() },
      { type: 'separator' },
      // Lets a user hand over real diagnostics for a support request
      // instead of just "it says error 500" — see LOG_FILE above.
      { label: 'View Logs', click: () => shell.openPath(LOG_DIR) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]))
    tray.on('double-click', () => mainWindow?.show())
  } catch {
    // Tray icon missing — non-fatal
  }
}

// ─── Startup sequence ───────────────────────────────────────────────────────

async function startApp() {
  if (!licenseManager.isActivated()) {
    createActivationWindow()
    return
  }

  let desktopEnv
  try {
    desktopEnv = loadDesktopEnv()
  } catch (err) {
    console.error('[config] failed to load desktop.env:', err)
    dialog.showErrorBox(
      'Renovo Pro — Setup Required',
      `Configuration file not found or incomplete:\n${getDesktopEnvPath()}\n\n` +
      'Copy electron/desktop.env.example to this location and fill in the ' +
      'production connection details before starting the app. See ' +
      'scripts/local-server/README.md for where to find each value.'
    )
    app.quit()
    return
  }

  startStandaloneServer(desktopEnv)
  let ready = await waitForServerReady()
  // A cold first run (disk cache empty, Prisma engine loading) can
  // legitimately take longer than the initial 30s wait. Proceeding
  // straight to createMainWindow() here used to load a URL nothing was
  // listening on yet, showing Chromium's generic "site can't be reached"
  // page with no indication of what actually went wrong or what to do
  // about it — this offers a real choice instead of a dead end.
  while (!ready) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Renovo Pro — Still Starting',
      message: 'The local server is taking longer than expected to start.',
      detail: 'This can happen on a slow first run. Choose Retry to keep waiting, or Quit to close the app.',
      buttons: ['Retry', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response !== 0) {
      app.quit()
      return
    }
    ready = await waitForServerReady()
  }

  createMainWindow()
  createTray()

  heartbeatTimer = licenseManager.startHeartbeatLoop(PORTAL_BASE_URL, app.getVersion(), (err, result) => {
    if (err) console.warn('[license] heartbeat failed (offline?):', err.message)
    else if (!result.allowed) console.warn('[license] heartbeat reports access no longer allowed:', result.reason)
  })
}

app.whenReady().then(() => {
  startApp()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) startApp()
  })
})

app.on('window-all-closed', () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  if (serverProcess) serverProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Window controls (custom title bar) ─────────────────────────────────

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())

// ─── IPC: Licensing ───────────────────────────────────────────────────────────

ipcMain.handle('license-activate', async (_event, activationCode) => {
  const result = await licenseManager.activate(activationCode, PORTAL_BASE_URL, app.getVersion())
  // Successful activation transitions straight into the real startup
  // sequence rather than requiring a manual app restart.
  mainWindow?.close()
  await startApp()
  return result
})

ipcMain.handle('license-status', () => licenseManager.getAccessState())

// ─── IPC: Scale reading ───────────────────────────────────────────────────────

ipcMain.handle('read-scale', async (_event, scaleNum) => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/scale/read?scale=${scaleNum}`)
    if (!res.ok) throw new Error(`Scale API returned ${res.status}`)
    return await res.json()
  } catch (err) {
    throw new Error(`Scale read failed: ${err.message}`)
  }
})

// ─── IPC: Thermal print ───────────────────────────────────────────────────────

ipcMain.handle('print-slip', async (_event, data) => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/print/slip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`Print API returned ${res.status}`)
    return await res.json()
  } catch (err) {
    throw new Error(`Print failed: ${err.message}`)
  }
})

ipcMain.handle('open-cash-drawer', async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/print/cash-drawer`, { method: 'POST' })
    return res.ok
  } catch {
    return false
  }
})
