/**
 * Client-safe report catalog — drives the Reports UI (catalog cards and
 * parameter panels) and names the ids the server registry must implement.
 * The registry imports this so ids/labels can never drift.
 */
import type { ReportArea } from './types'

export type FilterType =
  | 'dealerCategory'
  | 'customer'
  | 'product'
  | 'cashup'
  | 'select'

export interface FilterSpec {
  key: string
  label: string
  type: FilterType
  required?: boolean
  /** For type 'select'. */
  options?: { value: string; label: string }[]
}

export interface ReportCatalogEntry {
  id: string
  label: string
  description: string
  area: ReportArea
  filters: FilterSpec[]
}

export const REPORT_AREA_LABELS: Record<ReportArea, string> = {
  purchases: 'Purchases',
  sales: 'Sales',
  cash: 'Cash & Financial',
  stock: 'Stock',
}

export const REPORT_CATALOG: ReportCatalogEntry[] = [
  // ── Purchases ──────────────────────────────────────────────────────────────
  {
    id: 'purchases-by-product-category',
    label: 'Purchases per Product Summary per Account Category',
    description:
      'Purchased mass and value per product, grouped by account category (Casual / Dealer 1–3) and product category, with VAT and totals at every level.',
    area: 'purchases',
    filters: [
      { key: 'dealerCategory', label: 'Account Category', type: 'dealerCategory' },
    ],
  },
  {
    id: 'purchases-daily',
    label: 'Daily Purchases Report',
    description:
      'Every purchase ticket in the period, grouped by supplier with line detail, payment status and type, and totals per ticket and supplier.',
    area: 'purchases',
    filters: [
      { key: 'customerId', label: 'Supplier', type: 'customer' },
    ],
  },
  {
    id: 'purchases-supplier-statement',
    label: 'Paid Purchases per Supplier Statement',
    description:
      'One supplier’s paid purchases grouped by product, with weighbridge full/empty masses, VAT, and totals per product.',
    area: 'purchases',
    filters: [
      { key: 'customerId', label: 'Supplier', type: 'customer', required: true },
    ],
  },
  {
    id: 'purchases-per-product-day',
    label: 'Purchases per Product per Day',
    description:
      'Chronological purchase transactions under each product (grouped by category), with per-product and per-category totals.',
    area: 'purchases',
    filters: [
      { key: 'productId', label: 'Product', type: 'product' },
    ],
  },
  // ── Sales ──────────────────────────────────────────────────────────────────
  {
    id: 'sales-daily',
    label: 'Daily Sales Report',
    description:
      'Every sale in the period, grouped by buyer with line detail, payment status and type, and totals per ticket and buyer.',
    area: 'sales',
    filters: [
      { key: 'customerId', label: 'Customer', type: 'customer' },
    ],
  },
  {
    id: 'sales-by-product',
    label: 'Sales per Product Summary',
    description:
      'Sold mass and revenue per product, grouped by product category, with weighted average price, VAT, and totals at every level.',
    area: 'sales',
    filters: [],
  },
  {
    id: 'sales-by-customer',
    label: 'Sales per Customer',
    description:
      'One row per sale under each buyer: date, reference, payment method and status, VAT, total, and outstanding balance.',
    area: 'sales',
    filters: [
      { key: 'customerId', label: 'Customer', type: 'customer' },
    ],
  },
  // ── Cash & Financial ───────────────────────────────────────────────────────
  {
    id: 'cashup-history',
    label: 'Cash-Up History',
    description:
      'One row per cash-up session: opening balance, system cash sales/purchases, expenses, expected vs declared cash, and variance.',
    area: 'cash',
    filters: [],
  },
  {
    id: 'expenses',
    label: 'Expenses Report',
    description:
      'Expenses grouped by category (parent → sub-type) with description, payment method, VAT, and totals per category.',
    area: 'cash',
    filters: [
      {
        key: 'status', label: 'Status', type: 'select',
        options: [
          { value: 'approved', label: 'Approved' },
          { value: 'pending', label: 'Pending' },
          { value: 'all', label: 'All (not voided)' },
        ],
      },
    ],
  },
  {
    id: 'float-log',
    label: 'Float Log Report',
    description:
      'Float movements per day — opening, top-ups, withdrawals, adjustments — with time, reference, running balance, and day totals.',
    area: 'cash',
    filters: [],
  },
  {
    id: 'cash-on-hand',
    label: 'Cash on Hand Report',
    description:
      'Denomination counts (R200 → 50c) declared at each submitted/approved cash-up, with counted total vs declared cash and variance.',
    area: 'cash',
    filters: [],
  },
  {
    id: 'loan-book',
    label: 'Loan Book Report',
    description:
      'Advances and repayments per customer in chronological order with a running balance — repayments reference their purchase note.',
    area: 'cash',
    filters: [
      { key: 'customerId', label: 'Customer', type: 'customer' },
      {
        key: 'status', label: 'Loan Status', type: 'select',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'settled', label: 'Settled' },
          { value: 'all', label: 'All (not voided)' },
        ],
      },
    ],
  },
  {
    id: 'profit-summary',
    label: 'Profit Summary',
    description:
      'Revenue vs cost of goods vs expenses: gross profit, net profit, margin, and the loan book position for the period.',
    area: 'cash',
    filters: [],
  },
  {
    id: 'vat-summary',
    label: 'VAT Summary',
    description:
      'Daily output VAT (sales) against input VAT (purchases and expenses) with the net VAT position for the period.',
    area: 'cash',
    filters: [],
  },
  {
    id: 'cancelled-transactions',
    label: 'Cancelled / Voided Transactions',
    description:
      'All voided purchases and sales in the period with who they were for, the void reason, and amounts.',
    area: 'cash',
    filters: [],
  },
]

export const DEALER_CATEGORY_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'dealer_1', label: 'Dealer 1' },
  { value: 'dealer_2', label: 'Dealer 2' },
  { value: 'dealer_3', label: 'Dealer 3' },
]
