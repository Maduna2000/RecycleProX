/**
 * Renovo Pro Desktop — License manager (main process only).
 *
 * Machine ID: a persisted random UUID written once to disk on first run —
 * simpler and more portable than hardware fingerprinting for Phase 1 (see
 * SaaS plan section C.5).
 *
 * Activation: the platform admin issues a one-time activation code from the
 * SaaS Portal (Portal's Company detail page -> "Issue activation code" —
 * see renovo-pro-portal's AddDeviceForm.tsx). That code IS the deviceToken;
 * activation just binds it to this machine's fingerprint and flips its
 * status from 'pending' to 'active' server-side.
 *
 * Offline grace: within the grace window, normal operation plus a status
 * banner; beyond it, read-only rather than a hard lockout — a false-positive
 * connectivity blip shouldn't lock out a live business (plan section C.5).
 */
const crypto = require('node:crypto')
const os = require('node:os')
const path = require('node:path')
const { app } = require('electron')
// electron-store v9+ ships ESM-only — `require('electron-store')` resolves
// but returns the module namespace object ({ default: Store }), not the
// class itself, so `new Store(...)` fails with "Store is not a constructor"
// unless destructured like this. Confirmed by hand: a plain
// `const Store = require('electron-store')` gives `typeof Store === 'object'`.
const { default: Store } = require('electron-store')

const DEFAULT_OFFLINE_GRACE_DAYS = 7
const HEARTBEAT_INTERVAL_MS = 8 * 60 * 60 * 1000 // 8h, within the plan's 6-12h range

// Same per-machine (not per-Windows-user) directory as main.js's
// getSharedDataDir() — duplicated rather than imported since this file is
// required standalone and shouldn't take on a circular dependency on
// main.js just for one path helper. package.json's nsis.perMachine=true
// installs once for the whole PC; without this, the license/device-token
// store would live under the CURRENT Windows account's own profile, so a
// second account on the same till would see itself as never-activated
// despite sharing the one machine-wide install.
const SHARED_DATA_DIR = process.env.PROGRAMDATA
  ? path.join(process.env.PROGRAMDATA, 'RenovoPro')
  : app.getPath('userData')

// electron-store's default encryption is obfuscation, not real security —
// deliberately not the security boundary here. The deviceToken is a
// per-device, server-revocable credential (Portal admin can block/deactivate
// it any time), so "readable by someone with local disk access to this
// specific machine" is an acceptable risk for Phase 1, same tier as any
// desktop app's local session cache.
const store = new Store({ name: 'renovo-license', cwd: SHARED_DATA_DIR })

function getMachineId() {
  let id = store.get('machineId')
  if (!id) {
    id = crypto.randomUUID()
    store.set('machineId', id)
  }
  return id
}

function isActivated() {
  return Boolean(store.get('deviceToken'))
}

function getStoredLicense() {
  return {
    deviceToken: store.get('deviceToken') ?? null,
    companySlug: store.get('companySlug') ?? null,
    schemaName: store.get('schemaName') ?? null,
    lastCheckAt: store.get('lastCheckAt') ?? null,
    lastKnownStatus: store.get('lastKnownStatus') ?? null,
  }
}

function deviceInfo(appVersion) {
  return {
    deviceName: os.hostname(),
    operatingSystem: `${os.platform()} ${os.release()}`,
    appVersion,
  }
}

async function activate(activationCode, portalBaseUrl, appVersion) {
  const res = await fetch(`${portalBaseUrl}/api/desktop/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceToken: activationCode,
      machineFingerprint: getMachineId(),
      ...deviceInfo(appVersion),
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Activation failed (${res.status})`)
  }

  const result = await res.json()
  store.set('deviceToken', result.deviceToken)
  store.set('companySlug', result.companySlug)
  store.set('schemaName', result.schemaName)
  store.set('lastCheckAt', new Date().toISOString())
  // runtimeConfig (desktop.env values — real DB credentials) is deliberately
  // never persisted here. electron-store's own encryption is obfuscation,
  // not real security (see the comment on `store` above) — the one place
  // this belongs on disk is desktop.env itself (main.js writes it), not a
  // second copy sitting in the license store. Stripped before persisting;
  // still returned below so main.js can consume it this one time.
  const { runtimeConfig: _omit, ...persistedStatus } = result
  store.set('lastKnownStatus', persistedStatus)
  return result
}

