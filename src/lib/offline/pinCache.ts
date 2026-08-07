'use client'

/**
 * Offline fallback for the session PIN lock (see PinLockOverlay.tsx).
 *
 * The lock screen normally verifies a PIN against the server on every
 * unlock — during a real network outage that's a hard dead end: a cashier
 * idle for the 5-minute lock timeout gets permanently stuck until
 * connectivity returns, no matter how good the offline transaction queue
 * underneath is. This caches a salted, PBKDF2-hashed copy of the PIN
 * locally every time it's *successfully verified online*, so a later
 * unlock attempt that can't reach the server has a safe local fallback —
 * the same shape Toast/Clover use (device stays "logged in", PIN entry
 * doesn't need to re-hit the network every time).
 *
 * Never stores the raw PIN, only a salted PBKDF2 hash — a single fast hash
 * (e.g. plain SHA-256) would be weak against brute force for a 4-digit PIN
 * if the cached value were ever extracted from local storage; the real
 * protection against guessing either way is PinLockOverlay's existing
 * 3-attempt lockout, which this file's callers still enforce.
 */

const STORAGE_KEY = 'rpx-offline-pin-cache'
const PBKDF2_ITERATIONS = 100_000

interface CachedPin {
  userId: string
  saltHex: string
  hashHex: string
  cachedAt: string
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  return bytes
}

async function derivePinHash(pin: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return bytesToHex(new Uint8Array(bits))
}

function readCache(): CachedPin | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CachedPin) : null
  } catch {
    return null
  }
}

/** Call after every successful *online* PIN verification to refresh the offline fallback. */
export async function cacheVerifiedPin(userId: string, pin: string): Promise<void> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const hashHex = await derivePinHash(pin, salt)
    const entry: CachedPin = { userId, saltHex: bytesToHex(salt), hashHex, cachedAt: new Date().toISOString() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // Caching is best-effort — a failure here shouldn't block the (already
    // successful) online unlock that triggered it.
  }
}

/** True once at least one online unlock has been cached for this user on this device. */
export function hasOfflinePinFallback(userId: string): boolean {
  return readCache()?.userId === userId
}

/** Offline fallback check — false if nothing cached yet, cached for a different user, or the PIN doesn't match. */
export async function verifyPinOffline(userId: string, pin: string): Promise<boolean> {
  const entry = readCache()
  if (!entry || entry.userId !== userId) return false
  try {
    const candidateHash = await derivePinHash(pin, hexToBytes(entry.saltHex))
    return candidateHash === entry.hashHex
  } catch {
    return false
  }
}
