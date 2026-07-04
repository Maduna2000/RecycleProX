/**
 * Second-Hand Goods Declaration — Kingdom of Eswatini.
 * Seller's declaration for each purchase of second-hand goods, in terms of
 * the Value Added Tax Act, 2011 (Act No. 12 of 2011).
 * Generates a compliant A4 declaration form for each purchase.
 * Server-side only.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Vat264Line {
  description: string
  quantity:    string
  unit:        string
  unitPrice:   string
  lineTotal:   string
}

export interface Vat264Data {
  // Dealer (yard) details — from SystemSettings
  dealerName:    string
  dealerAddress: string
  dealerVatNo:   string
  dealerPhone?:  string

  // Transaction
  refNumber:     string
  date:          Date

  // Seller (customer)
  sellerName:     string
  sellerIdNumber: string
  sellerAddress?: string
  sellerPhone?:   string

  // Goods
  lines:          Vat264Line[]
  totalAmount:    string
  paymentMethod:  string

  /** Currency symbol for amounts (E for SZL, R for ZAR). */
  currencySymbol?: string

  // Signature (PNG/JPG bytes from R2, optional)
  signatureBytes?: Uint8Array
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 50
const COL_W  = PAGE_W - MARGIN * 2

const GREEN = rgb(0.11, 0.53, 0.22)
const DARK  = rgb(0.07, 0.07, 0.07)
const GRAY  = rgb(0.45, 0.45, 0.45)
const LGRAY = rgb(0.94, 0.94, 0.94)
const WHITE = rgb(1, 1, 1)

function hRule(page: ReturnType<PDFDocument['addPage']>, y: number, color = GRAY, thickness = 0.5) {
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness, color })
}

/**
 * Labeled field: small gray label ABOVE the box, value inside the box.
 * Consumes 26pt of vertical space from the given baseline y (label sits at
 * y+3, box spans y−16…y). Callers advance y by 30 between field rows.
 */
