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
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { autoUpdater } = require('electron-updater')
const licenseManager = require('./licenseManager')

let mainWindow = null
let splashWindow = null
let tray = null
let serverProcess = null
let heartbeatTimer = null
// Set the moment the spawned server process exits, for any reason, so the
// startup wait loop below can tell "still starting" (no signal yet) apart
// from "already dead" (this set) instead of treating both identically —
// see waitForServerReady()'s own comment for what that confusion used to
// look like to a user.
let serverExitInfo = null
// The desktop.env values the currently-running standalone server was
// actually started with — compared against each heartbeat's runtimeConfig
// to decide whether a rewritten desktop.env needs a restart chip at all, or
// is just an identical reply. Never null once the server has started once.
let activeDesktopEnv = null

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
  licenseManager.reportFatalError(PORTAL_BASE_URL, app.getVersion(), 'uncaughtException', err.message)
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
    let value = trimmed.slice(eq + 1).trim()
    // Strip one layer of surrounding quotes — a value copied straight out of
    // Vercel's env-var UI (e.g. DATABASE_URL) comes wrapped in "..." and,
    // unlike a real dotenv parser, this minimal one otherwise passes that
    // literal quote character through, which breaks Prisma's datasource URL
    // validation (it checks the string starts with "postgresql://", not '"').
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
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

/**
 * Writes desktop.env from a runtimeConfig object the Portal hands back on
 * activation/heartbeat — the auto-provisioning path that replaces a human
 * copy-pasting production database credentials out of Vercel's dashboard
 * (see electron/README.md's "First-run setup on the target PC" section).
 * No quoting: parseEnvFile() above only ever strips a layer of
 * quotes it finds, it never requires one, so plain KEY=VALUE lines round-trip
 * cleanly as long as no value itself contains a newline — true for every
 * connection string / secret this ever carries.
 */
function writeDesktopEnv(runtimeConfig) {
  const filePath = getDesktopEnvPath()
  const lines = [
    '# Auto-generated by Renovo Pro on device activation — do not commit.',
    '# See electron/desktop.env.example for what each key means.',
    ...Object.entries(runtimeConfig)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${value}`),
  ]
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, lines.join('\n') + '\n', { mode: 0o600 })
  return parseEnvFile(filePath)
}

/** True if every REQUIRED_DESKTOP_ENV_KEYS value in `a` matches `b` — used
 * to decide whether a freshly delivered runtimeConfig actually changed
 * anything worth prompting a restart for, vs. an identical heartbeat reply. */
function desktopEnvUnchanged(a, b) {
  if (!a || !b) return false
  return REQUIRED_DESKTOP_ENV_KEYS.every((k) => a[k] === b[k])
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

/**
 * Resolves true only if 127.0.0.1:PORT is free to bind — false for anything
 * else (already bound, permission denied, ...). Checked once before every
 * spawn: a zombie server process left over from a previous crash or an
 * unclean shutdown binds this exact port just as effectively as a brand new
 * one, and without this check that produces the same silent "never comes
 * up" symptom as a slow first boot (see waitForServerReady()).
 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
    tester.once('error', () => resolve(false))
    tester.once('listening', () => tester.close(() => resolve(true)))
    tester.listen(port, '127.0.0.1')
  })
}

function startStandaloneServer(desktopEnv) {
  const { standaloneServer } = resolveBundlePaths()
  console.log(`[server] starting standalone server: ${standaloneServer}`)
  serverExitInfo = null

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

  serverProcess.on('exit', (code, signal) => {
    console.error(`[server] standalone server exited unexpectedly (code ${code}, signal ${signal})`)
    serverExitInfo = { code, signal }
    serverProcess = null
  })
}

/**
 * Polls until the server responds or gives up — but "gives up" now has two
 * distinct outcomes instead of one: 'timeout' (nothing came up in time —
 * possibly just a slow first boot) and 'crashed' (the process already
 * exited, so continuing to poll would never succeed no matter how long we
 * waited). startApp() shows a different, specific dialog for each instead
 * of the single "Still Starting" prompt that used to cover both.
 */
async function waitForServerReady(maxAttempts = 60) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (serverExitInfo) return { ready: false, reason: 'crashed' }
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/login`)
      if (res.ok || res.status === 200 || res.status === 307) return { ready: true }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return { ready: false, reason: serverExitInfo ? 'crashed' : 'timeout' }
}

// ─── Windows ────────────────────────────────────────────────────────────────

const APP_ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.png')

function createActivationWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    backgroundColor: '#1B3A6B',
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow.loadFile(path.join(__dirname, 'activation.html'))
}

// Shown the instant startApp() begins waiting on the local server, and
// closed the moment either the real window is ready or a startup error
// dialog needs to be shown. Without this, a slow first boot (cold Prisma
// engine load, empty disk cache) leaves the user staring at nothing at all
// for up to 30 seconds — no window, no taskbar entry — which reads exactly
// like the install silently failed.
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 220,
    resizable: false,
    frame: false,
    backgroundColor: '#1B3A6B',
    icon: APP_ICON_PATH,
    skipTaskbar: false,
    webPreferences: { sandbox: true },
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
  splashWindow = null
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
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

