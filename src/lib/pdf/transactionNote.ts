/**
 * Purchase Note / Sale Note — A4 transaction document matching the yard's
 * legacy note layout: company logo boxed top-left, "PURCHASE NOTE — COPY"
 * heading, a two-column info block (account/party details left, document
 * details right), a lines table with Price Excl/Incl and Gross/Tare/Nett
 * weighbridge columns plus a mass totals row, and the lawful-owner
 * declaration with the document total alongside. Server-side only.
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
  /** Line total excl. VAT. */
  subTotal: string
  /** Line total incl. VAT. */
  lineTotal: string
}

export interface TransactionNoteData {
  type: 'PURCHASE NOTE' | 'SALE NOTE' | 'TAX INVOICE'
  refNumber: string
  date: Date
  status: string // PAID | UNPAID | PARTIAL | VOIDED
  currencySymbol: string
  /** Only used by TAX INVOICE — shown in the VAT breakdown, e.g. "15". */
  vatRatePercent?: string

  company: { name: string; address: string; phone?: string; vat?: string }
  /** Transparent PNG bytes from Settings, boxed top-left when present. */
  logoPng?: Uint8Array | null

  partyLabel: string // 'Supplier' | 'Buyer'
  /** e.g. "344 - CASUAL" (account code + type) */
  accountLabel?: string
  partyName: string
  partyIdNumber?: string
  partyPhone?: string
  partyAddress?: string
  partyVatNumber?: string
  partyRegNumber?: string

  vehicleReg?: string
  wbTicketNumber?: string

  /** Cashier / user who captured the transaction. */
  doneBy?: string
  comments?: string
  voidReason?: string

  /**
   * Declaration paragraph printed above the totals (from Settings). Falls
   * back to the standard lawful-owner / release-of-goods wording when unset.
   */
  declaration?: string

  lines: NoteLine[]

  subTotal: string
  vatAmount: string
  grandTotal: string
  loanDeduction?: string
  amountPaid?: string
  balanceDue?: string

  paymentMethod: string
  splitPayments?: { cash?: string; eft?: string; cheque?: string; loan?: string } | null

