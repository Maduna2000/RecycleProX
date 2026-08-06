import { offlineDB } from './db'
import { syncScaleOrders, registerScaleSyncCallbacks } from './scaleSyncService'

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

  // Also register callbacks for scale sync
  registerScaleSyncCallbacks({
    showToast: opts.showToast,
    onSyncComplete: () => {
      // Refresh pending count after scale sync
      refreshPendingCount()
    },
  })
}

async function refreshPendingCount() {
  const queueCount = await offlineDB.syncQueue
    .where('status').equals('pending')
    .count()
  const scaleCount = await offlineDB.scaleOrders
    .where('syncStatus').anyOf(['pending', 'syncing'])
    .count()
  _setPendingCount?.(queueCount + scaleCount)
}

let _syncInProgress = false

export async function triggerSync(): Promise<void> {
  if (_syncInProgress) return
  _syncInProgress = true
  _setSyncing?.(true)

  try {
    // Sync scale orders first (they have photos that need uploading)
    await syncScaleOrders()

    // Then sync the general queue
    const pending = await offlineDB.syncQueue
      .where('status').equals('pending')
      .sortBy('seq')

    if (pending.length === 0) {
      await refreshPendingCount()
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

          // A record created offline (e.g. a quick-created customer) may be
          // referenced by its local_ id inside the body of a LATER queued
          // item (e.g. that purchase's customerId) — that reference would
          // 404/fail server-side once replayed, since the local id was never
          // real. Rewrite it to the real cloud id in every still-pending item
          // now that we have one. Safe as a plain string replace: local ids
          // are `local_<uuid>`, unique enough that a false-positive
          // substring match elsewhere in a JSON body is not a real risk.
          if (cloudId && cloudId !== item.localId) {
            await substituteLocalId(item.localId, cloudId)
          }
        } else if (res.status === 401) {
          // The desktop session cookie can genuinely expire during a long
          // outage — this is not a bad payload, and marking it (and every
          // item after it) 'failed' would silently lose real transactions.
          // Leave this item and the rest of the queue as 'pending' and stop
          // this sync pass; they'll retry automatically once re-authenticated
          // (next online-event/interval-triggered triggerSync() call).
          _showToast?.('Session expired — please log in again to sync offline transactions', 'error')
          break
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

    // Update pending count (includes scale orders)
    await refreshPendingCount()

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

// Rewrites every remaining pending queue item's body, replacing any
// occurrence of a just-synced record's local id with its real cloud id —
// see the call site's comment in triggerSync for why this is needed.
async function substituteLocalId(localId: string, cloudId: string): Promise<void> {
  const dependents = await offlineDB.syncQueue
    .where('status').equals('pending')
    .filter((i) => i.body.includes(localId))
    .toArray()

  for (const dep of dependents) {
    await offlineDB.syncQueue.update(dep.seq!, {
      body: dep.body.split(localId).join(cloudId),
    })
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
