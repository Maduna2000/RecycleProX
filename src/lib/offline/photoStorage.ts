import { offlineDB, type OfflinePhoto } from './db'

// ─── Store photo locally ─────────────────────────────────────────────────────

export async function storePhotoLocally(
  orderId: string,
  lineIndex: number,
  photoIndex: number,
  blob: Blob
): Promise<string> {
  const id = crypto.randomUUID()

  await offlineDB.photoCache.add({
    id,
    orderId,
    photoIndex,
    lineIndex,
    blob,
    syncStatus: 'pending',
    createdAt: new Date().toISOString(),
  })

  return id
}

// ─── Get local photos ────────────────────────────────────────────────────────

export async function getLocalPhotos(orderId: string): Promise<OfflinePhoto[]> {
  return offlineDB.photoCache
    .where('orderId')
    .equals(orderId)
    .toArray()
}

export async function getLocalPhotoById(photoId: string): Promise<OfflinePhoto | undefined> {
  return offlineDB.photoCache.get(photoId)
}

// ─── Create object URL for local photo ───────────────────────────────────────

export function createPhotoPreviewUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export function revokePhotoPreviewUrl(url: string): void {
  URL.revokeObjectURL(url)
}

// ─── Upload pending photos ───────────────────────────────────────────────────

export async function uploadPendingPhotos(
  localOrderId: string,
  cloudOrderId: string
): Promise<{ photoId: string; r2Key: string }[]> {
  const photos = await offlineDB.photoCache
    .where('orderId')
    .equals(localOrderId)
    .filter(p => p.syncStatus === 'pending')
    .toArray()

  const results: { photoId: string; r2Key: string }[] = []

  for (const photo of photos) {
    try {
      const form = new FormData()
      form.append('context', 'scale_order')
      form.append('referenceId', cloudOrderId)
      form.append('photoIndex', String(photo.photoIndex))
      form.append('file', photo.blob, `photo-${photo.lineIndex}-${photo.photoIndex}.jpg`)

      const res = await fetch('/api/r2/upload', { method: 'POST', body: form })

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status}`)
      }

      const { key } = await res.json()

      await offlineDB.photoCache.update(photo.id, {
        syncStatus: 'synced',
        r2Key: key,
      })

      results.push({ photoId: photo.id, r2Key: key })
    } catch {
      // Mark as failed but continue with other photos
      await offlineDB.photoCache.update(photo.id, {
        syncStatus: 'failed',
      })
    }
  }

  return results
}

// ─── Cleanup synced photos ───────────────────────────────────────────────────

const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function cleanupSyncedPhotos(): Promise<number> {
  const cutoff = new Date(Date.now() - CLEANUP_AGE_MS).toISOString()

  const oldPhotos = await offlineDB.photoCache
    .where('syncStatus')
    .equals('synced')
    .filter(p => p.createdAt < cutoff)
    .toArray()

  if (oldPhotos.length === 0) return 0

  const ids = oldPhotos.map(p => p.id)
  await offlineDB.photoCache.bulkDelete(ids)

  return ids.length
}

// ─── Get pending photo count ─────────────────────────────────────────────────

export async function getPendingPhotoCount(): Promise<number> {
  return offlineDB.photoCache
    .where('syncStatus')
    .equals('pending')
    .count()
}
