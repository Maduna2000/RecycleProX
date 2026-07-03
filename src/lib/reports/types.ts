/**
 * Shared report document model.
 *
 * A report builder (server) produces a ReportDocument; the PDF engine, the
 * Excel engine, and the on-screen preview all consume it (via flatten.ts) —
 * data is shaped once and rendered three ways. Everything in this file is
 * client-safe: no Prisma, no Node-only imports.
 */

export type ReportArea = 'purchases' | 'sales' | 'cash' | 'stock'

/** How a column's raw cell string should be rendered. */
export type ColumnFormat =
  | 'money'    // 2 dp, currency symbol, space-grouped thousands (E3 976.00)
  | 'mass'     // 2 dp quantity/weight
  | 'qty'      // 2 dp quantity
  | 'int'      // whole number
  | 'date'     // yyyy/mm/dd (SAST)
  | 'time'     // HH:mm:ss (SAST)
  | 'datetime' // yyyy/mm/dd HH:mm (SAST)
  | 'text'

export interface ReportColumn {
  key: string
  label: string
  /** Fraction of PDF content width (all columns should sum to ~1). */
  width: number
  align?: 'left' | 'right' | 'center'
  format?: ColumnFormat
  /** Excel column width in characters. */
  excelWidth?: number
}

/**
 * Raw cell values keyed by column key. Numbers travel as plain strings
 * (Decimal.toFixed output) — renderers apply format/symbol at display time.
 * Dates travel as ISO strings.
 */
export interface ReportRow {
  cells: Record<string, string | null>
}

export interface ReportGroup {
  /** 0-based nesting depth. */
  level: number
  /** Band text, e.g. "DEALER 1", "NON-FERROUS", "Ticket 005580". */
  label: string
  /** Secondary band text, e.g. "PAID · Cash · 13:48" on a ticket group. */
  meta?: string
  /** Branch groups (mutually exclusive with rows). */
  groups?: ReportGroup[]
  /** Leaf data rows. */
  rows?: ReportRow[]
  /** Totals for measure columns at this level, keyed by column key. */
  subtotal?: Record<string, string>
}

export interface ReportSummaryLine {
  label: string
  value: string
  emphasis?: boolean
}

export interface ReportMeta {
  generatedAt: string // ISO
  generatedBy: string
  company: {
    name: string
    address: string
    phone?: string
    vat?: string
  }
  currencySymbol: string
  /** Count of data rows across all groups. */
  rowCount: number
}

export interface ReportDocument {
  reportId: string
  title: string
  subtitle?: string
  params: {
    from: string
    to: string
    filters?: Record<string, string>
  }
  columns: ReportColumn[]
  groups: ReportGroup[]
  grandTotal?: Record<string, string>
  /** Optional key-figure block rendered after the table (e.g. profit lines). */
  summary?: ReportSummaryLine[]
  meta: ReportMeta
}

/** Flattened render stream — what the PDF/Excel/preview renderers walk. */
export type FlatRowType = 'groupHeader' | 'data' | 'subtotal' | 'grandTotal'

export interface FlatRow {
  type: FlatRowType
  level: number
  label?: string
  meta?: string
  cells?: Record<string, string | null>
}
