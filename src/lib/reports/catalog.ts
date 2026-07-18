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
  | 'text'

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
  accounts: 'Accounts & Pricing',
  compliance: 'Police & Compliance',
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
    id: 'loans-outstanding',
    label: 'Outstanding Loans',
    description:
      'Every loan still owing as at the end date: principal, amount repaid, and outstanding balance per customer.',
    area: 'cash',
    filters: [{ key: 'customerId', label: 'Customer', type: 'customer' }],
  },
  {
    id: 'loan-payments',
    label: 'Loan Payments',
    description:
      'Per customer: opening loan balance, each repayment with the purchase note that funded it, and running balance for the period.',
    area: 'cash',
    filters: [{ key: 'customerId', label: 'Customer', type: 'customer' }],
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
  // ── Stock ──────────────────────────────────────────────────────────────────
  {
    id: 'stock-on-hand',
    label: 'Stock On Hand Report',
    description:
      'On-hand quantity per product as at the end of the selected period, grouped by category and valued at buy or sell price.',
    area: 'stock',
    filters: [
      {
        key: 'valuation', label: 'Valuation', type: 'select',
        options: [
          { value: 'buy', label: 'Buy price (cost)' },
          { value: 'sell', label: 'Sell price' },
        ],
      },
    ],
  },
  {
    id: 'stock-movement',
    label: 'Stock Movement Report',
    description:
      'Opening balance, in, out, and closing per product for the period — or per-movement detail (purchases, sales, adjustments, stocktakes).',
    area: 'stock',
    filters: [
      {
        key: 'mode', label: 'Mode', type: 'select',
        options: [
          { value: 'summary', label: 'Summary (per product)' },
          { value: 'detail', label: 'Detail (per movement)' },
        ],
      },
      { key: 'productId', label: 'Product', type: 'product' },
    ],
  },
  {
    id: 'stocktake-report',
    label: 'Stock Take Report',
    description:
      'Every stocktake session in the period with per-product system quantity, counted quantity, and variance.',
    area: 'stock',
    filters: [
      {
        key: 'status', label: 'Status', type: 'select',
        options: [
          { value: 'open', label: 'Open' },
          { value: 'completed', label: 'Completed' },
          { value: 'all', label: 'All (not voided)' },
        ],
      },
    ],
  },
  // ── Accounts & Pricing ─────────────────────────────────────────────────────
  {
    id: 'dealers-price-list',
    label: 'Dealers Price List',
    description:
      'Current buy price for every product, grouped by category, for Casual and each Dealer tier (1–3).',
    area: 'accounts',
    filters: [],
  },
  {
    id: 'account-list',
    label: 'Account List',
    description:
      'Every account (dealer) customer as at the selected date: company, registration/VAT numbers, price group, and contact details.',
    area: 'accounts',
    filters: [],
  },
  {
    id: 'casual-list',
    label: 'Casual List',
    description:
      'Every casual (walk-in) seller as at the selected date: name, ID number, phone, and police register number.',
    area: 'accounts',
    filters: [],
  },
  // ── Purchases: seller lookups ──────────────────────────────────────────────
  {
    id: 'purchases-by-casual-id',
    label: 'Purchases by Casual ID',
    description:
      'Search a casual seller by ID number or a transaction by reference number and list their matching purchases with line detail and totals.',
    area: 'purchases',
    filters: [
      { key: 'idNumber', label: 'ID Number (partial)', type: 'text' },
      { key: 'refNumber', label: 'Transaction No. (partial)', type: 'text' },
      { key: 'customerId', label: 'Casual Seller', type: 'customer' },
    ],
  },
  {
    id: 'purchases-by-account-id',
    label: 'Purchases by Account ID',
    description:
      'Search an account (dealer) by ID number or a transaction by reference number and list their matching purchases with line detail and totals.',
    area: 'purchases',
    filters: [
      { key: 'idNumber', label: 'ID Number (partial)', type: 'text' },
      { key: 'refNumber', label: 'Transaction No. (partial)', type: 'text' },
      { key: 'customerId', label: 'Account', type: 'customer' },
    ],
  },
  {
    id: 'top-sellers-by-category',
    label: 'Top 10 Sellers by Category',
    description:
      'Top 10 Casual or Account sellers ranked by total weight brought in, shown as two sections in one report: Ferrous and Non-Ferrous.',
    area: 'purchases',
    filters: [
      {
        key: 'customerType', label: 'Seller Type', type: 'select', required: true,
        options: [
          { value: 'casual', label: 'Casual' },
          { value: 'account', label: 'Account' },
        ],
      },
    ],
  },
  // ── Police & Compliance ────────────────────────────────────────────────────
  {
    id: 'police-register',
    label: 'Police Register',
    description:
      'Every purchase in the period in police register format: reference, supplier name, ID number, address, items, and amount paid.',
    area: 'compliance',
    filters: [],
  },
  {
    id: 'police-copper-report',
    label: 'Police Copper Report',
    description:
      'Every purchase containing Copper-family products in the period: reference, seller name, company, casual name, ID number, and net kg.',
    area: 'compliance',
    filters: [
      { key: 'idNumber', label: 'Customer ID Number (partial)', type: 'text' },
    ],
  },
  {
    id: 'police-copper-report-images',
    label: 'Police Copper Report with Images',
    description:
      'The Police Copper Report plus the scale-station photo for each transaction, where the purchase was linked to a scale order.',
    area: 'compliance',
    filters: [
      { key: 'idNumber', label: 'Customer ID Number (partial)', type: 'text' },
    ],
  },
]

export const DEALER_CATEGORY_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'dealer_1', label: 'Dealer 1' },
  { value: 'dealer_2', label: 'Dealer 2' },
  { value: 'dealer_3', label: 'Dealer 3' },
]
