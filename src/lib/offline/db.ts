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

export interface OfflinePurchase {
  id: string              // local_ prefixed UUID when created offline
  refNumber: string
  customerId: string
  status: string
  totalAmount: string
  paymentMethod: string
  notes?: string
  loanDeductionAmount?: string
  createdByUserId?: string
  createdAt: string       // ISO string
  _offlineCreated?: boolean
  _cloudId?: string       // set after sync
}

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
  paymentMethod: string
  notes?: string
  createdByUserId?: string
  createdAt: string
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

  purchases!: Table<OfflinePurchase>
  purchaseLines!: Table<OfflinePurchaseLine>
  sales!: Table<OfflineSale>
  saleLines!: Table<OfflineSaleLine>
  cashFloats!: Table<OfflineCashFloat>
  expenses!: Table<OfflineExpense>

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
  }
}

export const offlineDB = new RecycleProXDB()
