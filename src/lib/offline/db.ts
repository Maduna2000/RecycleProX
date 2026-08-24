import Dexie, { type Table } from 'dexie'

// ─── Seed table shapes (mirrors Prisma models, plain JS values) ───────────────

export interface OfflineProduct {
  id: string
  code: string
  name: string
  category: string
  unit: string
  defaultBuyPrice: string   // stored as string to avoid float issues
  defaultSellPrice: string
  isActive: boolean
  sortOrder: number
}

export interface OfflineCustomer {
  id: string
  idNumber: string
  firstName: string
  lastName: string
  companyName?: string
  phone: string
  customerType: string
  primaryFunction: string
  blacklisted: boolean
  isActive: boolean
  priceGroupId?: string
  // Only needed for account-customer lookup fidelity (VAT/trade-commodity
  // filtering, receipt display) — see useOfflineLookup.ts. Not indexed,
  // so no schema version bump needed to add them.
  accountCode?: string | null
  blacklistReason?: string | null
  tradeCommodities?: string[] | null
  zeroRated?: boolean
  contactPerson?: string | null
  physicalAddress?: string | null
  // Added for the Customers list page's own offline replica (Phase 2) — the
  // fields above predate that and were only ever needed by the till-form
  // lookups in useOfflineLookup.ts.
  createdAt?: string
  dealerCategory?: string | null
  email?: string | null
  landline?: string | null
}

export interface OfflinePriceGroup {
  id: string
  name: string
  isDefault: boolean
  isActive: boolean
}

export interface OfflinePriceOverride {
  id: string
  priceGroupId: string
  productId: string
  buyPrice: string
  sellPrice: string
}

// ─── Offline transaction shapes ───────────────────────────────────────────────

// Line items embed product name/code/unit directly (rather than just a
// productId FK) so a purchase/sale detail page can render fully offline
// without a follow-up join against the products table — mirrors what the
// bulk-sync API routes send (src/app/api/offline-sync/*), which denormalize
// for exactly this reason. Optional so records written by the OFFLINE-CREATE
// path (which doesn't have all this yet at creation time) still satisfy the
// type; the reader functions treat missing fields as "unknown", not an error.
export interface OfflinePurchaseLineEmbedded {
  id: string
  productId: string
  productName?: string
  productCode?: string
  unit?: string
  quantity: string
  grossQty?: string
  tareQty?: string
  tareReason?: string
  unitPrice: string
  lineTotal: string
  priceSource?: string
}

export interface OfflinePurchase {
  id: string              // local_ prefixed UUID when created offline
  refNumber: string
  customerId: string
  // Split (not a combined display string) so the offline reader can
  // reconstruct the exact { id, firstName, lastName, idNumber } shape the
  // live list API returns, rather than guessing where to split a
  // pre-joined name back apart.
  customerFirstName?: string
  customerLastName?: string
  customerIdNumber?: string | null
  status: string
  totalAmount: string
  amountPaid?: string
  vatAmount?: string
  subTotal?: string
  paymentMethod: string
  notes?: string
  loanDeductionAmount?: string
  scaleOperatorName?: string
  createdByUserId?: string
  createdAt: string       // ISO string
  lines?: OfflinePurchaseLineEmbedded[]  // full detail — present once bulk-synced or individually fetched
  _offlineCreated?: boolean
  _cloudId?: string       // set after sync
}

// Kept as a separate table (write-queue path still creates rows here one at
// a time before a purchase has synced) — the bulk-synced/read path instead
// embeds lines directly on OfflinePurchase.lines above, which is what the
// offline readers (src/lib/offline/readers/) actually consume.
export interface OfflinePurchaseLine {
  id: string
  purchaseId: string      // local_ ref until synced
  productId: string
  quantity: string
  grossQty?: string
  tareQty?: string
  tareReason?: string
  unitPrice: string
  lineTotal: string
  priceSource: string
}

export interface OfflineSaleLineEmbedded {
  id: string
  productId: string
  productName?: string
  productCode?: string
  unit?: string
  quantity: string
  unitPrice: string
  lineTotal: string
}

export interface OfflineSale {
  id: string
  refNumber: string
  buyerId?: string
  buyerName?: string
  buyerIdNumber?: string
  buyerPhone?: string
  customerId?: string
  status: string
  totalAmount: string
  amountPaid?: string
  vatAmount?: string
  businessLoanDeductionAmount?: string
  paymentMethod: string
  notes?: string
  createdByUserId?: string
  createdAt: string
  lines?: OfflineSaleLineEmbedded[]
  _offlineCreated?: boolean
  _cloudId?: string
}

export interface OfflineSaleLine {
  id: string
  saleId: string
  productId: string
  quantity: string
  unitPrice: string
  lineTotal: string
}

