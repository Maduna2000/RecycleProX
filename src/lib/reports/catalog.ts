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
]

export const DEALER_CATEGORY_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'dealer_1', label: 'Dealer 1' },
  { value: 'dealer_2', label: 'Dealer 2' },
  { value: 'dealer_3', label: 'Dealer 3' },
]