function drawField(
  page: ReturnType<PDFDocument['addPage']>,
  label: string, value: string,
  x: number, y: number, width: number,
  fonts: { bold: Awaited<ReturnType<PDFDocument['embedFont']>>; reg: Awaited<ReturnType<PDFDocument['embedFont']>> }
) {
  page.drawText(label, { x, y: y + 3, size: 7, font: fonts.reg, color: GRAY })
  page.drawRectangle({ x, y: y - 16, width, height: 16, color: LGRAY, borderColor: GRAY, borderWidth: 0.5 })
  page.drawText(value || '—', { x: x + 4, y: y - 11, size: 9, font: fonts.bold, color: DARK })
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateVat264(data: Vat264Data): Promise<Uint8Array> {
  const doc  = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])

  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)
  const fonts = { bold, reg }
  const sym = data.currencySymbol ?? 'R'

  let y = PAGE_H - MARGIN

  // ── Header bar ───────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - 72, width: PAGE_W, height: 72, color: GREEN })
  page.drawText('SECOND-HAND GOODS DECLARATION', { x: MARGIN, y: PAGE_H - 32, size: 16, font: bold, color: WHITE })
  page.drawText('Seller’s declaration for the acquisition of second-hand goods', {
    x: MARGIN, y: PAGE_H - 50, size: 9, font: reg, color: rgb(0.8, 1, 0.8),
  })
  page.drawText('In terms of the Value Added Tax Act, 2011 (Act No. 12 of 2011) — Kingdom of Eswatini', {
    x: MARGIN, y: PAGE_H - 63, size: 8, font: reg, color: rgb(0.7, 0.9, 0.7),
  })

  // Ref top-right
  const refStr = `Ref: ${data.refNumber}`
  const refW = bold.widthOfTextAtSize(refStr, 9)
  page.drawText(refStr, { x: PAGE_W - MARGIN - refW, y: PAGE_H - 35, size: 9, font: bold, color: WHITE })
  const dateStr = data.date.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' })
  const dateW = reg.widthOfTextAtSize(dateStr, 9)
  page.drawText(dateStr, { x: PAGE_W - MARGIN - dateW, y: PAGE_H - 50, size: 9, font: reg, color: rgb(0.8, 1, 0.8) })

  y = PAGE_H - 94

  // ── Part A: Registered Vendor (Dealer) ───────────────────────────────────────
  page.drawText('PART A — REGISTERED VENDOR (DEALER)', { x: MARGIN, y, size: 8, font: bold, color: GREEN })
  y -= 16

  const halfW = (COL_W - 8) / 2
  drawField(page, 'Business / Yard Name', data.dealerName, MARGIN, y, halfW, fonts)
  drawField(page, 'VAT Registration Number', data.dealerVatNo, MARGIN + halfW + 8, y, halfW, fonts)
  y -= 30

  drawField(page, 'Physical Address', data.dealerAddress, MARGIN, y, COL_W, fonts)
  y -= 34

  // ── Part B: Seller (Customer) ─────────────────────────────────────────────────
  hRule(page, y + 10, GREEN, 1)
  page.drawText('PART B — SELLER / SUPPLIER', { x: MARGIN, y, size: 8, font: bold, color: GREEN })
  y -= 16

  drawField(page, 'Full Name', data.sellerName, MARGIN, y, halfW, fonts)
  drawField(page, 'National ID / Passport Number', data.sellerIdNumber, MARGIN + halfW + 8, y, halfW, fonts)
  y -= 30

  drawField(page, 'Residential Address', data.sellerAddress ?? '', MARGIN, y, halfW, fonts)
  drawField(page, 'Phone Number', data.sellerPhone ?? '', MARGIN + halfW + 8, y, halfW, fonts)
  y -= 34

  // ── Part C: Goods Acquired ────────────────────────────────────────────────────
  hRule(page, y + 10, GREEN, 1)
  page.drawText('PART C — DESCRIPTION OF SECOND-HAND GOODS ACQUIRED', { x: MARGIN, y, size: 8, font: bold, color: GREEN })
  y -= 20

  // Table header
  page.drawRectangle({ x: MARGIN, y: y - 5, width: COL_W, height: 17, color: GREEN })

  const colX = {
    desc:  MARGIN + 4,
    qty:   MARGIN + COL_W * 0.52,
    unit:  MARGIN + COL_W * 0.62,
    price: MARGIN + COL_W * 0.74,
    total: MARGIN + COL_W * 0.87,
  }

  page.drawText('Description of Goods',   { x: colX.desc,  y, size: 8, font: bold, color: WHITE })
  page.drawText('Qty',                    { x: colX.qty,   y, size: 8, font: bold, color: WHITE })
  page.drawText('Unit',                   { x: colX.unit,  y, size: 8, font: bold, color: WHITE })
  page.drawText('Unit Price',             { x: colX.price, y, size: 8, font: bold, color: WHITE })
  page.drawText('Total',                  { x: colX.total, y, size: 8, font: bold, color: WHITE })

  y -= 19

  // Rows
  for (let i = 0; i < data.lines.length; i++) {
    const line = data.lines[i]!
    if (y < MARGIN + 190) break // guard — don't overflow signature area

    if (i % 2 === 0) {
      page.drawRectangle({ x: MARGIN, y: y - 4, width: COL_W, height: 16, color: LGRAY })
    }

    const desc = line.description.length > 45 ? line.description.substring(0, 43) + '…' : line.description
    page.drawText(desc, { x: colX.desc, y, size: 8, font: reg, color: DARK })
    page.drawText(new Decimal(line.quantity).toFixed(2), { x: colX.qty,   y, size: 8, font: reg, color: DARK })
    page.drawText(line.unit,                             { x: colX.unit,  y, size: 8, font: reg, color: DARK })
    page.drawText(`${sym} ${new Decimal(line.unitPrice).toFixed(2)}`, { x: colX.price, y, size: 8, font: reg, color: DARK })
    page.drawText(`${sym} ${new Decimal(line.lineTotal).toFixed(2)}`, { x: colX.total, y, size: 8, font: reg, color: DARK })

    y -= 16
  }

  // Total row
  hRule(page, y + 2, DARK, 1)
  y -= 14
  const totalStr = `${sym} ${new Decimal(data.totalAmount).toFixed(2)}`
  const totalW = bold.widthOfTextAtSize(totalStr, 11)
  page.drawText('TOTAL PURCHASE VALUE:', { x: MARGIN, y, size: 9, font: bold, color: DARK })
  page.drawText(totalStr, { x: PAGE_W - MARGIN - totalW, y, size: 11, font: bold, color: GREEN })

  y -= 14
  page.drawText(`Payment Method: ${data.paymentMethod.toUpperCase()}`, { x: MARGIN, y, size: 8, font: reg, color: GRAY })

  // ── Declaration ───────────────────────────────────────────────────────────────
  y -= 24
  hRule(page, y + 10, GREEN, 1)
  page.drawText('DECLARATION BY SELLER', { x: MARGIN, y, size: 8, font: bold, color: GREEN })
  y -= 14

  const declaration =
    'I declare that the above-mentioned goods are/were owned by me and that the information furnished in this declaration ' +
    'is true and correct. I confirm that these goods are second-hand goods as defined in the Value Added Tax Act, 2011 ' +
    '(Act No. 12 of 2011) of the Kingdom of Eswatini, and that they were not obtained unlawfully.'

  // Word-wrap declaration text
  const words = declaration.split(' ')
  let line2 = ''
  const maxLineWidth = COL_W - 8
  for (const word of words) {
    const test = line2 ? line2 + ' ' + word : word
    if (reg.widthOfTextAtSize(test, 8) > maxLineWidth) {
      page.drawText(line2, { x: MARGIN, y, size: 8, font: reg, color: DARK })
      y -= 12
      line2 = word
    } else {
      line2 = test
    }
  }
  if (line2) { page.drawText(line2, { x: MARGIN, y, size: 8, font: reg, color: DARK }); y -= 12 }

  y -= 14

  // ── Signature section (labels above the boxes) ────────────────────────────────
  page.drawText('Seller Signature:', { x: MARGIN, y, size: 8, font: bold, color: DARK })
  page.drawText('Date:', { x: MARGIN + 220, y, size: 8, font: bold, color: DARK })
  const sigBoxTop = y - 6
  const sigBoxY = sigBoxTop - 60
  page.drawRectangle({ x: MARGIN, y: sigBoxY, width: 200, height: 60, color: LGRAY, borderColor: GRAY, borderWidth: 0.5 })
  page.drawRectangle({ x: MARGIN + 220, y: sigBoxY, width: 120, height: 60, color: LGRAY, borderColor: GRAY, borderWidth: 0.5 })

  if (data.signatureBytes) {
    try {
      // Try PNG first, fall back to JPG
      let sigImage
      try { sigImage = await doc.embedPng(data.signatureBytes) }
      catch { sigImage = await doc.embedJpg(data.signatureBytes) }

      const dims = sigImage.scaleToFit(190, 50)
      page.drawImage(sigImage, {
        x: MARGIN + 5,
        y: sigBoxY + (60 - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      })
    } catch {
      page.drawText('(Signature on file)', { x: MARGIN + 8, y: sigBoxY + 26, size: 8, font: reg, color: GRAY })
    }
  } else {
    page.drawText('(No signature captured)', { x: MARGIN + 8, y: sigBoxY + 26, size: 8, font: reg, color: GRAY })
  }

  page.drawText(dateStr, { x: MARGIN + 226, y: sigBoxY + 26, size: 9, font: reg, color: DARK })

  // ── Footer ────────────────────────────────────────────────────────────────────
  const footY = MARGIN + 20
  hRule(page, footY + 10)
  page.drawText(
    'Retained for inspection in terms of the Value Added Tax Act, 2011 (Act No. 12 of 2011), Kingdom of Eswatini.',
    { x: MARGIN, y: footY, size: 7, font: reg, color: GRAY }
  )

  return doc.save()
}