// ─── Payments (read-only replica — Payments module unions Sale+Payment rows,
// see paymentService.ts's listPayments; the offline reader replicates that
// same union + admin-visibility rule against the sales/payments tables) ────

export interface OfflinePayment {
  id: string
  refNumber?: string | null
  customerId: string | null
  customerName?: string | null
  source: 'sale' | 'purchase'
  saleId?: string | null
  purchaseId?: string | null
  saleCreatedByUserId?: string | null  // needed to replicate the admin-sale-hiding rule offline
  amount: string
  paymentMethod: string
  voidedAt?: string | null
  createdByUserId?: string | null
  createdAt: string
}

// ─── Cash-up session history (read-only replica) ──────────────────────────

export interface OfflineCashUpSession {
  id: string
  sessionDate: string
  status: string
  currency: string
  openingBalance: string
  systemCashSales: string
  systemCashPurchases: string
  systemCashPayments: string
  systemCashExpected: string
  declaredCash?: string | null
  variance?: string | null
  openedByUserId: string
  closedAt?: string | null      // when the session was submitted
  approvedAt?: string | null
  notes?: string | null
  createdAt: string
}

// ─── Stock movements (read-only replica) ──────────────────────────────────

export interface OfflineStockMovement {
  id: string
  productId: string
  productName?: string
  direction: 'in' | 'out'
  quantity: string
  source: string
  sourceId?: string | null
  createdAt: string
}

// ─── Generic last-known-response cache ─────────────────────────────────────
// Backs src/lib/offline/responseCache.ts's cache-aside SWR fetcher — used
// for computed/aggregate endpoints (Float's live balance, Cash-up's "today"
// session + live-stats) that are deliberately NOT re-derived locally from
// the structured tables above; see the offline-mode plan for why. Also
// serves as a broad safety net for any other page's fetcher: whatever the
// last successful response for an exact URL was, shown with its timestamp
// rather than nothing.

export interface OfflineResponseCacheEntry {
  url: string      // exact request URL (including query string) — the cache key
  json: string      // JSON.stringify(response body)
  cachedAt: string  // ISO timestamp — surfaced to the UI as "as of HH:MM"
}

export interface OfflineCashFloat {
  id: string
  floatDate: string       // YYYY-MM-DD
  openingAmount: string
  closingAmount?: string
  notes?: string
  createdByUserId?: string
  createdAt: string
  _offlineCreated?: boolean
  _cloudId?: string
}

export interface OfflineExpense {
  id: string
  refNumber: string
  expenseTypeId: string
  description: string
  amount: string
  vatAmount: string
  includesVat: boolean
  paymentMethod: string
  status: string
  createdByUserId?: string
  createdAt: string
  _offlineCreated?: boolean
  _cloudId?: string
}

export interface OfflineExpenseType {
  id: string
  name: string
  parentId?: string | null
}

// ─── Sync queue ───────────────────────────────────────────────────────────────

export interface SyncQueueItem {
  id: string
  seq?: number            // auto-incremented by Dexie
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  body: string            // JSON.stringify(payload)
  localId: string         // the local_ UUID of the record
  cloudId?: string        // filled after successful sync
  status: 'pending' | 'synced' | 'failed'
  createdAt: string       // ISO string
  retries: number
  errorMessage?: string
}

// ─── Categories (for scale station) ─────────────────────────────────────────

export interface OfflineCategory {
  id: string
  name: string
  colorHex: string | null
  iconName: string | null
  parentId: string | null
  productCount: number
}

// ─── Scale Order (pending sync) ─────────────────────────────────────────────

export interface OfflineScaleOrderLine {
  productId: string
  productName: string
  categoryName: string
  weight: string | null     // Null when weight step is skipped
  unit: string
  localPhotoIds: string[]   // References to photoCache table
}

// ─── Step Config Cache (for scale station) ────────────────────────────────────

export interface OfflineStepConfig {
  categoryId: string
  requireWeight: boolean
  requirePhotos: boolean
  updatedAt: string | null  // ISO timestamp
}

export interface OfflineScaleOrder {
  seq?: number                        // Auto-increment for queue order
  id: string                          // "local_" + uuid
  tempOrderNumber: string             // "PENDING-abc123"
  customerId: string | null
  casualFirstName: string | null
  casualLastName: string | null
  casualPhone: string | null
  casualIdNumber: string | null
  lines: OfflineScaleOrderLine[]
  notes: string | null
  operatorId: string
  createdAt: string                   // ISO timestamp
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed'
  cloudId?: string                    // Set after sync
  cloudOrderNumber?: string           // Set after sync
  errorMessage?: string               // Set on failure
}

