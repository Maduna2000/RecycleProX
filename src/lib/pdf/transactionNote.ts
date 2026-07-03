/**
 * Purchase Note / Sale Note — a proper A4 transaction document, generated for
 * every completed purchase or sale. Styled in the spirit of the VAT264 form
 * (colored header band, labeled field boxes) with the company logo when one
 * is configured in Settings, full line detail (weighbridge masses, per-line
 * VAT), a totals panel, and payment information. Server-side only.
 */
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, PDFImage } from 'pdf-lib'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NoteLine {
  code: string
  name: string
  unit: string
  unitPrice: string
  grossQty?: string | null
  tareQty?: string | null
  quantity: string
  vat: string
  lineTotal: string // incl. VAT
}

export interface TransactionNoteData {
  type: 'PURCHASE NOTE' | 'SALE NOTE'
  refNumber: string
  date: Date
  status: string // PAID | UNPAID | PARTIAL | VOIDED

  company: { name: string; address: string; phone?: string; vat?: string }
  /** Transparent PNG bytes from Settings, drawn in the header when present. */
  logoPng?: Uint8Array | null

  partyLabel: string // 'Supplier' | 'Buyer'
  partyName: string
  partyIdNumber?: string
  partyPhone?: string
  partyAddress?: string

  vehicleReg?: string
  wbTicketNumber?: string

  lines: NoteLine[]

  subTotal: string
  vatAmount: string
  grandTotal: string
  loanDeduction?: string
  amountPaid?: string
  balanceDue?: string

  paymentMethod: string
  splitPayments?: { cash?: string; eft?: string; cheque?: string; loan?: string } | null
  notes?: string

  generatedAt: Date
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 50
const COL_W = PAGE_W - MARGIN * 2

const NAVY = rgb(0.11, 0.23, 0.42) // matches the app's #1B3A6B primary
const NAVY_LIGHT = rgb(0.85, 0.89, 0.95)
const DARK = rgb(0.07, 0.07, 0.07)
const GRAY = rgb(0.45, 0.45, 0.45)
const LGRAY = rgb(0.94, 0.94, 0.94)
const WHITE = rgb(1, 1, 1)

const ROW_H = 16
const BOTTOM_LIMIT = MARGIN + 40

interface Fonts { bold: PDFFont; reg: PDFFont }

function money(v: string | undefined | null): string {
  if (v === undefined || v === null || v === '') return '0.00'
  return new Decimal(v).toFixed(2)
}

function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\xFF–—‘’“”•…]/g, '?')
}

