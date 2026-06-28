/**
 * Cash-Up Report PDF generator.
 *
 * Generates professional A4 PDF reports for various cashup reconciliation data:
 * - Cash Sales
 * - Cash Purchases
 * - Account Payments
 * - Expenses
 * - Loan Advances
 * - Loan Repayments
 * - Unpaid Purchases (Today / All Time)
 * - Card Sales
 * - Transferred Purchases
 * - Drawings Received
 *
 * Returns Uint8Array (PDF bytes). Server-side only.
 */
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib'
import Decimal from 'decimal.js'
import type { CashupReportType } from '@/lib/schemas/cashup'
import { CASHUP_REPORT_LABELS } from '@/lib/schemas/cashup'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CashupReportData {
  reportType: CashupReportType
  sessionDate: Date
  currency: string
  currencySymbol: string
  companyName: string
  companyAddress: string
  companyPhone?: string
  companyVat?: string
  generatedAt: Date
  entries: ReportEntry[]
}

export interface ReportEntry {
  [key: string]: string | Date | number | null | undefined
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_W = 595   // A4 portrait
const PAGE_H = 842
const MARGIN = 40
const CONTENT_W = PAGE_W - MARGIN * 2

const NAVY = rgb(0.11, 0.23, 0.42)      // #1B3A6B
const GREEN = rgb(0.06, 0.72, 0.51)     // #10b981
const DARK = rgb(0.13, 0.15, 0.16)
const GRAY = rgb(0.42, 0.46, 0.49)
const LGRAY = rgb(0.96, 0.96, 0.96)
const WHITE = rgb(1, 1, 1)
const RED = rgb(0.75, 0.1, 0.1)

const ROWS_PER_PAGE = 30
const ROW_H = 18
const HEADER_ROW_H = 22

// Column configurations for each report type
interface ColumnConfig {
  key: string
  label: string
  width: number  // fraction of CONTENT_W
  align?: 'left' | 'right' | 'center'
}

const REPORT_COLUMNS: Record<CashupReportType, ColumnConfig[]> = {
  'cash-sales': [
    { key: 'refNumber', label: 'Ref', width: 0.12 },
    { key: 'time', label: 'Time', width: 0.10 },
    { key: 'customerName', label: 'Customer', width: 0.22 },
    { key: 'description', label: 'Items', width: 0.36 },
    { key: 'totalAmount', label: 'Total', width: 0.20, align: 'right' },
  ],
  'cash-purchases': [
    { key: 'refNumber', label: 'Ref', width: 0.10 },
    { key: 'time', label: 'Time', width: 0.08 },
    { key: 'supplierName', label: 'Supplier', width: 0.20 },
    { key: 'supplierId', label: 'ID', width: 0.15 },
    { key: 'items', label: 'Items', width: 0.30 },
    { key: 'totalAmount', label: 'Total', width: 0.17, align: 'right' },
  ],
  'account-payments': [
    { key: 'refNumber', label: 'Ref', width: 0.15 },
    { key: 'time', label: 'Time', width: 0.12 },
    { key: 'customerName', label: 'Customer', width: 0.28 },
    { key: 'notes', label: 'Notes', width: 0.25 },
    { key: 'amount', label: 'Amount', width: 0.20, align: 'right' },
  ],
  'expenses': [
    { key: 'refNumber', label: 'Ref', width: 0.12 },
    { key: 'typeName', label: 'Type', width: 0.18 },
    { key: 'description', label: 'Description', width: 0.32 },
    { key: 'paymentMethod', label: 'Method', width: 0.15 },
    { key: 'amount', label: 'Amount', width: 0.23, align: 'right' },
  ],
  'loan-advances': [
    { key: 'refNumber', label: 'Ref', width: 0.15 },
    { key: 'time', label: 'Time', width: 0.12 },
    { key: 'customerName', label: 'Customer', width: 0.28 },
    { key: 'customerId', label: 'ID', width: 0.20 },
    { key: 'principalAmount', label: 'Principal', width: 0.25, align: 'right' },
  ],
  'loan-repayments': [
    { key: 'id', label: '#', width: 0.08 },
    { key: 'time', label: 'Time', width: 0.12 },
    { key: 'customerName', label: 'Customer', width: 0.28 },
    { key: 'loanRefNumber', label: 'Loan Ref', width: 0.27 },
    { key: 'amount', label: 'Amount', width: 0.25, align: 'right' },
  ],
  'unpaid-today': [
    { key: 'refNumber', label: 'Ref', width: 0.12 },
    { key: 'time', label: 'Time', width: 0.10 },
    { key: 'supplierName', label: 'Supplier', width: 0.26 },
    { key: 'totalAmount', label: 'Total', width: 0.17, align: 'right' },
    { key: 'amountPaid', label: 'Paid', width: 0.17, align: 'right' },
    { key: 'balance', label: 'Balance', width: 0.18, align: 'right' },
  ],
  'unpaid-all': [
    { key: 'refNumber', label: 'Ref', width: 0.10 },
    { key: 'date', label: 'Date', width: 0.12 },
    { key: 'supplierName', label: 'Supplier', width: 0.26 },
    { key: 'totalAmount', label: 'Total', width: 0.17, align: 'right' },
    { key: 'amountPaid', label: 'Paid', width: 0.17, align: 'right' },
    { key: 'balance', label: 'Balance', width: 0.18, align: 'right' },
  ],
  'card-sales': [
    { key: 'refNumber', label: 'Ref', width: 0.15 },
    { key: 'time', label: 'Time', width: 0.12 },
    { key: 'customerName', label: 'Customer', width: 0.30 },
    { key: 'paymentMethod', label: 'Method', width: 0.18 },
    { key: 'totalAmount', label: 'Total', width: 0.25, align: 'right' },
  ],
  'transferred-purchases': [
    { key: 'refNumber', label: 'Ref', width: 0.15 },
    { key: 'time', label: 'Time', width: 0.12 },
    { key: 'supplierName', label: 'Supplier', width: 0.28 },
    { key: 'bankRef', label: 'Bank Ref', width: 0.20 },
    { key: 'totalAmount', label: 'Total', width: 0.25, align: 'right' },
  ],
  'drawings-received': [
    { key: 'id', label: '#', width: 0.10 },
    { key: 'time', label: 'Time', width: 0.15 },
    { key: 'movementType', label: 'Type', width: 0.25 },
    { key: 'notes', label: 'Notes', width: 0.25 },
    { key: 'amount', label: 'Amount', width: 0.25, align: 'right' },
  ],
}

// Amount field names for calculating totals
const AMOUNT_FIELDS: Record<CashupReportType, string> = {
  'cash-sales': 'totalAmount',
  'cash-purchases': 'totalAmount',
  'account-payments': 'amount',
  'expenses': 'amount',
  'loan-advances': 'principalAmount',
  'loan-repayments': 'amount',
  'unpaid-today': 'balance',
  'unpaid-all': 'balance',
  'card-sales': 'totalAmount',
  'transferred-purchases': 'totalAmount',
  'drawings-received': 'amount',
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateCashupReport(data: CashupReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)

  const columns = REPORT_COLUMNS[data.reportType]
  const amountField = AMOUNT_FIELDS[data.reportType]

  // Calculate grand total
  const grandTotal = data.entries.reduce(
    (acc, e) => acc.plus(new Decimal(String(e[amountField] ?? '0'))),
    new Decimal(0)
  )

  // Paginate entries
  const chunks: ReportEntry[][] = []
  for (let i = 0; i < Math.max(1, data.entries.length); i += ROWS_PER_PAGE) {
    chunks.push(data.entries.slice(i, i + ROWS_PER_PAGE))
  }

  const totalPages = chunks.length

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = doc.addPage([PAGE_W, PAGE_H])
    const rows = chunks[pageIdx] ?? []
    let y = PAGE_H - MARGIN

    // ── Header bar ────────────────────────────────────────────────────────────
    y = drawHeader(page, bold, reg, data, pageIdx, totalPages)

    // ── Company info (first page only) ────────────────────────────────────────
    if (pageIdx === 0) {
      y = drawCompanyInfo(page, bold, reg, data, y)
    }

    // ── Column headers ────────────────────────────────────────────────────────
    y = drawColumnHeaders(page, bold, columns, y, data.currencySymbol)

    // ── Data rows ─────────────────────────────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i]!
      const bg = i % 2 === 0 ? WHITE : LGRAY
      page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: ROW_H, color: bg })

      let x = MARGIN
      for (const col of columns) {
        const colW = col.width * CONTENT_W
        let value = formatValue(entry, col.key, data.currencySymbol)

        // Truncate if too long
        const maxChars = Math.floor(colW / 4.5)
        if (value.length > maxChars) {
          value = value.substring(0, maxChars - 1) + '…'
        }

        const textX = col.align === 'right'
          ? x + colW - reg.widthOfTextAtSize(value, 8) - 4
          : x + 4

        page.drawText(value, {
          x: textX,
          y: y,
          size: 8,
          font: reg,
          color: DARK,
        })

        x += colW
      }

      y -= ROW_H
    }

    // ── Bottom rule ───────────────────────────────────────────────────────────
    page.drawLine({
      start: { x: MARGIN, y: y + 2 },
      end: { x: PAGE_W - MARGIN, y: y + 2 },
      thickness: 0.5,
      color: GRAY,
    })
    y -= 16

    // ── Summary on last page ──────────────────────────────────────────────────
    if (pageIdx === totalPages - 1) {
      y = drawSummary(page, bold, reg, data, grandTotal, y)
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    page.drawText(`Generated: ${data.generatedAt.toLocaleString('en-ZA')} · RecycleProX · Lariat Technologies`, {
      x: MARGIN,
      y: MARGIN - 10,
      size: 6,
      font: reg,
      color: GRAY,
    })
  }

  return doc.save()
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function drawHeader(
  page: PDFPage,
  bold: PDFFont,
  reg: PDFFont,
  data: CashupReportData,
  pageIdx: number,
  totalPages: number
): number {
  const y = PAGE_H - MARGIN

  // Navy header bar
  page.drawRectangle({ x: 0, y: PAGE_H - 55, width: PAGE_W, height: 55, color: NAVY })

  // Report title
  const title = CASHUP_REPORT_LABELS[data.reportType].toUpperCase()
  page.drawText(title, {
    x: MARGIN,
    y: PAGE_H - 28,
    size: 14,
    font: bold,
    color: WHITE,
  })

  // Subtitle
  page.drawText('Cash-Up Session Report', {
    x: MARGIN,
    y: PAGE_H - 44,
    size: 8,
    font: reg,
    color: rgb(0.7, 0.8, 1),
  })

  // Session date (right side)
  const dateStr = data.sessionDate.toLocaleDateString('en-ZA', { dateStyle: 'full' })
  const dateWidth = bold.widthOfTextAtSize(dateStr, 10)
  page.drawText(dateStr, {
    x: PAGE_W - MARGIN - dateWidth,
    y: PAGE_H - 28,
    size: 10,
    font: bold,
    color: WHITE,
  })

  // Page number
  const pageText = `Page ${pageIdx + 1} of ${totalPages}`
  page.drawText(pageText, {
    x: PAGE_W - MARGIN - reg.widthOfTextAtSize(pageText, 8),
    y: PAGE_H - 44,
    size: 8,
    font: reg,
    color: rgb(0.7, 0.8, 1),
  })

  return PAGE_H - 65
}

