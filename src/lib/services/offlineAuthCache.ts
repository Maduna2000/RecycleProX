/**
 * Local, on-disk fallback for the very first thing a till needs after an
 * internet outage: logging in at all.
 *
 * The desktop/local-server deployments have no local database — every
 * login normally round-trips to the shared production Postgres (see
 * electron/main.js and authService.ts's login()). Once logged in, a JWT
 * session (auth.config.ts, 12h maxAge) lets a cashier keep working through
 * an outage with zero further DB access — but a *fresh* login (new shift,
 * an expired session, a fresh install) has no such escape hatch today: if
 * the DB is unreachable, nobody can even open the till. This mirrors the
 * exact problem pinCache.ts already solved for the idle-lock PIN re-entry,
 * extended to the initial username/password login itself.
 *
 * Trust model: this cache is only ever consulted by auth.ts's authorize()
 * when the real DB-backed login() call could not reach the database at
 * all — never when the database was reachable and said the credentials
 * were wrong. It only helps a machine that has already completed one real,
 * online login for that exact user; a brand-new device or a user who has
 * never logged in here before still requires connectivity, same as
 * pinCache.ts requires one online PIN check before it can be used offline.
 *
 * Never stores the plaintext password, only a salted PBKDF2 hash — same
 * reasoning as pinCache.ts (a fast unsalted hash would be weak against
 * offline brute force if this file were ever extracted).
 *
 * Lives under the OS user's home directory rather than needing an
 * Electron-specific `app.getPath('userData')` plumbed through — this file
 * is written to by the very same Node process that runs the bundled Next
 * server (Electron's spawned child, or scripts/local-server/'s process),
 * so os.homedir() resolves correctly either way.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import logger from '@/lib/logger'

const CACHE_DIR  = path.join(os.homedir(), '.renovopro')
const CACHE_FILE = path.join(CACHE_DIR, 'offline-auth-cache.json')
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEYLEN     = 32

export interface OfflineLoginPayload {
  id:                   string
  fullName:             string
  username:             string
  role:                 string
  forcePasswordChange:  boolean
  allowedModules:       string[]
  tenantId?:            string
  schemaName?:          string
  tenantSlug?:          string
  featureFlags?:        Record<string, boolean>
}

interface CacheEntry {
  saltHex:  string
  hashHex:  string
  cachedAt: string
  payload:  OfflineLoginPayload
}

type CacheFile = Record<string, CacheEntry>

function cacheKey(username: string, tenantSlug?: string): string {
  return `${tenantSlug ?? ''}:${username.toLowerCase()}`
}

async function readCacheFile(): Promise<CacheFile> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8')
    return JSON.parse(raw) as CacheFile
  } catch {
    return {}
  }
}

async function writeCacheFile(data: CacheFile): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  // 0o600 — this file's hashes only need to survive an offline outage for
  // the same OS user who logged in, never other accounts on the machine.
  await fs.writeFile(CACHE_FILE, JSON.stringify(data), { mode: 0o600 })
}

function derivePasswordHash(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256', (err, derived) => {
      if (err) reject(err); else resolve(derived)
    })
  })
}

/**
 * Call after every successful ONLINE login to refresh this device's offline
 * fallback for that user. Best-effort — a caching failure must never break
 * the real login that triggered it.
 */
export async function cacheOfflineLogin(
  username: string,
  password: string,
  tenantSlug: string | undefined,
  payload: OfflineLoginPayload,
): Promise<void> {
  try {
    const salt = crypto.randomBytes(16)
    const hash = await derivePasswordHash(password, salt)
    const data = await readCacheFile()
    data[cacheKey(username, tenantSlug)] = {
      saltHex:  salt.toString('hex'),
      hashHex:  hash.toString('hex'),
      cachedAt: new Date().toISOString(),
      payload,
    }
    await writeCacheFile(data)
  } catch (err) {
    logger.warn({ err }, 'offlineAuthCache: failed to cache credentials for offline login')
  }
}

/**
 * Offline fallback — only called by authorize() once the real DB-backed
 * login() has already thrown a connectivity-class error (see auth.ts).
 * Returns the cached session payload from this user's last successful
 * online login on this machine, or null if there's no matching cache entry
 * or the password doesn't match the cached hash.
 */
export async function tryOfflineLogin(
  username: string,
  password: string,
  tenantSlug: string | undefined,
): Promise<OfflineLoginPayload | null> {
  try {
    const data = await readCacheFile()
    const entry = data[cacheKey(username, tenantSlug)]
    if (!entry) return null

    const candidate = await derivePasswordHash(password, Buffer.from(entry.saltHex, 'hex'))
    const stored = Buffer.from(entry.hashHex, 'hex')
    if (candidate.length !== stored.length || !crypto.timingSafeEqual(candidate, stored)) return null

    return entry.payload
  } catch (err) {
    logger.warn({ err }, 'offlineAuthCache: offline login lookup failed')
    return null
  }
}