async function heartbeat(portalBaseUrl, appVersion) {
  const deviceToken = store.get('deviceToken')
  if (!deviceToken) throw new Error('Device not activated')

  const res = await fetch(`${portalBaseUrl}/api/desktop/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceToken, ...deviceInfo(appVersion) }),
  })

  if (!res.ok) throw new Error(`Heartbeat failed (${res.status})`)

  const result = await res.json()
  store.set('lastCheckAt', new Date().toISOString())
  // Same reasoning as activate() above — never persist runtimeConfig into
  // electron-store, only into desktop.env itself.
  const { runtimeConfig: _omit, ...persistedStatus } = result
  store.set('lastKnownStatus', persistedStatus)
  return result
}

/**
 * Best-effort, fire-and-forget report of a fatal desktop error (uncaught
 * exception, server crash) to the same Portal every activation/heartbeat
 * call already talks to — so a rollout across multiple tills is visible in
 * one place instead of only ever discoverable by someone physically opening
 * this one machine's local log file (see electron/main.js's LOG_FILE).
 *
 * Deliberately never throws and never blocks anything on its result: until
 * the Portal (a separate repo) adds a matching POST /api/desktop/error-report
 * route, this 404s and is silently swallowed — the same "wired client-side,
 * turns on the moment the other end exists" pattern already used for code
 * signing and the auto-update feed (see electron/README.md).
 */
async function reportFatalError(portalBaseUrl, appVersion, reason, message) {
  try {
    const deviceToken = store.get('deviceToken')
    await fetch(`${portalBaseUrl}/api/desktop/error-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceToken: deviceToken ?? null, reason, message, ...deviceInfo(appVersion) }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Offline, Portal unreachable, or the endpoint doesn't exist yet —
    // never let error *reporting* itself become a second failure.
  }
}

const SUBSCRIPTION_COUNTDOWN_WINDOW_DAYS = 7

// Same day-math as Web's subscriptionAccess.ts computeSubscriptionAccess(),
// duplicated rather than imported since this file is plain CJS running in
// Electron's main process — kept in sync by hand, small enough that drift
// would be obvious in review. Purely a function of subscriptionEndDate/
// gracePeriodDays, both already cached in lastKnownStatus (heartbeat/activate
// responses — see deviceService.ts's buildLicenseCheckResult on the Portal
// side), so this needs no network or DB access either.
function computeSubscriptionCountdown(lastKnownStatus) {
  const endDateStr = lastKnownStatus?.subscriptionEndDate
  if (!endDateStr) return { subscriptionDaysUntilDue: null, subscriptionDueDate: null }

  const endDate = new Date(endDateStr)
  const daysUntilDue = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const inCountdownWindow = lastKnownStatus.effectiveStatus !== 'expired' && daysUntilDue >= 0 && daysUntilDue <= SUBSCRIPTION_COUNTDOWN_WINDOW_DAYS

  return {
    subscriptionDaysUntilDue: inCountdownWindow ? daysUntilDue : null,
    subscriptionDueDate: endDateStr,
  }
}

// Computed purely from local state — callable while offline. One of:
//   'not_activated' | 'blocked' | 'normal' | 'grace_warning' | 'read_only'
// 'blocked' reflects the last known server verdict (subscription/company
// suspended etc.) — that state persists offline on purpose, so a suspended
// customer can't dodge suspension by disconnecting. Every state also carries
// subscriptionDaysUntilDue/subscriptionDueDate (both possibly null) so the
// renderer can show the pre-expiry countdown banner regardless of which
// state above is active.
function getAccessState(offlineGraceDays = DEFAULT_OFFLINE_GRACE_DAYS) {
  if (!isActivated()) return { state: 'not_activated' }

  const lastKnownStatus = store.get('lastKnownStatus')
  const countdown = computeSubscriptionCountdown(lastKnownStatus)

  if (lastKnownStatus && lastKnownStatus.allowed === false) {
    return {
      state: 'blocked',
      reason: lastKnownStatus.reason,
      // Only offer the "enter activation key" path when the block is
      // actually a lapsed subscription — a company/device suspended by an
      // admin has no reactivation code to redeem.
      canReactivate: lastKnownStatus.effectiveStatus === 'expired',
      ...countdown,
    }
  }

  const lastCheckAt = store.get('lastCheckAt')
  if (!lastCheckAt) return { state: 'normal', ...countdown }

  const daysSinceCheck = (Date.now() - new Date(lastCheckAt).getTime()) / (1000 * 60 * 60 * 24)
  if (daysSinceCheck > offlineGraceDays) {
    return { state: 'read_only', daysSinceCheck, ...countdown }
  }
  if (daysSinceCheck > offlineGraceDays - 3) {
    return { state: 'grace_warning', daysSinceCheck, offlineGraceDays, ...countdown }
  }
  return { state: 'normal', ...countdown }
}

function startHeartbeatLoop(portalBaseUrl, appVersion, onResult) {
  const run = () => {
    heartbeat(portalBaseUrl, appVersion)
      .then((result) => onResult?.(null, result))
      .catch((err) => onResult?.(err, null))
  }
  run() // once immediately at startup
  return setInterval(run, HEARTBEAT_INTERVAL_MS)
}

module.exports = {
  getMachineId,
  isActivated,
  getStoredLicense,
  activate,
  heartbeat,
  reportFatalError,
  getAccessState,
  startHeartbeatLoop,
  DEFAULT_OFFLINE_GRACE_DAYS,
}