  generatedAt: Date
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 46
const COL_W = PAGE_W - MARGIN * 2

const DARK = rgb(0.07, 0.07, 0.07)
const GRAY = rgb(0.45, 0.45, 0.45)
const LGRAY = rgb(0.95, 0.95, 0.95)

const ROW_H = 14
const BOTTOM_LIMIT = MARGIN + 34

function money(symbol: string, v: string | undefined | null): string {
  if (v === undefined || v === null || v === '') return ''
  return `${symbol}${new Decimal(v).toFixed(2)}`
}

function qty(v: string | undefined | null): string {
  if (v === undefined || v === null || v === '') return '0'
  const d = new Decimal(v)
  // Legacy style: trim trailing zeros (1412, 2.4, 1414.4)
  return d.toDecimalPlaces(2).toString()
}

function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\xFF–—‘’“”•…]/g, '?')
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateTransactionNote(data: TransactionNoteData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const sym = data.currencySymbol

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
  let y = PAGE_H - MARGIN

  // ── Logo, top-left (no frame — transparent PNG sits on the page) ───────────
  if (logo) {
    // Fit inside a 130×86pt area, preserving aspect ratio
    const BOX_W = 130
    const BOX_H = 86
    const scale = Math.min(BOX_W / logo.width, BOX_H / logo.height)
    const w = logo.width * scale
    const h = logo.height * scale
    page.drawImage(logo, { x: MARGIN, y: y - h, width: w, height: h })
    y -= h + 14
  } else {
    // No logo — company name takes its place
    page.drawText(sanitize(data.company.name), { x: MARGIN, y: y - 14, size: 15, font: bold, color: DARK })
    if (data.company.address) {
      page.drawText(sanitize(data.company.address), { x: MARGIN, y: y - 27, size: 8, font: reg, color: GRAY })
    }
    y -= 42
  }

  // ── Title row: "PURCHASE NOTE  COPY" together on one line ───────────────────
  page.drawText(data.type, { x: MARGIN, y, size: 13, font: bold, color: DARK })
  const statusLabel = data.status === 'PAID' ? 'COPY' : data.status.toUpperCase()
  page.drawText(statusLabel, {
    x: MARGIN + bold.widthOfTextAtSize(data.type, 13) + 14, y, size: 13, font: bold, color: DARK,
  })
  y -= 24

  // ── Company VAT registration — required on a valid tax invoice (the
  // words "TAX INVOICE" plus the supplier's VAT number are the two
  // non-negotiable particulars). Scoped to TAX INVOICE only, deliberately —
  // Purchase/Sale Note's existing printed layout stays unchanged rather than
  // gaining a line nobody asked for on documents already in active use.
  if (data.type === 'TAX INVOICE' && data.company.vat) {
    page.drawText(`VAT Reg No: ${sanitize(data.company.vat)}`, { x: MARGIN, y, size: 8.5, font: reg, color: DARK })
    y -= 14
  }

  // ── Two-column info block ───────────────────────────────────────────────────
  const rightX = PAGE_W / 2 + 40

  function infoLine(x: number, yy: number, label: string, value: string | undefined) {
    page.drawText(`${label}:`, { x, y: yy, size: 7.5, font: bold, color: DARK })
    if (value) {
      let text = sanitize(value)
      const maxChars = 44
      if (text.length > maxChars) text = text.slice(0, maxChars - 1) + '…'
      page.drawText(text, { x: x + bold.widthOfTextAtSize(`${label}: `, 7.5) + 2, y: yy, size: 7.5, font: reg, color: DARK })
    }
  }

  const left: [string, string | undefined][] = [
    // Always the party's real name, never the system-generated account
    // code/type label (e.g. "344 - CASUAL") — this document is used for
    // real tax purposes, so it must show the same name as "Name" below,
    // not an internal account reference.
    ['Account Name', data.partyName],
    ['Address', data.partyAddress],
    ['Vat Number', data.partyVatNumber ?? 'None'],
    ['Reg Number', data.partyRegNumber],
    ['ID Number', data.partyIdNumber],
    ['Name', data.partyName],
    ['Tel', data.partyPhone],
    ['Transporter / Vehicle', data.vehicleReg],
    ['Weighbridge Ticket', data.wbTicketNumber],
  ]
  const noteNoLabel =
    data.type === 'PURCHASE NOTE' ? 'PN Number' :
    data.type === 'SALE NOTE'     ? 'SN Number' :
    'Tax Invoice No.'
  const right: [string, string | undefined][] = [
    [noteNoLabel, data.refNumber],
    ['Payment Method', data.splitPayments ? 'Split' : data.paymentMethod.toUpperCase()],
    ['Transaction Done By', data.doneBy],
    ['Transaction Date', data.date.toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })],
    ['Comments', data.comments],
    ['Return Reason', data.voidReason],
  ]
  if (data.splitPayments) {
    const parts: string[] = []
    for (const [k, v] of Object.entries(data.splitPayments)) {
      if (v && new Decimal(v).greaterThan(0)) parts.push(`${k.toUpperCase()} ${money(sym, v)}`)
    }
    if (parts.length) right.splice(2, 0, ['Split Detail', parts.join('  ')])
  }

  const LINE_GAP = 11.5
  left.forEach(([l, v], i) => infoLine(MARGIN, y - i * LINE_GAP, l, v))
  right.forEach(([l, v], i) => infoLine(rightX, y - i * LINE_GAP, l, v))
  y -= Math.max(left.length, right.length) * LINE_GAP + 12

  // ── Lines table ─────────────────────────────────────────────────────────────
  const cols = [
    { label: 'Prod ID', w: 0.08, align: 'left' as const },
    { label: 'Product Name', w: 0.2, align: 'left' as const },
    { label: 'Price Excl', w: 0.09, align: 'right' as const },
    { label: 'Price Incl', w: 0.09, align: 'right' as const },
    { label: 'Gross', w: 0.08, align: 'right' as const },
    { label: 'Tare', w: 0.07, align: 'right' as const },
    { label: 'Nett', w: 0.08, align: 'right' as const },
    { label: 'Sub Total', w: 0.11, align: 'right' as const },
    { label: 'VAT', w: 0.09, align: 'right' as const },
    { label: 'Grand Total', w: 0.11, align: 'right' as const },
  ]

  function drawCell(text: string, colIdx: number, yy: number, font: PDFFont, size = 7.5) {
    let x = MARGIN
    for (let i = 0; i < colIdx; i++) x += cols[i]!.w * COL_W
    const cw = cols[colIdx]!.w * COL_W
    let t = sanitize(text)
    const maxChars = Math.floor((cw - 4) / (size * 0.52))
    if (t.length > maxChars) t = t.slice(0, maxChars - 1) + '…'
    const tx = cols[colIdx]!.align === 'right' ? x + cw - font.widthOfTextAtSize(t, size) - 2 : x + 2
    page.drawText(t, { x: tx, y: yy, size, font, color: DARK })
  }

  function drawTableHeader() {
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE_W - MARGIN, y: y + 4 }, thickness: 0.8, color: DARK })
    cols.forEach((c, i) => drawCell(c.label, i, y - 8, bold))
    page.drawLine({ start: { x: MARGIN, y: y - 12 }, end: { x: PAGE_W - MARGIN, y: y - 12 }, thickness: 0.5, color: DARK })
    y -= 12 + 4
  }

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H])
    pages.push(page)
    y = PAGE_H - MARGIN
    drawTableHeader()
  }

  drawTableHeader()

  let grossSum = new Decimal(0)
  let tareSum = new Decimal(0)
  let nettSum = new Decimal(0)

  data.lines.forEach((l, idx) => {
    if (y - ROW_H < BOTTOM_LIMIT) newPage()
    if (idx % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - ROW_H + 3, width: COL_W, height: ROW_H, color: LGRAY })
    }
    const gross = l.grossQty ? new Decimal(l.grossQty) : null
    const tare = l.tareQty ? new Decimal(l.tareQty) : null
    const nett = new Decimal(l.quantity)
    if (gross) grossSum = grossSum.plus(gross)
    if (tare) tareSum = tareSum.plus(tare)
    nettSum = nettSum.plus(nett)

    const priceExcl = new Decimal(l.unitPrice)
    const priceIncl = nett.isZero() ? priceExcl : new Decimal(l.lineTotal).div(nett)

    const values = [
      l.code,
      l.name,
      money(sym, priceExcl.toFixed(3)),
      money(sym, priceIncl.toFixed(3)),
      gross ? qty(gross.toString()) : '0',
      tare ? qty(tare.toString()) : '0',
      qty(nett.toString()),
      money(sym, l.subTotal),
      new Decimal(l.vat).greaterThan(0) ? money(sym, l.vat) : '',
      money(sym, l.lineTotal),
    ]
    values.forEach((v, ci) => drawCell(v, ci, y - 8, reg))
    y -= ROW_H
  })

  // Mass totals row (Gross / Tare / Nett)
  if (y - ROW_H < BOTTOM_LIMIT) newPage()
  page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_W - MARGIN, y: y + 2 }, thickness: 0.5, color: DARK })
  drawCell('Totals :', 3, y - 8, bold)
  drawCell(qty(grossSum.toString()), 4, y - 8, bold)
  drawCell(qty(tareSum.toString()), 5, y - 8, bold)
  drawCell(qty(nettSum.toString()), 6, y - 8, bold)
  page.drawLine({ start: { x: MARGIN, y: y - 12 }, end: { x: PAGE_W - MARGIN, y: y - 12 }, thickness: 0.8, color: DARK })
  y -= ROW_H + 10

  // ── Declaration (left) + totals (right) ─────────────────────────────────────
  if (y - 70 < BOTTOM_LIMIT) newPage()

  // Declaration text: Settings-provided wording wins; otherwise the standard
  // fallback. Word-wrapped to leave room for the totals stack on the right.
  const declarationText = data.declaration?.trim()
    ? data.declaration.trim()
    : data.type === 'PURCHASE NOTE'
      ? `I hereby state that I am the lawful owner of the material listed above and have sold them to ${data.company.name} to dispose of as they see fit.`
      : data.type === 'TAX INVOICE'
        ? 'This is a valid tax invoice for VAT purposes in terms of the Value-Added Tax Act, 2011.'
        : `Goods listed above sold and released to ${data.partyName}. Errors and omissions excepted.`

  const declMaxW = COL_W - 230
  const declLines: string[] = []
  let current = ''
  for (const word of sanitize(declarationText).split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word
    if (reg.widthOfTextAtSize(candidate, 7.5) > declMaxW && current) {
      declLines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) declLines.push(current)
  declLines.forEach((line, i) => {
    page.drawText(line, { x: MARGIN, y: y - i * 10, size: 7.5, font: reg, color: DARK })
  })

  // Totals stack, right-aligned. A tax invoice must show the supply value,
  // VAT amount, and VAT rate explicitly — Purchase/Sale Note only ever
  // showed the final Total, so this breakdown is added for TAX INVOICE only.
  const totalsRows: [string, string, boolean][] = data.type === 'TAX INVOICE'
    ? [
        ['Subtotal (Excl. VAT):', money(sym, data.subTotal), false],
        [`VAT (${data.vatRatePercent ?? '15'}%):`, money(sym, data.vatAmount), false],
        ['Total (Incl. VAT):', money(sym, data.grandTotal), true],
      ]
    : [['Total:', money(sym, data.grandTotal), true]]
  if (data.loanDeduction && new Decimal(data.loanDeduction).greaterThan(0)) {
    totalsRows.push(['Loan Deduction:', `-${money(sym, data.loanDeduction)}`, false])
  }
  if (data.amountPaid !== undefined && data.amountPaid !== null) {
    totalsRows.push(['Amount Paid:', money(sym, data.amountPaid), false])
  }
  if (data.balanceDue && new Decimal(data.balanceDue).greaterThan(0)) {
    totalsRows.push(['Balance Due:', money(sym, data.balanceDue), true])
  }
  let ty = y
  for (const [label, value, emphasis] of totalsRows) {
    const f = emphasis ? bold : reg
    const size = emphasis ? 10 : 8.5
    const valueW = f.widthOfTextAtSize(value, size)
    page.drawText(label, { x: PAGE_W - MARGIN - 160, y: ty, size, font: f, color: DARK })
    page.drawText(value, { x: PAGE_W - MARGIN - valueW, y: ty, size, font: f, color: DARK })
    ty -= emphasis ? 15 : 12
  }

  // ── Footers ─────────────────────────────────────────────────────────────────
  const generated = `Generated: ${data.generatedAt.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}  |  ${sanitize(data.company.name)}  |  Renovo Pro`
  pages.forEach((pg, i) => {
    pg.drawText(generated, { x: MARGIN, y: MARGIN - 18, size: 6.5, font: reg, color: GRAY })
    const pageText = `Page ${i + 1} of ${pages.length}`
    pg.drawText(pageText, {
      x: PAGE_W - MARGIN - reg.widthOfTextAtSize(pageText, 7), y: MARGIN - 18, size: 7, font: reg, color: GRAY,
    })
  })

  return doc.save()
}