function drawCompanyInfo(
  page: PDFPage,
  bold: PDFFont,
  reg: PDFFont,
  data: CashupReportData,
  y: number
): number {
  page.drawText(data.companyName, {
    x: MARGIN,
    y,
    size: 10,
    font: bold,
    color: DARK,
  })
  y -= 12

  page.drawText(data.companyAddress, {
    x: MARGIN,
    y,
    size: 8,
    font: reg,
    color: GRAY,
  })

  // Phone and VAT on same line if available
  let infoLine = ''
  if (data.companyPhone) infoLine += `Tel: ${data.companyPhone}`
  if (data.companyVat) infoLine += (infoLine ? ' | ' : '') + `VAT: ${data.companyVat}`
  if (infoLine) {
    y -= 10
    page.drawText(infoLine, {
      x: MARGIN,
      y,
      size: 8,
      font: reg,
      color: GRAY,
    })
  }

  return y - 16
}

function drawColumnHeaders(
  page: PDFPage,
  bold: PDFFont,
  columns: ColumnConfig[],
  y: number,
  currencySymbol: string
): number {
  // Green header row
  page.drawRectangle({ x: MARGIN, y: y - 6, width: CONTENT_W, height: HEADER_ROW_H, color: GREEN })

  let x = MARGIN
  for (const col of columns) {
    const colW = col.width * CONTENT_W
    let label = col.label

    // Append currency symbol to amount columns
    if (col.align === 'right' && !label.includes('(')) {
      label = `${label} (${currencySymbol})`
    }

    page.drawText(label, {
      x: x + 4,
      y: y,
      size: 8,
      font: bold,
      color: WHITE,
    })

    x += colW
  }

  return y - HEADER_ROW_H - 4
}

