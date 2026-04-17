import { offlineDB } from './db'

// Imported lazily to avoid circular deps at module load time
let _setPendingCount: ((n: number) => void) | null = null
let _setSyncing: ((v: boolean) => void) | null = null
let _showToast: ((msg: string, type: 'success' | 'error') => void) | null = null

export function registerSyncCallbacks(opts: {
  setPendingCount: (n: number) => void
  setSyncing: (v: boolean) => void
  showToast: (msg: string, type: 'success' | 'error') => void
}) {
  _setPendingCount = opts.setPendingCount
  _setSyncing = opts.setSyncing
  _showToast = opts.showToast
}

let _syncInProgress = false

export async function triggerSync(): Promise<void> {
  if (_syncInProgress) return
  _syncInProgress = true
  _setSyncing?.(true)

  try {
    const pending = await offlineDB.syncQueue
      .where('status').equals('pending')
      .sortBy('seq')

    if (pending.length === 0) {
      return
    }

    let synced = 0
    let failed = 0

    for (const item of pending) {
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: item.body,
        })

        if (res.ok) {
          let cloudId: string | undefined
          try {
            const data = await res.json()
            // Most API routes return { id, ... } — try to extract the cloud id
            cloudId = data?.id ?? data?.data?.id
          } catch {
            // response body not JSON, that's fine
          }

          await offlineDB.syncQueue.update(item.seq!, {
            status: 'synced',
            cloudId,
          })
          synced++
        } else if (res.status >= 400 && res.status < 500) {
          // Client error — bad payload, don't retry
          const errText = await res.text().catch(() => String(res.status))
          await offlineDB.syncQueue.update(item.seq!, {
            status: 'failed',
            errorMessage: errText,
          })
          failed++
        } else {
          // Server error — increment retry counter
          const newRetries = (item.retries ?? 0) + 1
          if (newRetries >= 3) {
            await offlineDB.syncQueue.update(item.seq!, {
              status: 'failed',
              retries: newRetries,
              errorMessage: `Server error after ${newRetries} retries`,
            })
            failed++
          } else {
            await offlineDB.syncQueue.update(item.seq!, { retries: newRetries })
          }
        }
      } catch {
        // Network error mid-sync — increment retries
        const newRetries = (item.retries ?? 0) + 1
        if (newRetries >= 3) {
          await offlineDB.syncQueue.update(item.seq!, {
            status: 'failed',
            retries: newRetries,
            errorMessage: 'Network error after 3 retries',
          })
          failed++
        } else {
          await offlineDB.syncQueue.update(item.seq!, { retries: newRetries })
        }
      }
    }

    // Update pending count
    const remaining = await offlineDB.syncQueue
      .where('status').equals('pending')
      .count()
    _setPendingCount?.(remaining)

    // Notify user
    if (synced > 0 && failed === 0) {
      _showToast?.(`${synced} offline transaction${synced > 1 ? 's' : ''} synced`, 'success')
    } else if (synced > 0 && failed > 0) {
      _showToast?.(`${synced} synced, ${failed} failed — check settings`, 'error')
    } else if (failed > 0) {
      _showToast?.(`Sync failed for ${failed} transaction${failed > 1 ? 's' : ''} — check settings`, 'error')
    }
  } finally {
    _syncInProgress = false
    _setSyncing?.(false)
  }
}

/** Queue a mutation for offline sync */
export async function enqueueMutation(opts: {
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  body: unknown
  localId: string
}): Promise<void> {
  await offlineDB.syncQueue.add({
    id: crypto.randomUUID(),
    method: opts.method,
    url: opts.url,
    body: JSON.stringify(opts.body),
    localId: opts.localId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    retries: 0,
  })
}

/** Returns count of pending items */
export async function getPendingCount(): Promise<number> {
  return offlineDB.syncQueue.where('status').equals('pending').count()
}