// ─── Report / document downloads ────────────────────────────────────────────
//
// Reports (DownloadButtons.tsx) fetch the PDF/Excel bytes, build a blob: URL,
// and click a hidden <a download> — Electron intercepts that exactly like a
// server-initiated download, firing 'will-download' on the session. Left
// unhandled, Electron silently saves to the OS default Downloads folder with
// no prompt and no way to pick a location. Showing a native Save dialog here
// instead — same one a real desktop app would use — lets the user choose
// where a report/statement actually goes, while still defaulting to the
// Downloads folder with the report's suggested filename if they don't
// navigate elsewhere.
function setupDownloadHandler() {
  session.defaultSession.on('will-download', (event, item) => {
    const suggested = item.getFilename()
    const savePath = dialog.showSaveDialogSync(mainWindow, {
      title: 'Save Report',
      defaultPath: path.join(app.getPath('downloads'), suggested),
    })
    if (!savePath) {
      item.cancel()
      return
    }
    item.setSavePath(savePath)
    item.once('done', (_event, state) => {
      if (state === 'completed') {
        console.log(`[download] saved ${savePath}`)
      } else {
        console.warn(`[download] did not complete (${state}): ${savePath}`)
      }
    })
  })
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────
//
// Checks the feed baked into resources/app-update.yml at build time (see
// package.json's build.publish — a "generic" provider pointed at this app's
// own /api/desktop/update-feed route, which serves files uploaded to R2 by
// .github/workflows/build-desktop.yml after each build). Deliberately not
// GitHub Releases: the repo is private, and electron-updater's GitHub
// provider would need a repo-read token baked into every installed till —
// a real exposure for financial software that a plain HTTPS feed avoids.
//
// Downloads happen automatically in the background once found (never
// disrupts a till mid-shift), but installing/restarting always waits for an
// explicit choice — from the renderer's "Restart to update" chip, or
// naturally on the next full app quit. Never forced onto a till mid-shift.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours
let updateCheckTimer = null

function sendUpdateStatus(status, extra) {
  mainWindow?.webContents.send('update-status', { status, ...extra })
}

function setupAutoUpdater() {
  if (!app.isPackaged) return // no app-update.yml in a dev run — nothing to check

  autoUpdater.logger = console // reuses the file-logging override set up above
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => sendUpdateStatus('available', { version: info.version }))
  autoUpdater.on('update-not-available', () => sendUpdateStatus('none'))
  autoUpdater.on('download-progress', (p) => sendUpdateStatus('downloading', { percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus('ready', { version: info.version }))
  autoUpdater.on('error', (err) => {
    console.warn('[updater] check failed (offline? feed not configured yet?):', err.message)
    sendUpdateStatus('none')
  })

  const check = () => autoUpdater.checkForUpdates().catch((err) => console.warn('[updater] checkForUpdates threw:', err.message))
  // A short delay after the window is up — first paint and initial data
  // fetches shouldn't compete with an update check for network/CPU.
  setTimeout(check, 10_000)
  if (updateCheckTimer) clearInterval(updateCheckTimer)
  updateCheckTimer = setInterval(check, UPDATE_CHECK_INTERVAL_MS)
}

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall()
})

// ─── Config refresh (auto-provisioned desktop.env) ─────────────────────────
//
// The Portal can hand back a new runtimeConfig on any heartbeat — a rotated
// secret, a revoked-then-reissued credential, etc. desktop.env is rewritten
// immediately either way, but the already-running standalone server keeps
// using the env it was actually spawned with (hot-swapping env vars into a
// live process is fragile) until the operator restarts — same soft,
// never-forced-mid-shift pattern as an app version update, deliberately not
// a hard kick even for a revoked device (see startHeartbeatLoop callback
// below, which only logs on `allowed: false`, same as before this change).
function sendConfigStatus(status) {
  mainWindow?.webContents.send('config-status', { status })
}