function drawField(page: PDFPage, label: string, value: string, x: number, y: number, width: number, fonts: Fonts) {
  page.drawRectangle({ x, y: y - 14, width, height: 18, color: LGRAY, borderColor: GRAY, borderWidth: 0.5 })
  page.drawText(label, { x: x + 4, y: y + 2, size: 7, font: fonts.reg, color: GRAY })
  const maxChars = Math.floor((width - 8) / 4.6)
  let text = sanitize(value || '—')
  if (text.length > maxChars) text = text.slice(0, maxChars - 1) + '…'
  page.drawText(text, { x: x + 4, y: y - 9, size: 9, font: fonts.bold, color: DARK })
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateTransactionNote(data: TransactionNoteData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const fonts: Fonts = { bold, reg }

  let logo: PDFImage | null = null
  if (data.logoPng && data.logoPng.length > 0) {
    try {
      logo = await doc.embedPng(data.logoPng)
    } catch {
      logo = null // never fail the note over a bad logo
    }
  }

  const pages: PDFPage[] = []
  let page = doc.addPage([PAGE_W, PAGE_H])
  pages.push(page)

  // ── Header band ─────────────────────────────────────────────────────────────
  const HEADER_H = 86
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: NAVY })

  let textX = MARGIN
  if (logo) {
    // Fit the logo into a 44pt-high box, preserving aspect ratio, on a white
    // chip so dark logos stay visible against the navy band
    const maxH = 44
    const maxW = 160
    const scale = Math.min(maxH / logo.height, maxW / logo.width)
    const w = logo.width * scale
    const h = logo.height * scale
    const pad = 5
    page.drawRectangle({
      x: MARGIN - pad, y: PAGE_H - 18 - h - pad,
      width: w + pad * 2, height: h + pad * 2, color: WHITE,
    })
    page.drawImage(logo, { x: MARGIN, y: PAGE_H - 18 - h, width: w, height: h })
    textX = MARGIN
  }

  const companyY = logo ? PAGE_H - 72 : PAGE_H - 32
  page.drawText(sanitize(data.company.name), {
    x: textX, y: companyY, size: logo ? 10 : 16, font: bold, color: WHITE,
  })
  if (!logo) {
    page.drawText(sanitize(data.company.address), { x: MARGIN, y: PAGE_H - 48, size: 8, font: reg, color: NAVY_LIGHT })
    let line3 = ''
    if (data.company.phone) line3 += `Tel: ${data.company.phone}`
    if (data.company.vat) line3 += (line3 ? '   ' : '') + `VAT: ${data.company.vat}`
    if (line3) page.drawText(sanitize(line3), { x: MARGIN, y: PAGE_H - 60, size: 8, font: reg, color: NAVY_LIGHT })
  }

  // Right block: document type / ref / date / status
  const title = data.type
  const titleW = bold.widthOfTextAtSize(title, 18)
  page.drawText(title, { x: PAGE_W - MARGIN - titleW, y: PAGE_H - 34, size: 18, font: bold, color: WHITE })
  const refStr = `No: ${data.refNumber}`
  page.drawText(refStr, {
    x: PAGE_W - MARGIN - bold.widthOfTextAtSize(refStr, 10), y: PAGE_H - 50, size: 10, font: bold, color: WHITE,
  })
  const dateStr = data.date.toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  page.drawText(dateStr, {
    x: PAGE_W - MARGIN - reg.widthOfTextAtSize(dateStr, 9), y: PAGE_H - 63, size: 9, font: reg, color: NAVY_LIGHT,
  })
  const statusStr = data.status.toUpperCase()
  page.drawText(statusStr, {
    x: PAGE_W - MARGIN - bold.widthOfTextAtSize(statusStr, 9), y: PAGE_H - 77, size: 9, font: bold,
    color: statusStr === 'VOIDED' ? rgb(1, 0.6, 0.6) : rgb(0.65, 0.9, 0.65),
  })

  let y = PAGE_H - HEADER_H - 16

  // ── Company details (when the logo displaced them from the band) ───────────
  if (logo) {
    let infoLine = sanitize(data.company.address)
    if (data.company.phone) infoLine += `   Tel: ${data.company.phone}`
    if (data.company.vat) infoLine += `   VAT: ${data.company.vat}`
    page.drawText(infoLine, { x: MARGIN, y, size: 8, font: reg, color: GRAY })
    y -= 16
  }

  // ── Party + transaction detail fields ───────────────────────────────────────
  page.drawText(`${data.partyLabel.toUpperCase()} DETAILS`, { x: MARGIN, y, size: 8, font: bold, color: NAVY })
  y -= 6

  const halfW = (COL_W - 8) / 2
  const thirdW = (COL_W - 16) / 3
  drawField(page, `${data.partyLabel} Name`, data.partyName, MARGIN, y, halfW, fonts)
  drawField(page, 'ID / Registration Number', data.partyIdNumber ?? '', MARGIN + halfW + 8, y, halfW, fonts)
  y -= 26
  drawField(page, 'Phone', data.partyPhone ?? '', MARGIN, y, thirdW, fonts)
  drawField(page, 'Vehicle Reg', data.vehicleReg ?? '', MARGIN + thirdW + 8, y, thirdW, fonts)
  drawField(page, 'Weighbridge Ticket', data.wbTicketNumber ?? '', MARGIN + (thirdW + 8) * 2, y, thirdW, fonts)
  y -= 26
  if (data.partyAddress) {
    drawField(page, 'Address', data.partyAddress, MARGIN, y, COL_W, fonts)
    y -= 26
  }
  y -= 6

  // ── Lines table ─────────────────────────────────────────────────────────────
  const cols = [
    { label: '#', w: 0.05, align: 'left' as const },
    { label: 'Code', w: 0.1, align: 'left' as const },
    { label: 'Product', w: 0.23, align: 'left' as const },
    { label: 'Price', w: 0.1, align: 'right' as const },
    { label: 'WB Full', w: 0.09, align: 'right' as const },
    { label: 'WB Empty', w: 0.09, align: 'right' as const },
    { label: 'Nett Qty', w: 0.1, align: 'right' as const },
    { label: 'VAT', w: 0.1, align: 'right' as const },
    { label: 'Total', w: 0.14, align: 'right' as const },
  ]

  function drawLinesHeader() {
    page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: COL_W, height: ROW_H, color: NAVY })
    let x = MARGIN
    for (const c of cols) {
      const cw = c.w * COL_W
      const label = c.label
      const tx = c.align === 'right' ? x + cw - bold.widthOfTextAtSize(label, 7.5) - 4 : x + 4
      page.drawText(label, { x: tx, y: y - ROW_H + 4.5, size: 7.5, font: bold, color: WHITE })
      x += cw
    }
    y -= ROW_H
  }

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H])
    pages.push(page)
    y = PAGE_H - MARGIN
    drawLinesHeader()
  }

  drawLinesHeader()

  data.lines.forEach((l, idx) => {
    if (y - ROW_H < BOTTOM_LIMIT) newPage()
    const shade = idx % 2 === 1
    if (shade) page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: COL_W, height: ROW_H, color: LGRAY })
    page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: COL_W, height: ROW_H, borderColor: GRAY, borderWidth: 0.4 })

    const values = [
      String(idx + 1),
      l.code,
      l.name,
      money(l.unitPrice),
      l.grossQty ? new Decimal(l.grossQty).toFixed(2) : '—',
      l.tareQty ? new Decimal(l.tareQty).toFixed(2) : '—',
      `${new Decimal(l.quantity).toFixed(2)} ${l.unit}`,
      money(l.vat),
      money(l.lineTotal),
    ]
    let x = MARGIN
    cols.forEach((c, ci) => {
      const cw = c.w * COL_W
      let text = sanitize(values[ci]!)
      const maxChars = Math.floor((cw - 8) / 4.2)
      if (text.length > maxChars) text = text.slice(0, maxChars - 1) + '…'
      const tx = c.align === 'right' ? x + cw - reg.widthOfTextAtSize(text, 8) - 4 : x + 4
      page.drawText(text, { x: tx, y: y - ROW_H + 4.5, size: 8, font: reg, color: DARK })
      x += cw
    })
    y -= ROW_H
  })

  // ── Totals panel (right) + payment info (left) ──────────────────────────────
  if (y - 120 < BOTTOM_LIMIT) newPage()
  y -= 12

  const panelW = 220
  const panelX = PAGE_W - MARGIN - panelW
  const totals: [string, string, boolean][] = [
    ['Sub Total', money(data.subTotal), false],
    ['VAT', money(data.vatAmount), false],
    ['Grand Total', money(data.grandTotal), true],
  ]
  if (data.loanDeduction && new Decimal(data.loanDeduction).greaterThan(0)) {
    totals.push(['Loan Deduction', `-${money(data.loanDeduction)}`, false])
  }
  if (data.amountPaid !== undefined) totals.push(['Amount Paid', money(data.amountPaid), false])
  if (data.balanceDue && new Decimal(data.balanceDue).greaterThan(0)) {
    totals.push(['Balance Due', money(data.balanceDue), true])
  }

  let ty = y
  for (const [label, value, emphasis] of totals) {
    const h = emphasis ? 20 : 16
    page.drawRectangle({
      x: panelX, y: ty - h, width: panelW, height: h,
      color: emphasis ? NAVY_LIGHT : WHITE, borderColor: GRAY, borderWidth: 0.5,
    })
    page.drawText(label, { x: panelX + 6, y: ty - h + (emphasis ? 6 : 4.5), size: emphasis ? 9 : 8, font: emphasis ? bold : reg, color: DARK })
    const vFont = emphasis ? bold : reg
    const vSize = emphasis ? 10 : 8.5
    page.drawText(value, {
      x: panelX + panelW - vFont.widthOfTextAtSize(value, vSize) - 6,
      y: ty - h + (emphasis ? 5 : 4.5), size: vSize, font: vFont, color: DARK,
    })
    ty -= h
  }

  // Payment block on the left
  let py = y - 4
  page.drawText('PAYMENT', { x: MARGIN, y: py, size: 8, font: bold, color: NAVY })
  py -= 12
  page.drawText(`Method: ${sanitize(data.splitPayments ? 'Split' : data.paymentMethod.toUpperCase())}`, {
    x: MARGIN, y: py, size: 8.5, font: reg, color: DARK,
  })
  py -= 12
  if (data.splitPayments) {
    const parts: string[] = []
    for (const [k, v] of Object.entries(data.splitPayments)) {
      if (v && new Decimal(v).greaterThan(0)) parts.push(`${k.toUpperCase()}: ${money(v)}`)
    }
    if (parts.length) {
      page.drawText(parts.join('   '), { x: MARGIN, y: py, size: 8, font: reg, color: GRAY })
      py -= 12
    }
  }
  if (data.notes) {
    let notes = sanitize(`Notes: ${data.notes}`)
    if (notes.length > 90) notes = notes.slice(0, 89) + '…'
    page.drawText(notes, { x: MARGIN, y: py, size: 8, font: reg, color: GRAY })
    py -= 12
  }

  y = Math.min(ty, py) - 24

  // ── Signature rule ──────────────────────────────────────────────────────────
  if (y < BOTTOM_LIMIT + 20) { newPage(); y -= 10 }
  const sigW = 180
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + sigW, y }, thickness: 0.7, color: DARK })
  page.drawText(`${data.partyLabel} Signature`, { x: MARGIN, y: y - 10, size: 7.5, font: reg, color: GRAY })
  page.drawLine({ start: { x: PAGE_W - MARGIN - sigW, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.7, color: DARK })
  page.drawText('Authorised Signature', { x: PAGE_W - MARGIN - sigW, y: y - 10, size: 7.5, font: reg, color: GRAY })

  // ── Footers ─────────────────────────────────────────────────────────────────
  const generated = `Generated: ${data.generatedAt.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}  |  ${sanitize(data.company.name)}  |  RecycleProX`
  pages.forEach((pg, i) => {
    pg.drawText(generated, { x: MARGIN, y: MARGIN - 18, size: 6.5, font: reg, color: GRAY })
    const pageText = `Page ${i + 1} of ${pages.length}`
    pg.drawText(pageText, {
      x: PAGE_W - MARGIN - reg.widthOfTextAtSize(pageText, 7), y: MARGIN - 18, size: 7, font: reg, color: GRAY,
    })
  })

  return doc.save()
}
