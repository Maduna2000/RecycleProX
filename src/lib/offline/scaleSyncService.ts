import { offlineDB } from './db'
import {
  getPendingScaleOrders,
  markOrderSynced,
  markOrderFailed,
  markOrderSyncing,
  cleanupSyncedData,
} from './scaleOrderService'
import { cleanupSyncedPhotos } from './photoStorage'

// ─── Sync callbacks (registered by UI) ───────────────────────────────────────

let _showToast: ((msg: string, type: 'success' | 'error') => void) | null = null
let _onSyncComplete: (() => void) | null = null

export function registerScaleSyncCallbacks(opts: {
  showToast?: (msg: string, type: 'success' | 'error') => void
  onSyncComplete?: () => void
}) {
  _showToast = opts.showToast ?? null
  _onSyncComplete = opts.onSyncComplete ?? null
}

// ─── Sync state ──────────────────────────────────────────────────────────────

let _syncInProgress = false

export function isScaleSyncInProgress(): boolean {
  return _syncInProgress
}

// ─── Main sync function ──────────────────────────────────────────────────────

export async function syncScaleOrders(): Promise<{ synced: number; failed: number }> {
  if (_syncInProgress) return { synced: 0, failed: 0 }
  _syncInProgress = true

  let synced = 0
  let failed = 0

  try {
    const pendingOrders = await getPendingScaleOrders()

    if (pendingOrders.length === 0) {
      return { synced: 0, failed: 0 }
    }

    for (const order of pendingOrders) {
      try {
        // Mark as syncing
        await markOrderSyncing(order.id)

        // Get photos for this order
        const photos = await offlineDB.photoCache
          .where('orderId')
          .equals(order.id)
          .toArray()

        // First, upload photos to R2 and get keys
        const photoR2Keys: string[][] = []
        for (const line of order.lines) {
          const linePhotos = photos.filter(
            p => line.localPhotoIds.includes(p.id)
          )

          // Upload each photo
          const keys: string[] = []
          for (const photo of linePhotos) {
            const form = new FormData()
            form.append('context', 'scale_order')
            form.append('referenceId', order.id)  // Will update after order creation
            form.append('photoIndex', String(photo.photoIndex))
            form.append('file', photo.blob, `photo-${photo.lineIndex}-${photo.photoIndex}.jpg`)

            const res = await fetch('/api/r2/upload', { method: 'POST', body: form })
            if (!res.ok) {
              throw new Error(`Photo upload failed: ${res.status}`)
            }
            const { key } = await res.json()
            keys.push(key)

            // Mark photo as synced
            await offlineDB.photoCache.update(photo.id, {
              syncStatus: 'synced',
              r2Key: key,
            })
          }
          photoR2Keys.push(keys)
        }

        // Build API payload
        const payload = order.customerId
          ? {
              customerId: order.customerId,
              lines: order.lines.map((line, i) => ({
                productId: line.productId,
                weight: line.weight,
                photoR2Keys: photoR2Keys[i] ?? [],
              })),
              notes: order.notes,
            }
          : {
              casualFirstName: order.casualFirstName,
              casualLastName: order.casualLastName,
              casualPhone: order.casualPhone,
              casualIdNumber: order.casualIdNumber,
              lines: order.lines.map((line, i) => ({
                productId: line.productId,
                weight: line.weight,
                photoR2Keys: photoR2Keys[i] ?? [],
              })),
              notes: order.notes,
            }

        // Create order on server
        const res = await fetch('/api/scale/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (res.ok) {
          const data = await res.json()
          await markOrderSynced(order.id, data.id, data.orderNumber)
          synced++
        } else if (res.status >= 400 && res.status < 500) {
          // Client error - don't retry
          const errText = await res.text().catch(() => String(res.status))
          await markOrderFailed(order.id, errText)
          failed++
        } else {
          // Server error - keep as pending for retry
          await offlineDB.scaleOrders.update(order.id, {
            syncStatus: 'pending',
          })
        }
      } catch {
        // Network or other error - keep as pending for retry
        await offlineDB.scaleOrders.update(order.id, {
          syncStatus: 'pending',
        })
      }
    }

    // Notify UI
    if (synced > 0 && failed === 0) {
      _showToast?.(`${synced} scale order${synced > 1 ? 's' : ''} synced`, 'success')
    } else if (synced > 0 && failed > 0) {
      _showToast?.(`${synced} synced, ${failed} failed`, 'error')
    } else if (failed > 0) {
      _showToast?.(`Failed to sync ${failed} scale order${failed > 1 ? 's' : ''}`, 'error')
    }

    _onSyncComplete?.()

    // Cleanup old synced data
    await cleanupSyncedData()
    await cleanupSyncedPhotos()

    return { synced, failed }
  } finally {
    _syncInProgress = false
  }
}

// ─── Get sync status ─────────────────────────────────────────────────────────

export interface ScaleSyncStatus {
  pendingOrders: number
  pendingPhotos: number
  failedOrders: number
  isSyncing: boolean
}

export async function getScaleSyncStatus(): Promise<ScaleSyncStatus> {
  const [pendingOrders, pendingPhotos, failedOrders] = await Promise.all([
    offlineDB.scaleOrders.where('syncStatus').equals('pending').count(),
    offlineDB.photoCache.where('syncStatus').equals('pending').count(),
    offlineDB.scaleOrders.where('syncStatus').equals('failed').count(),
  ])

  return {
    pendingOrders,
    pendingPhotos,
    failedOrders,
    isSyncing: _syncInProgress,
  }
}
