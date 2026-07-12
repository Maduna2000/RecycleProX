/**
 * Renovo Pro Desktop — Electron Main Process
 *
 * Turns the bundled standalone Next.js server into a real, self-contained
 * local app: resolves a local SQLite database under the OS user-data
 * directory, runs any pending migrations against it on every startup
 * (first install and upgrades both go through the same path), spawns the
 * standalone server as a child process pointed at that database, and only
 * then loads the window — gated on device activation first.
 *
 * KNOWN BLOCKER (as of this file's last edit): `npm run build:desktop`
 * currently fails at its `next build` step. Confirmed by hand: typechecking
 * the app against the SQLite-flavored client (which is what that build step
 * temporarily swaps to the default `@prisma/client` path) surfaces ~10+
 * files' worth of real errors — `mode: 'insensitive'` string filters
 * (SQLite has no equivalent flag), direct enum type imports (UserRole,
 * FloatMovementType, CustomerDocumentType, AuditAction — all converted to
 * plain `string` on the SQLite schema), Json-typed fields, and the
 * photoR2Keys scalar-list codec not being used everywhere it's read. The
 * plan's "same business logic runs on both backends unchanged" assumption
 * does not hold as of today — closing that gap is real, careful,
 * multi-file service-layer work, tracked as a follow-up rather than rushed
 * here. This file is correct target-state code for once that's fixed.
 */
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { execFileSync, spawn } = require('node:child_process')
const licenseManager = require('./licenseManager')

let mainWindow = null
let tray = null
let serverProcess = null
let heartbeatTimer = null

const isDev = !app.isPackaged
const PORT = process.env.PORT || 3100 // distinct from Web's 3000 so both can run side by side during dev
const PORTAL_BASE_URL = process.env.RENOVO_PORTAL_BASE_URL || 'https://portal.renovopro.app'

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

// ─── Local database + standalone server ───────────────────────────────────────

function getDatabasePath() {
  return path.join(app.getPath('userData'), 'renovo.db')
}

// Bundled locations differ between dev (running from the repo) and packaged
// (running from resources/app/, since `asar: false` — see package.json's
// `build.files`) — resolved once at startup rather than assumed, since
// getting this wrong means silently running migrations/the server against
// the wrong files. electron-builder's `files` entries preserve their
// project-relative path under resources/app/ (unlike `extraResources`,
// which supports a `to:` override), so both branches share the same
// relative structure and differ only in their root.
function resolveBundlePaths() {
  const base = isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'app')
  return {
    standaloneServer: path.join(base, '.next', 'standalone', 'server.js'),
    sqliteSchema: path.join(base, 'prisma', 'sqlite', 'schema.prisma'),
    // The CLI's real JS entry point, not the node_modules/.bin/prisma shim —
    // that shim is a .cmd/.ps1 wrapper on Windows (the same class of
    // cross-platform shell fragility that bit prisma/seed.ts's npm script
    // elsewhere in this project's history), and it lives outside
    // node_modules/prisma/ anyway so package.json's `build.files` glob
    // ("node_modules/prisma/**/*") wouldn't bundle it in a packaged build.
    prismaCliEntry: path.join(base, 'node_modules', 'prisma', 'build', 'index.js'),
  }
}

// process.execPath inside an Electron main process is the Electron binary
// itself, not a plain `node` binary — spawning it against an arbitrary
// script without ELECTRON_RUN_AS_NODE=1 makes Electron try to launch that
// path as a *new Electron app* rather than executing it as a Node script.
// This is what lets a packaged app run these child processes without
// bundling a separate Node.js binary just for them.
const RUN_AS_NODE_ENV = { ELECTRON_RUN_AS_NODE: '1' }

function runPendingMigrations(databaseUrl) {
  const { sqliteSchema, prismaCliEntry } = resolveBundlePaths()
  console.log(`[migrate] applying pending migrations to ${databaseUrl}`)
  execFileSync(process.execPath, [
    prismaCliEntry,
    'migrate', 'deploy',
    `--schema=${sqliteSchema}`,
  ], {
    env: { ...process.env, ...RUN_AS_NODE_ENV, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  })
}

function startStandaloneServer(databaseUrl) {
  const { standaloneServer } = resolveBundlePaths()
  console.log(`[server] starting standalone server: ${standaloneServer}`)

  serverProcess = spawn(process.execPath, [standaloneServer], {
    env: {
      ...process.env,
      ...RUN_AS_NODE_ENV,
      DATABASE_URL: databaseUrl,
      // Tells the service layer's query helpers (src/lib/db/queryHelpers.ts,
      // provider.ts) it's running against SQLite, not Postgres — several
      // query shapes (case-insensitive search, Json/array encoding) differ
      // by provider at the value level, not just the type level.
      DATABASE_PROVIDER: 'sqlite',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  })

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

  const dbPath = getDatabasePath()
  const databaseUrl = `file:${dbPath}`
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  try {
    runPendingMigrations(databaseUrl)
  } catch (err) {
    console.error('[migrate] failed:', err)
    // A failed migration on a self-contained local DB is unrecoverable
    // without intervention — surfacing it via a dialog is better than a
    // silent broken app, but building that dialog is left as a follow-up
    // alongside the service-layer SQLite-compatibility work noted above.
  }

  startStandaloneServer(databaseUrl)
  const ready = await waitForServerReady()
  if (!ready) {
    console.error('[server] standalone server did not become ready in time')
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