// ─── Photo Cache (for offline scale orders) ─────────────────────────────────

export interface OfflinePhoto {
  id: string                          // uuid
  orderId: string                     // local order ID
  photoIndex: number                  // 0 or 1 within the line
  lineIndex: number                   // which line this photo belongs to
  blob: Blob
  syncStatus: 'pending' | 'synced' | 'failed'
  r2Key?: string                      // Set after upload
  createdAt: string
}

// ─── In-progress scale order draft (survives a reload before submission) ────
// Distinct from OfflineScaleOrder above, which represents an order that was
// already fully created while offline and is queued for sync — this table
// holds the CURRENT, not-yet-submitted step flow (src/app/scale/page.tsx's
// useState tree), so a network drop or page refresh mid-order doesn't force
// the operator to redo customer/product/weight/photos from scratch. Photo
// captures live here as real Blobs (IndexedDB, unlike localStorage, stores
// Blobs natively) until the order is actually submitted.

export interface OfflineScaleDraftCustomer {
  id: string | null
  firstName: string
  lastName: string
  phone: string
  idNumber?: string
  address?: string
  isNew?: boolean
  gateEntryId?: string
}

export interface OfflineScaleDraftProduct {
  id: string
  name: string
  unit: string
  categoryName: string
  categoryId: string
}

export interface OfflineScaleDraftCartLine {
  productId: string
  productName: string
  categoryName: string
  unit: string
  weight: string | null
  photoR2Keys: string[]
  photoBlobs?: Blob[]
}

export interface OfflineScaleDraft {
  id: 'current'                       // single-row table — only one in-progress order per device
  step: number
  customer: OfflineScaleDraftCustomer | null
  product: OfflineScaleDraftProduct | null
  productQueue: OfflineScaleDraftProduct[]
  weight: string | null
  cart: OfflineScaleDraftCartLine[]
  justAdded: OfflineScaleDraftCartLine | null
  stepConfig: { requireWeight: boolean; requirePhotos: boolean }
  savedAt: number                     // used to discard a stale draft — see scaleDraftService.ts
}

// ─── Metadata (seed timestamps, etc.) ────────────────────────────────────────

export interface OfflineMeta {
  key: string
  value: string
}

// ─── Database class ───────────────────────────────────────────────────────────

class RecycleProXDB extends Dexie {
  products!: Table<OfflineProduct>
  customers!: Table<OfflineCustomer>
  priceGroups!: Table<OfflinePriceGroup>
  priceOverrides!: Table<OfflinePriceOverride>
  categories!: Table<OfflineCategory>
  stepConfigs!: Table<OfflineStepConfig>

  purchases!: Table<OfflinePurchase>
  purchaseLines!: Table<OfflinePurchaseLine>
  sales!: Table<OfflineSale>
  saleLines!: Table<OfflineSaleLine>
  cashFloats!: Table<OfflineCashFloat>
  expenses!: Table<OfflineExpense>
  expenseTypes!: Table<OfflineExpenseType>
  payments!: Table<OfflinePayment>
  cashUps!: Table<OfflineCashUpSession>
  stockMovements!: Table<OfflineStockMovement>
  responseCache!: Table<OfflineResponseCacheEntry>

  scaleOrders!: Table<OfflineScaleOrder>
  photoCache!: Table<OfflinePhoto>
  scaleDraft!: Table<OfflineScaleDraft>

  syncQueue!: Table<SyncQueueItem>
  meta!: Table<OfflineMeta>

