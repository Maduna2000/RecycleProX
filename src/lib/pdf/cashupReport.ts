/**
 * Cash-Up Report PDF generator.
 *
 * Generates professional A4 PDF reports in black & white spreadsheet format:
 * - Cash Sales
 * - Cash Purchases
 * - Account Payments
 * - Expenses
 * - Loan Advances
 * - Loan Repayments
 * - Unpaid Purchases (Today / All)
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

// ─── Constants (Black & White) ────────────────────────────────────────────────
const PAGE_W = 595   // A4 portrait
const PAGE_H = 842
const MARGIN = 40
const CONTENT_W = PAGE_W - MARGIN * 2

// Black and white colors only
const BLACK = rgb(0, 0, 0)
const DARK_GRAY = rgb(0.25, 0.25, 0.25)
const MEDIUM_GRAY = rgb(0.5, 0.5, 0.5)
const LIGHT_GRAY = rgb(0.85, 0.85, 0.85)
const VERY_LIGHT_GRAY = rgb(0.95, 0.95, 0.95)

const ROWS_PER_PAGE = 28
const ROW_H = 20
const HEADER_ROW_H = 22
const CELL_PADDING = 4
const BORDER_WIDTH = 0.5

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

    // ── Header section ─────────────────────────────────────────────────────────
    y = drawHeader(page, bold, reg, data, pageIdx, totalPages, y)

    // ── Company info (first page only) ────────────────────────────────────────
    if (pageIdx === 0) {
      y = drawCompanyInfo(page, bold, reg, data, y)
    }

    // ── Table header with borders ──────────────────────────────────────────────
    y = drawTableHeader(page, bold, columns, y, data.currencySymbol)

    // ── Data rows with cell borders ────────────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i]!
      const isAlternate = i % 2 === 1
      y = drawDataRow(page, reg, columns, entry, y, data.currencySymbol, isAlternate)
    }

    // ── Close table bottom border ──────────────────────────────────────────────
    page.drawLine({
      start: { x: MARGIN, y: y + ROW_H },
      end: { x: PAGE_W - MARGIN, y: y + ROW_H },
      thickness: BORDER_WIDTH,
      color: BLACK,
    })

    // ── Summary on last page ──────────────────────────────────────────────────
    if (pageIdx === totalPages - 1) {
      y = drawSummary(page, bold, reg, data, grandTotal, y)
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    drawFooter(page, reg, data)
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
  totalPages: number,
  y: number
): number {
  // Report title (black text, no background)
  const title = CASHUP_REPORT_LABELS[data.reportType].toUpperCase()
  page.drawText(title, {
    x: MARGIN,
    y,
    size: 14,
    font: bold,
    color: BLACK,
  })

  // Session date (right side)
  const dateStr = data.sessionDate.toLocaleDateString('en-ZA', { dateStyle: 'full' })
  const dateWidth = bold.widthOfTextAtSize(dateStr, 10)
  page.drawText(dateStr, {
    x: PAGE_W - MARGIN - dateWidth,
    y,
    size: 10,
    font: bold,
    color: BLACK,
  })

  y -= 14

  // Subtitle
  page.drawText('Cash-Up Session Report', {
    x: MARGIN,
    y,
    size: 8,
    font: reg,
    color: MEDIUM_GRAY,
  })

  // Page number
  const pageText = `Page ${pageIdx + 1} of ${totalPages}`
  page.drawText(pageText, {
    x: PAGE_W - MARGIN - reg.widthOfTextAtSize(pageText, 8),
    y,
    size: 8,
    font: reg,
    color: MEDIUM_GRAY,
  })

  // Horizontal line separator
  y -= 8
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1,
    color: BLACK,
  })

  return y - 12
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
    color: BLACK,
  })
  y -= 12

  page.drawText(data.companyAddress, {
    x: MARGIN,
    y,
    size: 8,
    font: reg,
    color: DARK_GRAY,
  })

  // Phone and VAT on same line if available
  let infoLine = ''
  if (data.companyPhone) infoLine += `Tel: ${data.companyPhone}`
  if (data.companyVat) infoLine += (infoLine ? '  |  ' : '') + `VAT: ${data.companyVat}`
  if (infoLine) {
    y -= 10
    page.drawText(infoLine, {
      x: MARGIN,
      y,
      size: 8,
      font: reg,
      color: DARK_GRAY,
    })
  }

  return y - 16
}

function drawTableHeader(
  page: PDFPage,
  bold: PDFFont,
  columns: ColumnConfig[],
  y: number,
  currencySymbol: string
): number {
  const headerY = y - HEADER_ROW_H

  // Header background (light gray)
  page.drawRectangle({
    x: MARGIN,
    y: headerY,
    width: CONTENT_W,
    height: HEADER_ROW_H,
    color: LIGHT_GRAY,
  })

  // Draw outer border
  page.drawRectangle({
    x: MARGIN,
    y: headerY,
    width: CONTENT_W,
    height: HEADER_ROW_H,
    borderColor: BLACK,
    borderWidth: BORDER_WIDTH,
  })

  // Draw column borders and text
  let x = MARGIN
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!
    const colW = col.width * CONTENT_W

    // Draw vertical line (except for first column)
    if (i > 0) {
      page.drawLine({
        start: { x, y: headerY },
        end: { x, y: headerY + HEADER_ROW_H },
        thickness: BORDER_WIDTH,
        color: BLACK,
      })
    }

    // Column label
    let label = col.label
    if (col.align === 'right' && !label.includes('(')) {
      label = `${label} (${currencySymbol})`
    }

    const textY = headerY + (HEADER_ROW_H - 8) / 2
    const textX = col.align === 'right'
      ? x + colW - bold.widthOfTextAtSize(label, 8) - CELL_PADDING
      : x + CELL_PADDING

    page.drawText(label, {
      x: textX,
      y: textY,
      size: 8,
      font: bold,
      color: BLACK,
    })

    x += colW
  }

  return headerY
}

function drawDataRow(
  page: PDFPage,
  reg: PDFFont,
  columns: ColumnConfig[],
  entry: ReportEntry,
  y: number,
  currencySymbol: string,
  isAlternate: boolean
): number {
  const rowY = y - ROW_H

  // Alternate row background
  if (isAlternate) {
    page.drawRectangle({
      x: MARGIN,
      y: rowY,
      width: CONTENT_W,
      height: ROW_H,
      color: VERY_LIGHT_GRAY,
    })
  }

  // Draw cell borders
  let x = MARGIN
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!
    const colW = col.width * CONTENT_W

    // Draw vertical line (except for first column)
    if (i > 0) {
      page.drawLine({
        start: { x, y: rowY },
        end: { x, y: rowY + ROW_H },
        thickness: BORDER_WIDTH,
        color: BLACK,
      })
    }

    // Cell value
    let value = formatValue(entry, col.key, currencySymbol)

    // Truncate if too long
    const maxChars = Math.floor((colW - CELL_PADDING * 2) / 4.5)
    if (value.length > maxChars) {
      value = value.substring(0, maxChars - 1) + '…'
    }

    const textY = rowY + (ROW_H - 8) / 2
    const textX = col.align === 'right'
      ? x + colW - reg.widthOfTextAtSize(value, 8) - CELL_PADDING
      : x + CELL_PADDING

    page.drawText(value, {
      x: textX,
      y: textY,
      size: 8,
      font: reg,
      color: BLACK,
    })

    x += colW
  }

  // Draw left and right borders
  page.drawLine({
    start: { x: MARGIN, y: rowY },
    end: { x: MARGIN, y: rowY + ROW_H },
    thickness: BORDER_WIDTH,
    color: BLACK,
  })
  page.drawLine({
    start: { x: PAGE_W - MARGIN, y: rowY },
    end: { x: PAGE_W - MARGIN, y: rowY + ROW_H },
    thickness: BORDER_WIDTH,
    color: BLACK,
  })

  return rowY
}

function drawSummary(
  page: PDFPage,
  bold: PDFFont,
  reg: PDFFont,
  data: CashupReportData,
  grandTotal: Decimal,
  y: number
): number {
  y -= 8

  // Summary row with border
  const summaryH = 24
  page.drawRectangle({
    x: MARGIN,
    y: y - summaryH,
    width: CONTENT_W,
    height: summaryH,
    color: LIGHT_GRAY,
    borderColor: BLACK,
    borderWidth: 1,
  })

  const textY = y - summaryH + (summaryH - 9) / 2

  page.drawText(`Total Records: ${data.entries.length}`, {
    x: MARGIN + CELL_PADDING,
    y: textY,
    size: 9,
    font: reg,
    color: BLACK,
  })

  const totalText = `Grand Total: ${data.currencySymbol} ${grandTotal.toFixed(2)}`
  page.drawText(totalText, {
    x: PAGE_W - MARGIN - bold.widthOfTextAtSize(totalText, 11) - CELL_PADDING,
    y: textY,
    size: 11,
    font: bold,
    color: BLACK,
  })

  return y - summaryH - 8
}

function drawFooter(page: PDFPage, reg: PDFFont, data: CashupReportData): void {
  const footerText = `Generated: ${data.generatedAt.toLocaleString('en-ZA')}  |  Renovo Pro  |  Golden Key Investments (Pty) Ltd`
  page.drawText(footerText, {
    x: MARGIN,
    y: MARGIN - 10,
    size: 6,
    font: reg,
    color: MEDIUM_GRAY,
  })
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

  // Handle time field - extract from createdAt if available
  if (key === 'time') {
    const createdAt = entry['createdAt']
    if (createdAt instanceof Date) {
      return createdAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    }
    // Try parsing as ISO string
    if (typeof createdAt === 'string') {
      const d = new Date(createdAt)
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
      }
    }
  }

  // Handle date field - extract from createdAt if available
  if (key === 'date') {
    const createdAt = entry['createdAt']
    if (createdAt instanceof Date) {
      return createdAt.toLocaleDateString('en-ZA')
    }
    if (typeof createdAt === 'string') {
      const d = new Date(createdAt)
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-ZA')
      }
    }
  }

  // Handle amount fields - format with currency symbol
  if (typeof value === 'string' && /^-?\d+(\.\d{1,2})?$/.test(value)) {
    const isAmountField = ['totalAmount', 'amount', 'principalAmount', 'balance', 'amountPaid'].includes(key)
    if (isAmountField) {
      return `${currencySymbol} ${new Decimal(value).toFixed(2)}`
    }
  }

  // Handle numbers
  if (typeof value === 'number') {
    const isAmountField = ['totalAmount', 'amount', 'principalAmount', 'balance', 'amountPaid'].includes(key)
    if (isAmountField) {
      return `${currencySymbol} ${new Decimal(value).toFixed(2)}`
    }
    return value.toString()
  }

  return String(value)
}
