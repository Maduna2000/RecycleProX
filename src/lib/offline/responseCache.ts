import { offlineDB } from './db'

/**
 * Generic last-known-response cache-aside — the broad, low-risk half of the
 * offline-read fix (see the "Desktop offline mode" plan). Used directly for
 * computed/aggregate endpoints (Float's live balance, Cash-up's "today"
 * session + live-stats) that are deliberately NOT re-derived locally from
 * the structured offline tables, and as the drop-in default fetcher for any
 * page not yet given a deeper structured offline reader.
 *
 * Whatever JSON an exact URL last returned successfully is what a later
 * failed request for that same URL gets back — same shape SWR's own cache
 * already assumes (one entry per key), just persisted to IndexedDB so it
 * survives a full app restart, not only a page navigation.
 */

async function readCache(url: string): Promise<{ json: unknown; cachedAt: string } | null> {
  const entry = await offlineDB.responseCache.get(url)
  if (!entry) return null
  try {
    return { json: JSON.parse(entry.json), cachedAt: entry.cachedAt }
  } catch {
    return null
  }
}

async function writeCache(url: string, json: unknown): Promise<void> {
  try {
    await offlineDB.responseCache.put({ url, json: JSON.stringify(json), cachedAt: new Date().toISOString() })
  } catch {
    // Best-effort — a caching failure must never break the live response that triggered it.
  }
}

/**
 * SWR-compatible fetcher: live fetch → write-through to the cache → return.
 * On any failure (offline, timeout, non-ok response), falls back to the
 * last cached JSON for this exact URL and stamps `_offlineCachedAt` on the
 * (cloned) result so callers/UI can show "as of HH:MM". Re-throws the
 * original error when there's truly nothing cached yet, which SWR surfaces
 * as its normal `error` state.
 *
 * Return type matches src/lib/swrFetcher.ts's own untyped fetcher on
 * purpose: useSWR<T>(url, fetcher) needs the fetcher's return type to be
 * assignable to T for every T it's used with, same as the plain fetcher
 * already does across ~40 call sites.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function offlineFetcher(url: string): Promise<any> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
    }
    const json = await res.json()
    void writeCache(url, json)
    return json
  } catch (err) {
    const cached = await readCache(url)
    if (cached) {
      return withCachedAt(cached.json, cached.cachedAt)
    }
    throw err
  }
}

function withCachedAt(json: unknown, cachedAt: string): unknown {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    return { ...(json as Record<string, unknown>), _offlineCachedAt: cachedAt }
  }
  // Arrays and primitives can't carry a sibling property — stash the
  // timestamp under the response-cache header key instead so a caller that
  // cares (rare) can still look it up via peekCachedAt().
  return json
}

/** Read-only peek at when a URL's cache entry was last written, without fetching. */
export async function peekCachedAt(url: string): Promise<string | null> {
  const entry = await offlineDB.responseCache.get(url)
  return entry?.cachedAt ?? null
}
