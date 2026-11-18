/**
 * Ties the device's offline storage (IndexedDB) to the company it belongs to.
 *
 * The offline database holds company data — cached customers/products, drafts,
 * and orders waiting to be sent — but none of it is keyed by company, and
 * nothing cleared it on sign-out. A kiosk that signs in as a different company
 * would therefore (a) show the previous company's cached customers and
 * products, and (b) worse, send orders queued under company A using company
 * B's session, filing them in B's books.
 *
 * Every authenticated scale/offline session claims the cache first:
 *  - same company            -> nothing to do
 *  - different company, with unsent orders -> refuse (those orders must be
 *    sent by their own company first); nothing is deleted
 *  - different company, nothing unsent     -> wipe everything and re-claim
 *  - owner unknown (device used before this guard existed) -> drop only the
 *    re-downloadable reference data; unsent orders are kept, since whose they
 *    are cannot be known and discarding them would lose real transactions
 */
import { offlineDB } from './db'

const OWNER_KEY = 'offline.cacheOwnerTenantId'

export class CacheOwnedByOtherCompanyError extends Error {
  constructor(readonly unsentCount: number) {
    super(
      `This device still has ${unsentCount} unsent ${unsentCount === 1 ? 'order' : 'orders'} ` +
      'from another company. Sign in to that company so they can be sent, then try again.',
    )
    this.name = 'CacheOwnedByOtherCompanyError'
  }
}

function readOwner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

function writeOwner(tenantId: string): void {
  try {
    window.localStorage.setItem(OWNER_KEY, tenantId)
  } catch {
    // Storage unavailable: the guard degrades to "owner unknown" next time,
    // which is the conservative path above.
  }
}

/** Orders/requests created offline that have not reached the server yet. */
export async function countUnsentOfflineWork(): Promise<number> {
  const [orders, queued] = await Promise.all([
    offlineDB.scaleOrders.where('syncStatus').anyOf(['pending', 'syncing', 'failed']).count(),
    offlineDB.syncQueue.filter((item) => item.status !== 'synced').count(),
  ])
  return orders + queued
}

/** Reference data that is re-downloaded on demand and safe to drop. */
async function clearReferenceData(): Promise<void> {
  await Promise.all([
    offlineDB.products.clear(),
    offlineDB.customers.clear(),
    offlineDB.priceGroups.clear(),
    offlineDB.priceOverrides.clear(),
    offlineDB.categories.clear(),
    offlineDB.stepConfigs.clear(),
    offlineDB.expenseTypes.clear(),
    offlineDB.responseCache.clear(),
    offlineDB.scaleDraft.clear(),
    offlineDB.meta.clear(),
  ])
}

/**
 * Claims the offline cache for [tenantId]. Throws
 * [CacheOwnedByOtherCompanyError] if it still holds another company's unsent
 * work; resolves otherwise.
 */
export async function claimOfflineCache(tenantId: string): Promise<void> {
  const owner = readOwner()
  if (owner === tenantId) return

  if (owner === null) {
    // Used before ownership was tracked. Reference data may belong to anyone.
    // Offline, dropping it would leave the kiosk with no products or
    // customers until it next gets a connection, so wait for an online start.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    await clearReferenceData()
    writeOwner(tenantId)
    return
  }

  const unsent = await countUnsentOfflineWork()
  if (unsent > 0) throw new CacheOwnedByOtherCompanyError(unsent)

  await Promise.all(offlineDB.tables.map((t) => t.clear()))
  writeOwner(tenantId)
}
