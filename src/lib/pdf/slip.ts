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
  subtotalAmount?: string   // pre-VAT subtotal — shown with vatAmount when VAT was charged
  vatAmount?:      string   // VAT portion already included in totalAmount
  loanDeduction?: string    // optional loan deduction amount
  paymentMethod:  string
  cashierName:    string
  notes?:         string
  // Payment status fields
  amountPaid?:           string   // decimal string — actual amount received so far
  status?:               'completed' | 'pending' | 'partial'
  remainingLoanBalance?: string   // outstanding loan balance after this purchase's deduction
  // Split payment breakdown
  splitPayments?: {
    cash:   string
    eft:    string
    cheque: string
    loan:   string
  }
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
  if (data.vatAmount && parseFloat(data.vatAmount) > 0) {
    h += LINE_H + 2                 // Subtotal line
    h += LINE_H + 2                 // VAT line
  }
  if (data.loanDeduction && parseFloat(data.loanDeduction) > 0) {
    h += LINE_H + 2                 // gross payout line
    h += LINE_H + 2                 // loan deduction line
    if (data.remainingLoanBalance && parseFloat(data.remainingLoanBalance) > 0) {
      h += LINE_H + 2               // loan balance remaining line
    }
    h += LINE_H + 3                 // CASH TO PAY line
  } else {
    h += LINE_H + 3                 // TOTAL / TOTAL PAID / AMOUNT DUE
    if (data.status === 'partial') h += LINE_H + 3  // BALANCE DUE second line
  }
  h += LINE_H                       // payment method
  // Split payment breakdown
  if (data.splitPayments) {
    h += LINE_H                     // "Payment Breakdown:" header
    if (new Decimal(data.splitPayments.cash).greaterThan(0))   h += LINE_H
    if (new Decimal(data.splitPayments.eft).greaterThan(0))    h += LINE_H
    if (new Decimal(data.splitPayments.cheque).greaterThan(0)) h += LINE_H
    if (new Decimal(data.splitPayments.loan).greaterThan(0))   h += LINE_H
  }
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
  const chunk  = '- '
  const chunkW = font.widthOfTextAtSize(chunk, SMALL)
  const count  = Math.floor(BODY_W / chunkW)
  page.drawText(chunk.repeat(count), { x: MARGIN, y, size: SMALL, font, color: GRAY })
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
    const qtyStr  = new Decimal(line.qty).toFixed(2)
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
      const tare = `  Gross: ${new Decimal(line.grossQty).toFixed(2)}  Tare: ${new Decimal(line.tareQty).toFixed(2)}${line.tareReason ? ` (${line.tareReason})` : ''}`
      page.drawText(tare, { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
      nextLine(SMALL)
    }

    cursor -= 2
  }

  // Total Qty row (multi-item only)
  if (data.lines.length > 1) {
    const totalQty    = data.lines.reduce((sum, l) => new Decimal(sum).plus(new Decimal(l.qty)).toNumber(), 0)
    const totalQtyStr = new Decimal(totalQty).toFixed(2)
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

  if (data.vatAmount && new Decimal(data.vatAmount).greaterThan(0) && data.subtotalAmount) {
    const subStr = `E${new Decimal(data.subtotalAmount).toFixed(2)}`
    const sw = reg.widthOfTextAtSize(subStr, NORMAL)
    page.drawText('Subtotal:', { x: MARGIN,          y: cursor, size: NORMAL, font: reg, color: DGRAY })
    page.drawText(subStr,      { x: W - MARGIN - sw,  y: cursor, size: NORMAL, font: reg, color: DGRAY })
    nextLine(NORMAL, 2)

    const vatStr = `E${new Decimal(data.vatAmount).toFixed(2)}`
    const vw = reg.widthOfTextAtSize(vatStr, NORMAL)
    page.drawText('VAT (15%):', { x: MARGIN,          y: cursor, size: NORMAL, font: reg, color: DGRAY })
    page.drawText(vatStr,       { x: W - MARGIN - vw,  y: cursor, size: NORMAL, font: reg, color: DGRAY })
    nextLine(NORMAL, 2)
  }

  if (data.loanDeduction && new Decimal(data.loanDeduction).greaterThan(0)) {
    // Gross payout — label reg/gray, amount bold/black
    const gw = bold.widthOfTextAtSize(grossTotal, NORMAL)
    page.drawText('Gross Payout:', { x: MARGIN,          y: cursor, size: NORMAL, font: reg,  color: DGRAY })
    page.drawText(grossTotal,      { x: W - MARGIN - gw, y: cursor, size: NORMAL, font: bold, color: BLACK })
    nextLine(NORMAL, 2)

    // Loan deduction — label reg/gray, amount bold/black
    const deductionStr = `- E${new Decimal(data.loanDeduction).toFixed(2)}`
    const dw = bold.widthOfTextAtSize(deductionStr, NORMAL)
    page.drawText('Loan Deduction:', { x: MARGIN,          y: cursor, size: NORMAL, font: reg,  color: DGRAY })
    page.drawText(deductionStr,      { x: W - MARGIN - dw, y: cursor, size: NORMAL, font: bold, color: BLACK })
    nextLine(NORMAL, 2)

    // Loan balance remaining — only when outstanding > 0
    if (data.remainingLoanBalance && new Decimal(data.remainingLoanBalance).greaterThan(0)) {
      const remStr = `E${new Decimal(data.remainingLoanBalance).toFixed(2)}`
      const rw = reg.widthOfTextAtSize(remStr, SMALL)
      page.drawText('Loan Bal. Remaining:', { x: MARGIN,          y: cursor, size: SMALL, font: reg, color: DGRAY })
      page.drawText(remStr,                 { x: W - MARGIN - rw, y: cursor, size: SMALL, font: reg, color: DGRAY })
      nextLine(SMALL, 2)
    }

    // Cash to pay — label reg/gray, amount bold/LARGE/black
    const cashPaid = new Decimal(data.totalAmount).minus(new Decimal(data.loanDeduction))
    const cashStr  = `E${cashPaid.toFixed(2)}`
    const cw = bold.widthOfTextAtSize(cashStr, LARGE)
    page.drawText('CASH TO PAY:', { x: MARGIN,          y: cursor, size: NORMAL, font: reg,  color: DGRAY })
    page.drawText(cashStr,        { x: W - MARGIN - cw, y: cursor, size: LARGE,  font: bold, color: BLACK })
    nextLine(LARGE, 3)
  } else {
    // No loan deduction — show dynamic label based on payment status
    const isPartial   = data.status === 'partial' && data.amountPaid
    const isCompleted = data.status === 'completed'
    const isPending   = data.status === 'pending'

    const primaryLabel  = isCompleted ? 'TOTAL PAID:'
      : isPending   ? 'AMOUNT DUE:'
      : isPartial   ? 'TOTAL PAID:'
      : 'TOTAL:'
    const primaryAmount = isPartial
      ? `E${new Decimal(data.amountPaid!).toFixed(2)}`
      : grossTotal

    const tw = bold.widthOfTextAtSize(primaryAmount, LARGE)
    page.drawText(primaryLabel,  { x: MARGIN,          y: cursor, size: NORMAL, font: reg,  color: DGRAY })
    page.drawText(primaryAmount, { x: W - MARGIN - tw, y: cursor, size: LARGE,  font: bold, color: BLACK })
    nextLine(LARGE, 3)

    // Partial: also show balance due
    if (isPartial) {
      const balanceDue = new Decimal(data.totalAmount).minus(new Decimal(data.amountPaid!))
      const balStr = `E${balanceDue.toFixed(2)}`
      const bw = bold.widthOfTextAtSize(balStr, LARGE)
      page.drawText('BALANCE DUE:', { x: MARGIN,          y: cursor, size: NORMAL, font: reg,  color: DGRAY })
      page.drawText(balStr,         { x: W - MARGIN - bw, y: cursor, size: LARGE,  font: bold, color: BLACK })
      nextLine(LARGE, 3)
    }
  }

  page.drawText(`Payment: ${data.paymentMethod.toUpperCase()}`, { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
  nextLine(SMALL)

  // ── Split Payment Breakdown ───────────────────────────────────────────────
  if (data.splitPayments) {
    cursor -= 4
    page.drawText('Payment Breakdown:', { x: MARGIN, y: cursor, size: SMALL, font: bold, color: DGRAY })
    nextLine(SMALL, 2)

    const cashAmt   = new Decimal(data.splitPayments.cash   || '0')
    const eftAmt    = new Decimal(data.splitPayments.eft    || '0')
    const chequeAmt = new Decimal(data.splitPayments.cheque || '0')
    const loanAmt   = new Decimal(data.splitPayments.loan   || '0')

    if (cashAmt.greaterThan(0)) {
      const cashStr = `E${cashAmt.toFixed(2)}`
      const cw = reg.widthOfTextAtSize(cashStr, SMALL)
      page.drawText('  Cash:', { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
      page.drawText(cashStr, { x: W - MARGIN - cw, y: cursor, size: SMALL, font: reg, color: DGRAY })
      nextLine(SMALL)
    }
    if (eftAmt.greaterThan(0)) {
      const eftStr = `E${eftAmt.toFixed(2)}`
      const ew = reg.widthOfTextAtSize(eftStr, SMALL)
      page.drawText('  EFT:', { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
      page.drawText(eftStr, { x: W - MARGIN - ew, y: cursor, size: SMALL, font: reg, color: DGRAY })
      nextLine(SMALL)
    }
    if (chequeAmt.greaterThan(0)) {
      const chequeStr = `E${chequeAmt.toFixed(2)}`
      const qw = reg.widthOfTextAtSize(chequeStr, SMALL)
      page.drawText('  Cheque:', { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
      page.drawText(chequeStr, { x: W - MARGIN - qw, y: cursor, size: SMALL, font: reg, color: DGRAY })
      nextLine(SMALL)
    }
    if (loanAmt.greaterThan(0)) {
      const loanStr = `E${loanAmt.toFixed(2)}`
      const lw = reg.widthOfTextAtSize(loanStr, SMALL)
      page.drawText('  Loan Deduction:', { x: MARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
      page.drawText(loanStr, { x: W - MARGIN - lw, y: cursor, size: SMALL, font: reg, color: DGRAY })
      nextLine(SMALL)
    }
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// Purchase receipt — legacy-format PDF. Mirrors src/lib/print/thermal.ts's
// buildPurchaseReceipt field-for-field and line-for-line (same content, same
// order, same computed values) so the PDF and the thermal printout of the
// same purchase are the same receipt, just on different paper. Kept as a
// separate function from generateTransactionSlip above rather than a branch
// of it — that one is still used for sales/packing-lists, which keep their
// existing layout; only purchases move to this format.
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchaseSlipLine {
  productCode?: string
  productName:  string
  qty:          number     // net quantity ("Nett" on the slip)
  unitPrice:    string     // Decimal string ("InPrice" on the slip)
  lineTotal:    string     // Decimal string
  grossQty?:    string
  tareQty?:     string
}

export interface PurchaseSlipData {
  companyName?:    string
  companyAddress?: string
  companyPhone?:   string
  vatNumber?:      string
  refNumber:    string
  slipNo?:      string | number
  // Drives the "PAID"/"UNPAID" banner at the top — a pending (not yet
  // settled) purchase must never print as PAID.
  status:       'completed' | 'pending' | 'voided'
  customerCode?: string
  customerName:  string
  customerIdNo?: string
  customerPhone?: string
  customerVatNumber?: string
  lines:        PurchaseSlipLine[]
  totalAmount:  string
  vatAmount?:   string
  paymentMethod: string
  cashierName:   string
  scaleOperatorName?: string
  createdAt:    Date
  provisional?: boolean
  footerText?:  string
  loanDeduction?: { amount: string; reference?: string }
  splitPayments?: {
    cash:   string
    eft:    string
    cheque: string
    loan:   string
  }
}

type Font = Awaited<ReturnType<PDFDocument['embedFont']>>
type Page = ReturnType<PDFDocument['addPage']>

// A real 80mm Epson thermal printer's hardware margin is roughly 2mm each
// side (~6pt), not the wider 10pt/3.5mm the other, generic-styled slip in
// this file uses — kept as its own constant so it doesn't change that other
// receipt's layout. This is downloaded and printed via a normal Windows
// print driver rather than raw ESC/POS for now, so getting this close to
// the real hardware margin matters for the printed page to actually line up
// on the roll.
const PMARGIN  = 6
const PBODY_W  = W - PMARGIN * 2

// The legacy slip's dividers are solid printed rules, not the dashed
// separator used by generateTransactionSlip's own different visual style.
function solidLine(page: Page, y: number) {
  page.drawLine({ start: { x: PMARGIN, y }, end: { x: W - PMARGIN, y }, thickness: 0.75, color: GRAY })
}

// A thermal printer's firmware wraps long text at the paper's character
// width for free; pdf-lib draws exact pixel widths and does none of that —
// the footer declaration needs manual word-wrapping to fit the same 80mm.
function wrapText(text: string, size: number, font: Font, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function pLeftRight(page: Page, left: string, right: string, y: number, size: number, font: Font, color = BLACK) {
  page.drawText(left, { x: PMARGIN, y, size, font, color })
  const rw = font.widthOfTextAtSize(right, size)
  page.drawText(right, { x: W - PMARGIN - rw, y, size, font, color })
}

const PURCHASE_COLS: { align: 'LEFT' | 'RIGHT'; width: number }[] = [
  { align: 'LEFT',  width: 0.22 }, // Product
  { align: 'RIGHT', width: 0.16 }, // InPrice
  { align: 'RIGHT', width: 0.14 }, // Gross
  { align: 'RIGHT', width: 0.12 }, // Tare
  { align: 'RIGHT', width: 0.14 }, // Nett
  { align: 'RIGHT', width: 0.22 }, // Total
]

function pRow(page: Page, y: number, size: number, font: Font, color: ReturnType<typeof rgb>, texts: string[]) {
  let x = PMARGIN
  for (let i = 0; i < PURCHASE_COLS.length; i++) {
    const col = PURCHASE_COLS[i]!
    const colW = PBODY_W * col.width
    const text = texts[i] ?? ''
    if (col.align === 'RIGHT') {
      const tw = font.widthOfTextAtSize(text, size)
      page.drawText(text, { x: x + colW - tw, y, size, font, color })
    } else {
      page.drawText(text, { x, y, size, font, color })
    }
    x += colW
  }
}

function formatSlipDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function estimatePurchaseHeight(data: PurchaseSlipData, footerLineCount: number): number {
  let h = 14                                     // top margin
  h += LINE_H * 2                                // PAID + company name
  h += LINE_H                                    // PN No
  h += LINE_H                                    // Date
  h += LINE_H                                    // blank
  const addressSegments = (data.companyAddress ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  h += addressSegments.length * LINE_H
  if (data.companyPhone) h += LINE_H
  if (data.vatNumber)    h += LINE_H
  if (data.provisional)  h += LINE_H
  h += 10                                         // divider

  h += LINE_H                                    // Done By
  if (data.scaleOperatorName) h += LINE_H
  h += LINE_H                                    // Rep
  h += LINE_H                                    // blank

  h += LINE_H                                    // Cust
  h += LINE_H                                    // Cust VAT
  h += LINE_H                                    // blank
  if (data.customerIdNo)    h += LINE_H
  if (data.customerPhone)   h += LINE_H

  h += LINE_H                                    // table header
  h += data.lines.length * LINE_H * 2             // code/price row + name row per line
  h += 10                                         // divider

  h += (LINE_H + 2) * 4                           // Nett Total, Total, 15% VAT, Grand Total

  const cashAmt   = new Decimal(data.splitPayments?.cash   ?? '0')
  const eftAmt    = new Decimal(data.splitPayments?.eft    ?? '0')
  const chequeAmt = new Decimal(data.splitPayments?.cheque ?? '0')
  const loanAmt   = new Decimal(data.splitPayments?.loan   ?? data.loanDeduction?.amount ?? '0')
  const hasSplit  = cashAmt.gt(0) || eftAmt.gt(0) || chequeAmt.gt(0) || loanAmt.gt(0)
  if (hasSplit) {
    h += LINE_H                                   // blank
    h += LINE_H                                   // "Payment Split:"
    if (cashAmt.gt(0))   h += LINE_H
    if (eftAmt.gt(0))    h += LINE_H
    if (chequeAmt.gt(0)) h += LINE_H
    if (loanAmt.gt(0))   h += LINE_H
  }

  if (data.slipNo !== undefined) h += LINE_H * 2  // blank + Slip No.
  h += LINE_H                                     // blank before footer
  h += footerLineCount * LINE_H
  h += 10                                          // final divider
  h += 16                                          // bottom margin
  return Math.max(h, 300)
}

export async function generatePurchaseReceiptPdf(data: PurchaseSlipData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)

  const footerLines = data.footerText ? wrapText(data.footerText, SMALL, reg, PBODY_W) : []
  const docHeight = estimatePurchaseHeight(data, footerLines.length)
  const page = doc.addPage([W, docHeight])

  let cursor = docHeight - 14
  const nextLine = (size = NORMAL, gap = 2) => { cursor -= (size + gap) }

  // ── Header ─────────────────────────────────────────────────────────────
  center(page, data.status === 'completed' ? 'PAID' : 'UNPAID', cursor, NORMAL, bold, BLACK)
  nextLine(NORMAL, 2)
  center(page, (data.companyName || 'Golden Key Investments (Pty) Ltd').toUpperCase(), cursor, NORMAL, bold, BLACK)
  nextLine(NORMAL, 2)

  page.drawText(`PN No: ${data.refNumber}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
  nextLine(NORMAL)
  page.drawText(`Date: ${formatSlipDate(data.createdAt)}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
  nextLine(NORMAL, 6)

  const addressSegments = (data.companyAddress ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const segment of addressSegments) {
    page.drawText(segment, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
    nextLine(NORMAL)
  }
  if (data.companyPhone) {
    page.drawText(`Tel: ${data.companyPhone}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
    nextLine(NORMAL)
  }
  if (data.vatNumber) {
    page.drawText(`VAT No.: ${data.vatNumber}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
    nextLine(NORMAL)
  }
  if (data.provisional) {
    page.drawText('*** PROVISIONAL - PENDING SYNC ***', { x: PMARGIN, y: cursor, size: NORMAL, font: bold, color: BLACK })
    nextLine(NORMAL)
  }

  cursor -= 2
  solidLine(page, cursor)
  cursor -= 10

  // ── People ─────────────────────────────────────────────────────────────
  page.drawText(`Done By: ${data.cashierName}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
  nextLine(NORMAL)
  if (data.scaleOperatorName) {
    page.drawText(`Scale Op: ${data.scaleOperatorName}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
    nextLine(NORMAL)
  }
  page.drawText('Rep:', { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
  nextLine(NORMAL, 6)

  // ── Party ──────────────────────────────────────────────────────────────
  const custLine = data.customerCode ? `${data.customerCode}-${data.customerName}` : data.customerName
  page.drawText(`Cust: ${custLine}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
  nextLine(NORMAL)
  page.drawText(`Cust VAT: ${data.customerVatNumber ?? ''}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
  nextLine(NORMAL, 6)
  if (data.customerIdNo) {
    page.drawText(`ID: ${data.customerIdNo}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
    nextLine(NORMAL)
  }
  if (data.customerPhone) {
    page.drawText(`Phone: ${data.customerPhone}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
    nextLine(NORMAL)
  }

  // ── Line items ─────────────────────────────────────────────────────────
  pRow(page, cursor, SMALL, bold, DGRAY, ['Product', 'InPrice', 'Gross', 'Tare', 'Nett', 'Total'])
  nextLine(SMALL, 4)

  for (const line of data.lines) {
    pRow(page, cursor, NORMAL, reg, BLACK, [
      (line.productCode ?? '').substring(0, 10),
      new Decimal(line.unitPrice).toFixed(2),
      line.grossQty ?? '',
      line.tareQty ?? '0',
      String(line.qty),
      new Decimal(line.lineTotal).toFixed(2),
    ])
    nextLine(NORMAL)
    page.drawText(` ${line.productName}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
    nextLine(NORMAL)
  }

  cursor -= 2
  solidLine(page, cursor)
  cursor -= 10

  // ── Totals ─────────────────────────────────────────────────────────────
  const nettTotal  = data.lines.reduce((acc, l) => acc.plus(l.qty || 0), new Decimal(0))
  const total      = new Decimal(data.totalAmount)
  const vat        = new Decimal(data.vatAmount ?? '0')
  const grandTotal = total.plus(vat)

  pLeftRight(page, 'Nett Total', nettTotal.toFixed(1), cursor, NORMAL, reg, BLACK)
  nextLine(NORMAL, 2)
  pLeftRight(page, 'Total', `E ${total.toFixed(2)}`, cursor, NORMAL, reg, BLACK)
  nextLine(NORMAL, 2)
  pLeftRight(page, '15% VAT', `E ${vat.toFixed(2)}`, cursor, NORMAL, reg, BLACK)
  nextLine(NORMAL, 2)
  pLeftRight(page, 'Grand Total', `E ${grandTotal.toFixed(2)}`, cursor, NORMAL, bold, BLACK)
  nextLine(NORMAL, 3)

  // ── Payment split ──────────────────────────────────────────────────────
  const cashAmt   = new Decimal(data.splitPayments?.cash   ?? '0')
  const eftAmt    = new Decimal(data.splitPayments?.eft    ?? '0')
  const chequeAmt = new Decimal(data.splitPayments?.cheque ?? '0')
  const loanAmt   = new Decimal(data.splitPayments?.loan   ?? data.loanDeduction?.amount ?? '0')
  const loanRef   = data.splitPayments ? data.loanDeduction?.reference : data.loanDeduction?.reference

  if (cashAmt.gt(0) || eftAmt.gt(0) || chequeAmt.gt(0) || loanAmt.gt(0)) {
    nextLine(NORMAL, 0)
    page.drawText('Payment Split:', { x: PMARGIN, y: cursor, size: NORMAL, font: bold, color: BLACK })
    nextLine(NORMAL, 2)
    if (cashAmt.gt(0)) {
      pLeftRight(page, 'Cash', `E ${cashAmt.toFixed(2)}`, cursor, NORMAL, reg, BLACK)
      nextLine(NORMAL)
    }
    if (eftAmt.gt(0)) {
      pLeftRight(page, 'EFT', `E ${eftAmt.toFixed(2)}`, cursor, NORMAL, reg, BLACK)
      nextLine(NORMAL)
    }
    if (chequeAmt.gt(0)) {
      pLeftRight(page, 'Cheque', `E ${chequeAmt.toFixed(2)}`, cursor, NORMAL, reg, BLACK)
      nextLine(NORMAL)
    }
    if (loanAmt.gt(0)) {
      pLeftRight(page, 'Loans', `E ${loanAmt.toFixed(2)}${loanRef ? ` #${loanRef}` : ''}`, cursor, NORMAL, reg, BLACK)
      nextLine(NORMAL)
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  if (data.slipNo !== undefined) {
    nextLine(NORMAL, 0)
    page.drawText(`Slip No. ${data.slipNo}`, { x: PMARGIN, y: cursor, size: NORMAL, font: reg, color: BLACK })
    nextLine(NORMAL)
  }
  nextLine(NORMAL, 0)
  for (const fLine of footerLines) {
    page.drawText(fLine, { x: PMARGIN, y: cursor, size: SMALL, font: reg, color: GRAY })
    nextLine(SMALL)
  }
  cursor -= 2
  solidLine(page, cursor)

  return doc.save()
}
