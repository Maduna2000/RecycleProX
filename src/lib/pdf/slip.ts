/**
 * PDF transaction slip generator using pdf-lib.
 * Returns a Uint8Array (PDF bytes) — caller can stream or save to R2.
 *
 * Server-side only.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SlipLine {
  productName: string
  qty:         number
  unitPrice:   string
  lineTotal:   string
}

export interface TransactionSlipData {
  type:          'PURCHASE' | 'SALE'
  refNumber:     string
  date:          Date
  partyLabel:    string    // 'Supplier' or 'Buyer'
  partyName:     string
  partyIdNumber?: string
  partyPhone?:   string
  lines:         SlipLine[]
  totalAmount:   string
  paymentMethod: string
  cashierName:   string
  notes?:        string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_W  = 595   // A4 width in points
const PAGE_H  = 842   // A4 height in points
const MARGIN  = 50
const COL_W   = PAGE_W - MARGIN * 2

const GREEN  = rgb(0.11, 0.53, 0.22)
const DARK   = rgb(0.1, 0.1, 0.1)
const GRAY   = rgb(0.5, 0.5, 0.5)
const LGRAY  = rgb(0.95, 0.95, 0.95)
const WHITE  = rgb(1, 1, 1)
const RED    = rgb(0.8, 0.1, 0.1)

// ─── Helper: draw horizontal rule ────────────────────────────────────────────
function hRule(page: ReturnType<PDFDocument['addPage']>, y: number, color = GRAY) {
  page.drawLine({
    start: { x: MARGIN, y },
    end:   { x: PAGE_W - MARGIN, y },
    thickness: 0.5,
    color,
  })
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateTransactionSlip(data: TransactionSlipData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])

  const bold   = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg    = await doc.embedFont(StandardFonts.Helvetica)

  let y = PAGE_H - MARGIN

  // ── Green header bar ──────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: GREEN })

  page.drawText('RecycleProX', {
    x: MARGIN, y: PAGE_H - 40, size: 22, font: bold, color: WHITE,
  })
  page.drawText('LARIAT TECHNOLOGIES', {
    x: MARGIN, y: PAGE_H - 58, size: 9, font: reg, color: rgb(0.8, 1, 0.8),
  })

  // Type badge (top-right)
  const typeLabel = data.type === 'PURCHASE' ? 'PURCHASE RECEIPT' : 'SALES RECEIPT'
  const typeW = bold.widthOfTextAtSize(typeLabel, 11)
  page.drawText(typeLabel, {
    x: PAGE_W - MARGIN - typeW, y: PAGE_H - 45, size: 11, font: bold, color: WHITE,
  })

  y = PAGE_H - 100

  // ── Ref + Date ────────────────────────────────────────────────────────────
  page.drawText(`Ref: ${data.refNumber}`, { x: MARGIN, y, size: 10, font: bold, color: DARK })
  const dateStr = data.date.toLocaleString('en-ZA')
  const dateW   = reg.widthOfTextAtSize(dateStr, 9)
  page.drawText(dateStr, { x: PAGE_W - MARGIN - dateW, y, size: 9, font: reg, color: GRAY })

  y -= 6
  hRule(page, y)
  y -= 16

  // ── Party info ────────────────────────────────────────────────────────────
  page.drawText(`${data.partyLabel}: ${data.partyName}`, { x: MARGIN, y, size: 10, font: reg, color: DARK })
  y -= 14
  if (data.partyIdNumber) {
    page.drawText(`ID Number: ${data.partyIdNumber}`, { x: MARGIN, y, size: 9, font: reg, color: GRAY })
    y -= 14
  }
  if (data.partyPhone) {
    page.drawText(`Phone: ${data.partyPhone}`, { x: MARGIN, y, size: 9, font: reg, color: GRAY })
    y -= 14
  }
  y -= 6
  hRule(page, y)
  y -= 18

  // ── Line items header ─────────────────────────────────────────────────────
  page.drawRectangle({ x: MARGIN, y: y - 4, width: COL_W, height: 18, color: LGRAY })

  const colX = {
    item:  MARGIN + 4,
    qty:   MARGIN + COL_W * 0.55,
    price: MARGIN + COL_W * 0.70,
    total: MARGIN + COL_W * 0.85,
  }

  page.drawText('Item',       { x: colX.item,  y, size: 9, font: bold, color: DARK })
  page.drawText('Qty',        { x: colX.qty,   y, size: 9, font: bold, color: DARK })
  page.drawText('Unit Price', { x: colX.price, y, size: 9, font: bold, color: DARK })
  page.drawText('Total',      { x: colX.total, y, size: 9, font: bold, color: DARK })

  y -= 20

  // ── Line items ────────────────────────────────────────────────────────────
  for (const line of data.lines) {
    // Wrap long product names
    const name = line.productName.length > 40 ? line.productName.substring(0, 38) + '…' : line.productName

    page.drawText(name,                                          { x: colX.item,  y, size: 9, font: reg, color: DARK })
    page.drawText(String(line.qty),                              { x: colX.qty,   y, size: 9, font: reg, color: DARK })
    page.drawText(`R ${new Decimal(line.unitPrice).toFixed(2)}`, { x: colX.price, y, size: 9, font: reg, color: DARK })
    page.drawText(`R ${new Decimal(line.lineTotal).toFixed(2)}`, { x: colX.total, y, size: 9, font: reg, color: DARK })

    y -= 16

    // Page overflow guard (basic — does not add pages)
    if (y < MARGIN + 120) break
  }

  y -= 4
  hRule(page, y, DARK)
  y -= 20

  // ── Totals ────────────────────────────────────────────────────────────────
  const total = `R ${new Decimal(data.totalAmount).toFixed(2)}`
  const totalW = bold.widthOfTextAtSize(total, 14)
  page.drawText('TOTAL',  { x: MARGIN, y, size: 12, font: bold, color: DARK })
  page.drawText(total,    { x: PAGE_W - MARGIN - totalW, y, size: 14, font: bold, color: data.type === 'PURCHASE' ? RED : GREEN })

  y -= 18
  page.drawText(`Payment Method: ${data.paymentMethod.toUpperCase()}`, { x: MARGIN, y, size: 9, font: reg, color: GRAY })

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (data.notes) {
    y -= 16
    page.drawText(`Notes: ${data.notes}`, { x: MARGIN, y, size: 9, font: reg, color: GRAY })
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  y = MARGIN + 50
  hRule(page, y + 10)
  page.drawText(`Cashier: ${data.cashierName}`, { x: MARGIN, y, size: 9, font: reg, color: GRAY })
  page.drawText('www.lariat.co.za · Pretoria, South Africa', {
    x: MARGIN, y: y - 14, size: 8, font: reg, color: GRAY,
  })

  return doc.save()
}
