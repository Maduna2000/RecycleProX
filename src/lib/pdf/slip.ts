/**
 * Thermal-style receipt PDF generator using pdf-lib.
 * Produces a narrow 80 mm (226 pt) wide receipt that looks like a POS printout.
 * Returns Uint8Array — caller can stream, open in browser, or save to R2.
 *
 * Server-side only.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlipLine {
  productName: string
  qty:         number
  unitPrice:   string   // Decimal string
  lineTotal:   string   // Decimal string
  grossQty?:   number
  tareQty?:    number
  tareReason?: string
}

export interface TransactionSlipData {
  type:           'PURCHASE' | 'SALE'
  refNumber:      string
  date:           Date
  partyLabel:     string    // 'Supplier' or 'Buyer'
  partyName:      string
  partyIdNumber?: string
  partyPhone?:    string
  lines:          SlipLine[]
  totalAmount:    string
  loanDeduction?: string    // optional loan deduction amount
  paymentMethod:  string
  cashierName:    string
  notes?:         string
  // Company details from SystemSettings
  companyName?:   string
  companyAddress?:string
  companyPhone?:  string
  vatNumber?:     string
  receiptFooter?: string
}

// ─── Layout constants (80 mm paper @ 72 dpi) ─────────────────────────────────
const W        = 227   // 80 mm in pt (80 × 2.8346)
const MARGIN   = 10
const BODY_W   = W - MARGIN * 2
const LINE_H   = 12    // normal text line height
const SMALL    = 7     // small font size
const NORMAL   = 8     // normal font size
const LARGE    = 10    // section title size
const HUGE     = 13    // company name size

const BLACK  = rgb(0,    0,    0)
const DGRAY  = rgb(0.2,  0.2,  0.2)
const GRAY   = rgb(0.45, 0.45, 0.45)

// ─── Height estimation ────────────────────────────────────────────────────────
function estimateHeight(data: TransactionSlipData): number {
  let h = 0
  h += 14                           // top margin
  h += HUGE + 4                     // company name
  if (data.companyAddress) h += LINE_H
  if (data.companyPhone)   h += LINE_H
  if (data.vatNumber)      h += LINE_H
  h += 8                            // divider
  h += LINE_H                       // receipt type
  h += LINE_H                       // ref
  h += LINE_H                       // date
  h += 8                            // divider
  h += LINE_H                       // party name
  if (data.partyIdNumber)  h += LINE_H
  if (data.partyPhone)     h += LINE_H
  h += 8                            // divider
  h += LINE_H                       // column headers
  h += 4
  for (const line of data.lines) {
    h += LINE_H                     // product name + qty + total
    h += LINE_H                     // @ unit price
    if (line.grossQty && line.tareQty) h += LINE_H  // tare detail
    h += 3                          // small gap between items
  }
  if (data.lines.length > 1) h += LINE_H  // Total Qty row
  h += 8                            // divider
  h += LINE_H + 3                   // TOTAL bold
  if (data.loanDeduction && parseFloat(data.loanDeduction) > 0) {
    h += LINE_H                     // loan deduction line
    h += LINE_H                     // cash paid line
  }
  h += LINE_H                       // payment method
  if (data.notes) h += LINE_H * 2
  h += 8                            // divider
  h += LINE_H                       // cashier
  h += LINE_H                       // thank you
  if (data.receiptFooter) h += LINE_H
  h += LINE_H                       // company website
  h += 20                           // bottom margin
  return Math.max(h, 300)
}

// ─── Draw a dashed line ───────────────────────────────────────────────────────
function dashes(page: ReturnType<PDFDocument['addPage']>, y: number, font: Awaited<ReturnType<PDFDocument['embedFont']>>) {
  const text = '- '.repeat(22)
  page.drawText(text.substring(0, 38), {
    x: MARGIN, y, size: SMALL, font, color: GRAY,
  })
}

// ─── Center text ─────────────────────────────────────────────────────────────
function center(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  y: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  color = BLACK,
) {
  const tw = font.widthOfTextAtSize(text, size)
  const x  = Math.max(MARGIN, (W - tw) / 2)
  page.drawText(text, { x, y, size, font, color })
}

// ─── Left-right pair (item and price on same line) ────────────────────────────
function leftRight(
  page: ReturnType<PDFDocument['addPage']>,
  left: string,
  right: string,
  y: number,
  size: number,
  leftFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
  rightFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
  color = DGRAY,
) {
  const rw = rightFont.widthOfTextAtSize(right, size)
  page.drawText(left,  { x: MARGIN,           y, size, font: leftFont,  color })
  page.drawText(right, { x: W - MARGIN - rw,  y, size, font: rightFont, color })
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateTransactionSlip(data: TransactionSlipData): Promise<Uint8Array> {
  const docHeight = estimateHeight(data)
  const doc  = await PDFDocument.create()
  const page = doc.addPage([W, docHeight])

  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)

  // pdf-lib draws from bottom-left — track cursor from top
  let cursor = docHeight - 14

  function nextLine(size = NORMAL, gap = 2) {
    cursor -= (size + gap)
  }

  // ── Company header (centered) ─────────────────────────────────────────────
  const companyName = data.companyName || 'Renovo Pro'
  center(page, companyName, cursor, HUGE, bold, BLACK)
  nextLine(HUGE, 4)

  if (data.companyAddress) {
    center(page, data.companyAddress, cursor, SMALL, reg, GRAY)
    nextLine(SMALL)
  }
  if (data.companyPhone) {
    center(page, `Tel: ${data.companyPhone}`, cursor, SMALL, reg, GRAY)
    nextLine(SMALL)
  }
  if (data.vatNumber) {
    center(page, `VAT: ${data.vatNumber}`, cursor, SMALL, reg, GRAY)
    nextLine(SMALL)
  }

  cursor -= 4
  dashes(page, cursor, reg)
  cursor -= 6

  // ── Receipt type ──────────────────────────────────────────────────────────
  const typeLabel = data.type === 'PURCHASE' ? '*** PURCHASE RECEIPT ***' : '*** SALES RECEIPT ***'
  center(page, typeLabel, cursor, NORMAL, bold, BLACK)
  nextLine(NORMAL, 2)

  center(page, `Ref: ${data.refNumber}`, cursor, SMALL, reg, DGRAY)
  nextLine(SMALL)

  const dateStr = data.date.toLocaleString('en-ZA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  center(page, dateStr, cursor, SMALL, reg, GRAY)
  nextLine(SMALL)

  cursor -= 4
  dashes(page, cursor, reg)
  cursor -= 6

  // ── Party info ────────────────────────────────────────────────────────────
  page.drawText(`${data.partyLabel}: ${data.partyName}`, { x: MARGIN, y: cursor, size: NORMAL, font: bold, color: BLACK })
  nextLine(NORMAL)

  if (data.partyIdNumber) {
    page.drawText(`ID: ${data.partyIdNumber}`, { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
    nextLine(SMALL)
  }
  if (data.partyPhone) {
    page.drawText(`Phone: ${data.partyPhone}`, { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
    nextLine(SMALL)
  }

  cursor -= 4
  dashes(page, cursor, reg)
  cursor -= 6

  // ── Item column headers ───────────────────────────────────────────────────
  const QTY_RIGHT   = MARGIN + Math.floor(BODY_W * 0.72)
  const qtyHdrW     = bold.widthOfTextAtSize('Qty', SMALL)
  const totalHdrW   = bold.widthOfTextAtSize('Total', SMALL)
  page.drawText('Description', { x: MARGIN,                    y: cursor, size: SMALL, font: bold, color: DGRAY })
  page.drawText('Qty',         { x: QTY_RIGHT - qtyHdrW,       y: cursor, size: SMALL, font: bold, color: DGRAY })
  page.drawText('Total',       { x: W - MARGIN - totalHdrW,    y: cursor, size: SMALL, font: bold, color: DGRAY })
  nextLine(SMALL, 4)

  // ── Line items ────────────────────────────────────────────────────────────
  for (const line of data.lines) {
    // Product name (truncate to fit)
    const maxNameChars = 26
    const name = line.productName.length > maxNameChars
      ? line.productName.substring(0, maxNameChars - 1) + '…'
      : line.productName

    // Row 1: name + qty in column + total
    const lineTotal = `E${new Decimal(line.lineTotal).toFixed(2)}`
    const lw      = bold.widthOfTextAtSize(lineTotal, NORMAL)
    const qtyStr  = new Decimal(line.qty).toFixed(3)
    const qw      = reg.widthOfTextAtSize(qtyStr, NORMAL)
    page.drawText(name,      { x: MARGIN,               y: cursor, size: NORMAL, font: reg,  color: BLACK })
    page.drawText(qtyStr,    { x: QTY_RIGHT - qw,        y: cursor, size: NORMAL, font: reg,  color: DGRAY })
    page.drawText(lineTotal, { x: W - MARGIN - lw,       y: cursor, size: NORMAL, font: bold, color: BLACK })
    nextLine(NORMAL, 1)

    // Row 2: unit price only (qty already shown in column above)
    const qtyLabel = `  @ E${new Decimal(line.unitPrice).toFixed(2)}`
    page.drawText(qtyLabel, { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
    nextLine(SMALL)

    // Row 3: tare info (if any)
    if (line.grossQty && line.tareQty && line.tareQty > 0) {
      const tare = `  Gross: ${new Decimal(line.grossQty).toFixed(3)}  Tare: ${new Decimal(line.tareQty).toFixed(3)}${line.tareReason ? ` (${line.tareReason})` : ''}`
      page.drawText(tare, { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
      nextLine(SMALL)
    }

    cursor -= 2
  }

  // Total Qty row (multi-item only)
  if (data.lines.length > 1) {
    const totalQty    = data.lines.reduce((sum, l) => new Decimal(sum).plus(new Decimal(l.qty)).toNumber(), 0)
    const totalQtyStr = new Decimal(totalQty).toFixed(3)
    const tqw         = bold.widthOfTextAtSize(totalQtyStr, SMALL)
    page.drawText('Total Qty:',  { x: MARGIN,          y: cursor, size: SMALL, font: reg,  color: DGRAY })
    page.drawText(totalQtyStr,   { x: QTY_RIGHT - tqw, y: cursor, size: SMALL, font: bold, color: DGRAY })
    nextLine(SMALL, 3)
  }

  cursor -= 2
  dashes(page, cursor, reg)
  cursor -= 8

  // ── Totals ────────────────────────────────────────────────────────────────
  const grossTotal = `E${new Decimal(data.totalAmount).toFixed(2)}`

  if (data.loanDeduction && new Decimal(data.loanDeduction).greaterThan(0)) {
    // Gross payout
    leftRight(page, 'Gross Payout:', grossTotal, cursor, NORMAL, reg, reg, DGRAY)
    nextLine(NORMAL, 2)

    // Loan deduction
    const deduction = `- E${new Decimal(data.loanDeduction).toFixed(2)}`
    leftRight(page, 'Loan Deduction:', deduction, cursor, NORMAL, reg, reg, GRAY)
    nextLine(NORMAL, 2)

    // Cash to pay
    const cashPaid = new Decimal(data.totalAmount).minus(new Decimal(data.loanDeduction))
    const cashStr  = `E${cashPaid.toFixed(2)}`
    const cw = bold.widthOfTextAtSize(cashStr, LARGE)
    page.drawText('CASH TO PAY:', { x: MARGIN,          y: cursor, size: LARGE, font: bold, color: BLACK })
    page.drawText(cashStr,        { x: W - MARGIN - cw, y: cursor, size: LARGE, font: bold, color: BLACK })
    nextLine(LARGE, 3)
  } else {
    const tw = bold.widthOfTextAtSize(grossTotal, LARGE)
    page.drawText('TOTAL:',    { x: MARGIN,          y: cursor, size: LARGE, font: bold, color: BLACK })
    page.drawText(grossTotal,  { x: W - MARGIN - tw, y: cursor, size: LARGE, font: bold, color: BLACK })
    nextLine(LARGE, 3)
  }

  page.drawText(`Payment: ${data.paymentMethod.toUpperCase()}`, { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
  nextLine(SMALL)

  if (data.notes) {
    cursor -= 4
    page.drawText(`Note: ${data.notes}`.substring(0, 38), { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
    nextLine(SMALL)
  }

  cursor -= 4
  dashes(page, cursor, reg)
  cursor -= 8

  // ── Footer ────────────────────────────────────────────────────────────────
  center(page, `Cashier: ${data.cashierName}`, cursor, SMALL, reg, GRAY)
  nextLine(SMALL, 2)

  center(page, 'Thank you for your business!', cursor, SMALL, reg, GRAY)
  nextLine(SMALL, 2)

  if (data.receiptFooter) {
    center(page, data.receiptFooter, cursor, SMALL, reg, GRAY)
    nextLine(SMALL, 2)
  }

  center(page, 'Powered by Renovo Pro', cursor, SMALL, reg, GRAY)

  return doc.save()
}