  constructor() {
    super('RecycleProXDB')
    this.version(1).stores({
      products:      'id, category, isActive',
      customers:     'id, idNumber, lastName, customerType, isActive',
      priceGroups:   'id, isDefault',
      priceOverrides:'id, priceGroupId, productId, [priceGroupId+productId]',

      purchases:     'id, customerId, status, createdAt',
      purchaseLines: 'id, purchaseId, productId',
      sales:         'id, customerId, status, createdAt',
      saleLines:     'id, saleId, productId',
      cashFloats:    'id, floatDate',
      expenses:      'id, status, createdAt',

      syncQueue:     '++seq, id, status, createdAt',
      meta:          'key',
    })

    // Version 2: Add categories and scale station offline support
    this.version(2).stores({
      products:       'id, category, isActive',
      customers:      'id, idNumber, lastName, customerType, isActive',
      priceGroups:    'id, isDefault',
      priceOverrides: 'id, priceGroupId, productId, [priceGroupId+productId]',
      categories:     'id, parentId, name',

      purchases:      'id, customerId, status, createdAt',
      purchaseLines:  'id, purchaseId, productId',
      sales:          'id, customerId, status, createdAt',
      saleLines:      'id, saleId, productId',
      cashFloats:     'id, floatDate',
      expenses:       'id, status, createdAt',

      scaleOrders:    '++seq, id, syncStatus, createdAt',
      photoCache:     'id, orderId, syncStatus',

      syncQueue:      '++seq, id, status, createdAt',
      meta:           'key',
    })

    // Version 3: Add step configs for category-based step configuration
    this.version(3).stores({
      products:       'id, category, isActive',
      customers:      'id, idNumber, lastName, customerType, isActive',
      priceGroups:    'id, isDefault',
      priceOverrides: 'id, priceGroupId, productId, [priceGroupId+productId]',
      categories:     'id, parentId, name',
      stepConfigs:    'categoryId',

      purchases:      'id, customerId, status, createdAt',
      purchaseLines:  'id, purchaseId, productId',
      sales:          'id, customerId, status, createdAt',
      saleLines:      'id, saleId, productId',
      cashFloats:     'id, floatDate',
      expenses:       'id, status, createdAt',

      scaleOrders:    '++seq, id, syncStatus, createdAt',
      photoCache:     'id, orderId, syncStatus',

      syncQueue:      '++seq, id, status, createdAt',
      meta:           'key',
    })

    // Version 4: Add in-progress scale order draft (survives a reload)
    this.version(4).stores({
      products:       'id, category, isActive',
      customers:      'id, idNumber, lastName, customerType, isActive',
      priceGroups:    'id, isDefault',
      priceOverrides: 'id, priceGroupId, productId, [priceGroupId+productId]',
      categories:     'id, parentId, name',
      stepConfigs:    'categoryId',

      purchases:      'id, customerId, status, createdAt',
      purchaseLines:  'id, purchaseId, productId',
      sales:          'id, customerId, status, createdAt',
      saleLines:      'id, saleId, productId',
      cashFloats:     'id, floatDate',
      expenses:       'id, status, createdAt',

      scaleOrders:    '++seq, id, syncStatus, createdAt',
      photoCache:     'id, orderId, syncStatus',
      scaleDraft:     'id',

      syncQueue:      '++seq, id, status, createdAt',
      meta:           'key',
    })

    // Version 5: Add expense types (for offline Expenses form support)
    this.version(5).stores({
      products:       'id, category, isActive',
      customers:      'id, idNumber, lastName, customerType, isActive',
      priceGroups:    'id, isDefault',
      priceOverrides: 'id, priceGroupId, productId, [priceGroupId+productId]',
      categories:     'id, parentId, name',
      stepConfigs:    'categoryId',

      purchases:      'id, customerId, status, createdAt',
      purchaseLines:  'id, purchaseId, productId',
      sales:          'id, customerId, status, createdAt',
      saleLines:      'id, saleId, productId',
      cashFloats:     'id, floatDate',
      expenses:       'id, status, createdAt',
      expenseTypes:   'id, parentId',

      scaleOrders:    '++seq, id, syncStatus, createdAt',
      photoCache:     'id, orderId, syncStatus',
      scaleDraft:     'id',

      syncQueue:      '++seq, id, status, createdAt',
      meta:           'key',
    })

    // Version 6: Full-history offline replica for the core till modules
    // (Float, Purchases, Sales, Payments, Cash-up, Customers, Products,
    // Stock) — see docs plan "Desktop offline mode — make it actually
    // work". Existing tables keep their same index signature (only the
    // TypeScript shape of their rows grew richer, which Dexie doesn't
    // version on); new tables added for Payments, Cash-up history, Stock
    // movements, and the generic last-known-response cache.
    this.version(6).stores({
      products:       'id, category, isActive',
      customers:      'id, idNumber, lastName, customerType, isActive',
      priceGroups:    'id, isDefault',
      priceOverrides: 'id, priceGroupId, productId, [priceGroupId+productId]',
      categories:     'id, parentId, name',
      stepConfigs:    'categoryId',

      purchases:      'id, customerId, status, createdAt',
      purchaseLines:  'id, purchaseId, productId',
      sales:          'id, customerId, status, createdAt',
      saleLines:      'id, saleId, productId',
      cashFloats:     'id, floatDate',
      expenses:       'id, status, createdAt',
      expenseTypes:   'id, parentId',
      payments:       'id, customerId, source, createdAt',
      cashUps:        'id, sessionDate, status',
      stockMovements: 'id, productId, direction, source, createdAt',
      responseCache:  'url, cachedAt',

      scaleOrders:    '++seq, id, syncStatus, createdAt',
      photoCache:     'id, orderId, syncStatus',
      scaleDraft:     'id',

      syncQueue:      '++seq, id, status, createdAt',
      meta:           'key',
    })
  }
}

export const offlineDB = new RecycleProXDB()
