import { offlineDB, type OfflineScaleOrder, type OfflineScaleOrderLine, type OfflinePhoto } from './db'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateOfflineOrderInput {
  customerId: string | null
  casualFirstName: string | null
  casualLastName: string | null
  casualPhone: string | null
  casualIdNumber: string | null
  lines: Array<{
    productId: string
    productName: string
    categoryName: string
    weight: string
    unit: string
    photoBlobs: Blob[]
  }>
  notes: string | null
  operatorId: string
}

export interface OfflineOrderResult {
  id: string
  tempOrderNumber: string
  isOffline: true
}

// ─── Generate temp order number ──────────────────────────────────────────────

function generateTempOrderNumber(): string {
  const rand = crypto.randomUUID().slice(0, 8).toUpperCase()
  return `PENDING-${rand}`
}

// ─── Create offline order ────────────────────────────────────────────────────

export async function createOfflineScaleOrder(
  input: CreateOfflineOrderInput
): Promise<OfflineOrderResult> {
  const localId = `local_${crypto.randomUUID()}`
  const tempOrderNumber = generateTempOrderNumber()
  const createdAt = new Date().toISOString()

  // Build lines with photo references
  const lines: OfflineScaleOrderLine[] = []
  const photos: OfflinePhoto[] = []

  for (let lineIndex = 0; lineIndex < input.lines.length; lineIndex++) {
    const line = input.lines[lineIndex]!
    const localPhotoIds: string[] = []

    for (let photoIndex = 0; photoIndex < line.photoBlobs.length; photoIndex++) {
      const blob = line.photoBlobs[photoIndex]
      if (!blob) continue

      const photoId = crypto.randomUUID()
      localPhotoIds.push(photoId)

      photos.push({
        id: photoId,
        orderId: localId,
        photoIndex,
        lineIndex,
        blob,
        syncStatus: 'pending',
        createdAt,
      })
    }

    lines.push({
      productId: line.productId,
      productName: line.productName,
      categoryName: line.categoryName,
      weight: line.weight,
      unit: line.unit,
      localPhotoIds,
    })
  }

  // Create the order
  const order: OfflineScaleOrder = {
    id: localId,
    tempOrderNumber,
    customerId: input.customerId,
    casualFirstName: input.casualFirstName,
    casualLastName: input.casualLastName,
    casualPhone: input.casualPhone,
    casualIdNumber: input.casualIdNumber,
    lines,
    notes: input.notes,
    operatorId: input.operatorId,
    createdAt,
    syncStatus: 'pending',
  }

  // Store in IndexedDB (transaction for atomicity)
  await offlineDB.transaction('rw', [offlineDB.scaleOrders, offlineDB.photoCache], async () => {
    await offlineDB.scaleOrders.add(order)
    if (photos.length > 0) {
      await offlineDB.photoCache.bulkAdd(photos)
    }
  })

  return {
    id: localId,
    tempOrderNumber,
    isOffline: true,
  }
}

// ─── Get pending orders ──────────────────────────────────────────────────────

export async function getPendingScaleOrders(): Promise<OfflineScaleOrder[]> {
  return offlineDB.scaleOrders
    .where('syncStatus')
    .equals('pending')
    .toArray()
}

export async function getPendingScaleOrderCount(): Promise<number> {
  return offlineDB.scaleOrders
    .where('syncStatus')
    .anyOf(['pending', 'syncing'])
    .count()
}

// ─── Get photos for an order ─────────────────────────────────────────────────

export async function getPhotosForOrder(orderId: string): Promise<OfflinePhoto[]> {
  return offlineDB.photoCache
    .where('orderId')
    .equals(orderId)
    .toArray()
}

// ─── Mark order as synced ────────────────────────────────────────────────────

export async function markOrderSynced(
  localId: string,
  cloudId: string,
  cloudOrderNumber: string
): Promise<void> {
  await offlineDB.scaleOrders.update(localId, {
    syncStatus: 'synced',
    cloudId,
    cloudOrderNumber,
  })
}

// ─── Mark order as failed ────────────────────────────────────────────────────

export async function markOrderFailed(localId: string, errorMessage: string): Promise<void> {
  await offlineDB.scaleOrders.update(localId, {
    syncStatus: 'failed',
    errorMessage,
  })
}

// ─── Mark order as syncing ───────────────────────────────────────────────────

export async function markOrderSyncing(localId: string): Promise<void> {
  await offlineDB.scaleOrders.update(localId, {
    syncStatus: 'syncing',
  })
}

// ─── Mark photo as synced ────────────────────────────────────────────────────

export async function markPhotoSynced(photoId: string, r2Key: string): Promise<void> {
  await offlineDB.photoCache.update(photoId, {
    syncStatus: 'synced',
    r2Key,
  })
}

// ─── Cleanup synced data ─────────────────────────────────────────────────────

const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function cleanupSyncedData(): Promise<void> {
  const cutoff = new Date(Date.now() - CLEANUP_AGE_MS).toISOString()

  // Get synced orders older than 24 hours
  const oldOrders = await offlineDB.scaleOrders
    .where('syncStatus')
    .equals('synced')
    .filter(o => o.createdAt < cutoff)
    .toArray()

  if (oldOrders.length === 0) return

  const orderIds = oldOrders.map(o => o.id)

  // Delete orders and their photos
  await offlineDB.transaction('rw', [offlineDB.scaleOrders, offlineDB.photoCache], async () => {
    await offlineDB.scaleOrders.bulkDelete(orderIds)
    await offlineDB.photoCache
      .where('orderId')
      .anyOf(orderIds)
      .delete()
  })
}

// ─── Get order by ID ─────────────────────────────────────────────────────────

export async function getOfflineOrder(id: string): Promise<OfflineScaleOrder | undefined> {
  return offlineDB.scaleOrders.get(id)
}