function drawSummary(
  page: PDFPage,
  bold: PDFFont,
  reg: PDFFont,
  data: CashupReportData,
  grandTotal: Decimal,
  y: number
): number {
  // Summary row with green background
  page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 24, color: rgb(0.9, 0.97, 0.94) })
  page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 24, borderColor: GREEN, borderWidth: 1 })

  page.drawText(`Total Records: ${data.entries.length}`, {
    x: MARGIN + 8,
    y: y + 2,
    size: 9,
    font: reg,
    color: DARK,
  })

  const totalText = `Grand Total: ${data.currencySymbol} ${grandTotal.toFixed(2)}`
  page.drawText(totalText, {
    x: PAGE_W - MARGIN - bold.widthOfTextAtSize(totalText, 11) - 8,
    y: y + 2,
    size: 11,
    font: bold,
    color: data.reportType.includes('unpaid') ? RED : GREEN,
  })

  return y - 30
}

function formatValue(entry: ReportEntry, key: string, currencySymbol: string): string {
  const value = entry[key]

  if (value === null || value === undefined) {
    return '—'
  }

  // Handle Date objects
  if (value instanceof Date) {
    if (key === 'time' || key.toLowerCase().includes('time')) {
      return value.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    }
    return value.toLocaleDateString('en-ZA')
  }

  // Handle createdAt specifically (stored as Date but accessed as time)
  if (key === 'time' && entry['createdAt'] instanceof Date) {
    return entry['createdAt'].toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
  }

  // Handle date field
  if (key === 'date' && entry['createdAt'] instanceof Date) {
    return entry['createdAt'].toLocaleDateString('en-ZA')
  }

  // Handle amount fields - format with currency symbol
  if (typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value)) {
    const isAmountField = ['totalAmount', 'amount', 'principalAmount', 'balance', 'amountPaid'].includes(key)
    if (isAmountField) {
      return `${currencySymbol} ${new Decimal(value).toFixed(2)}`
    }
  }

  return String(value)
}