ipcMain.handle('restart-app', () => {
  app.relaunch()
  app.exit(0)
})

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
    // A normal activation writes this file automatically (see the
    // 'license-activate' handler below) — reaching this dialog on an
    // already-activated device means either an unusual manual-provisioning
    // setup (see provision-till.ps1 / electron/README.md) that hasn't run
    // yet, or the file was deleted/corrupted after activation.
    console.error('[config] failed to load desktop.env:', err)
    dialog.showErrorBox(
      'Renovo Pro — Setup Required',
      `Configuration file not found or incomplete:\n${getDesktopEnvPath()}\n\n` +
      'This is normally written automatically when you activate the app. If ' +
      'you\'re seeing this after already activating, try reactivating; ' +
      'otherwise copy electron/desktop.env.example to this location and fill ' +
      'in the production connection details manually. See scripts/local-server/README.md ' +
      'for where to find each value.'
    )
    app.quit()
    return
  }
  activeDesktopEnv = desktopEnv

  // A zombie server process from a previous crash/unclean shutdown binds
  // this exact port just as effectively as a fresh spawn does — checked up
  // front so that failure mode gets its own clear message instead of
  // silently falling into the same "still starting" retry loop below as a
  // merely slow first boot.
  if (!(await isPortFree(PORT))) {
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'Renovo Pro — Port Already In Use',
      message: `Port ${PORT} is already in use on this PC.`,
      detail: 'This usually means another copy of Renovo Pro is already running, or didn\'t shut down cleanly last time. Open Task Manager and end any existing "Renovo Pro" process, then try again.',
      buttons: ['Try Again', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response !== 0) { app.quit(); return }
    return startApp()
  }

  createSplashWindow()
  startStandaloneServer(desktopEnv)
  let result = await waitForServerReady()

  // A cold first run (disk cache empty, Prisma engine loading) can
  // legitimately take longer than the initial 30s wait — that case alone
  // gets the retry/quit prompt below. A process that has already exited
  // (bad DB credentials, a missing Prisma engine, ...) never was and never
  // will be "still starting", so it gets its own distinct message instead
  // of silently reusing the same generic timeout prompt forever.
  while (!result.ready) {
    closeSplashWindow()
    if (result.reason === 'crashed') {
      const exitDetail = serverExitInfo
        ? `It exited immediately (code ${serverExitInfo.code ?? 'unknown'}).`
        : 'It exited immediately.'
      // Awaited (it caps itself at 5s internally) so app.quit() below
      // doesn't tear the process down before the report actually goes out.
      await licenseManager.reportFatalError(PORTAL_BASE_URL, app.getVersion(), 'server-crashed', exitDetail)
      dialog.showErrorBox(
        'Renovo Pro — Failed to Start',
        `The local server ${exitDetail}\n\n` +
        `This is usually a configuration problem (wrong database details in desktop.env) ` +
        `rather than something a retry will fix. Details were written to:\n${LOG_FILE}\n\n` +
        'Check that file, or contact support with it attached.'
      )
      app.quit()
      return
    }

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
    createSplashWindow()
    result = await waitForServerReady()
  }

  closeSplashWindow()
  createMainWindow()
  createTray()
  setupAutoUpdater()

  heartbeatTimer = licenseManager.startHeartbeatLoop(PORTAL_BASE_URL, app.getVersion(), (err, result) => {
    if (err) { console.warn('[license] heartbeat failed (offline?):', err.message); return }
    if (!result.allowed) console.warn('[license] heartbeat reports access no longer allowed:', result.reason)

    // Soft config refresh — rewrite desktop.env immediately so the *next*
    // launch always picks up whatever the Portal currently wants this
    // device to have, but never hot-swap it into the already-running
    // server or force a restart mid-shift. Deliberately fires even when
    // `allowed` is false: a revoked device still gets a stale-but-present
    // config file rather than silently drifting further out of sync.
    if (result.runtimeConfig) {
      const written = writeDesktopEnv(result.runtimeConfig)
      if (!desktopEnvUnchanged(activeDesktopEnv, written)) {
        console.log('[config] desktop.env changed on the Portal — restart chip shown')
        sendConfigStatus('ready')
      }
    }
  })
}

app.whenReady().then(() => {
  setupDownloadHandler()
  startApp()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) startApp()
  })
})

app.on('window-all-closed', () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  if (updateCheckTimer) clearInterval(updateCheckTimer)
  if (serverProcess) serverProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Licensing ───────────────────────────────────────────────────────────

ipcMain.handle('license-activate', async (_event, activationCode) => {
  const result = await licenseManager.activate(activationCode, PORTAL_BASE_URL, app.getVersion())
  // The Portal hands back desktop.env's actual contents on activation now —
  // the operator never sees, copies, or types a database credential. Falls
  // through to the existing loadDesktopEnv()/"Setup Required" path in
  // startApp() untouched if an older Portal doesn't send runtimeConfig yet
  // (e.g. mid-rollout of this feature) or a manual desktop.env was already
  // placed by provision-till.ps1.
  if (result.runtimeConfig) writeDesktopEnv(result.runtimeConfig)
  // Successful activation transitions straight into the real startup
  // sequence rather than requiring a manual app restart.
  mainWindow?.close()
  await startApp()
  return result
})

ipcMain.handle('license-status', () => licenseManager.getAccessState())

// Lets the login screen show/pre-fill the company code this device was
// activated for, instead of making the operator remember and type it —
// licenseManager.js already stores it locally at activation time.
ipcMain.handle('license-info', () => licenseManager.getStoredLicense())

// Unlike license-status (a pure cache read), this forces a real heartbeat
// round-trip to the Portal first — used after the LicenseGate's "Retry" and
// its activation-key form (a redeemed reactivation code doesn't itself
// touch electron-store; only a fresh heartbeat's response does, via the
// same store.set('lastKnownStatus', ...) activate()/heartbeat() already do).
// Falls back to the last cached state if the Portal is unreachable, same as
// the background heartbeat loop's own error handling.
ipcMain.handle('license-recheck', async () => {
  try {
    await licenseManager.heartbeat(PORTAL_BASE_URL, app.getVersion())
  } catch {
    // Offline or Portal unreachable — fall through to whatever's cached.
  }
  return licenseManager.getAccessState()
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
