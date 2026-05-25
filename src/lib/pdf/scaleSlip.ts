/**
 * Scale Order Slip — 80 mm receipt-style PDF.
 * Shows order number, customer, products with weights. NO price.
 * Server-side only.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface ScaleSlipLine {
  productName:  string
  categoryName: string
  weight:       string  // formatted string e.g. "12.750 kg"
}

export interface ScaleSlipData {
  orderNumber:   string
  createdAt:     Date
  customerName:  string
  customerPhone: string
  lines:         ScaleSlipLine[]
  operatorName:  string
  yardName:      string
}

// ─── Layout constants (80 mm paper) ──────────────────────────────────────────
const W      = 227
const MARGIN = 10
const LINE_H = 12
const SMALL  = 7
const NORMAL = 8
const LARGE  = 10
const HUGE   = 13

const BLACK = rgb(0, 0, 0)
const GRAY  = rgb(0.45, 0.45, 0.45)

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export async function generateScaleOrderSlip(data: ScaleSlipData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)

  const multiLine = data.lines.length > 1

  // Calculate dynamic height
  let h = 14                             // y starts at h-14
  h += HUGE + 2                          // yard name
  h += LINE_H + 4                        // slip title
  h += 8                                 // divider gap

  h += LINE_H                            // ORDER # row
  h += LINE_H + 4                        // date
  h += 8                                 // divider gap

  h += LINE_H - 2                        // CUSTOMER label
  h += LINE_H                            // customer name
  h += LINE_H + 4                        // phone
  h += 8                                 // divider gap

  // Product(s) section — one block per line
  if (multiLine) {
    h += LINE_H - 2                      // PRODUCTS label
    for (const line of data.lines) {
      h += LINE_H - 1                    // product name
      h += LINE_H - 1                    // category
      h += LINE_H + 2                    // WEIGHT row
      h += 4                             // gap between items
    }
  } else {
    h += LINE_H - 2                      // PRODUCT label
    h += LINE_H - 1                      // product name
    h += LINE_H + 1                      // category
    h += LINE_H + 4                      // WEIGHT row
  }
  h += 8                                 // divider gap

  h += LINE_H + 8                        // operator
  h += 8                                 // divider gap

  h += LINE_H                            // footer line 1
  h += LINE_H + 2                        // footer line 2
  h += LINE_H + 10                       // footer line 3 + bottom margin

  const page = doc.addPage([W, h])
  let y = h - 14

  function drawText(text: string, opts: {
    x?: number; y?: number; size?: number; font?: typeof bold; color?: ReturnType<typeof rgb>; align?: 'left' | 'center' | 'right'
  } = {}) {
    const font  = opts.font  ?? reg
    const size  = opts.size  ?? NORMAL
    const color = opts.color ?? BLACK
    const px    = opts.x     ?? MARGIN
    let   drawX = px

    if (opts.align === 'center') {
      const tw = font.widthOfTextAtSize(text, size)
      drawX = (W - tw) / 2
    } else if (opts.align === 'right') {
      const tw = font.widthOfTextAtSize(text, size)
      drawX = W - MARGIN - tw
    }

    page.drawText(text, { x: drawX, y: opts.y ?? y, size, font, color })
  }

  function drawDivider(yPos: number) {
    page.drawLine({ start: { x: MARGIN, y: yPos }, end: { x: W - MARGIN, y: yPos }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  drawText(data.yardName.toUpperCase(), { size: HUGE, font: bold, align: 'center' })
  y -= HUGE + 2
  drawText('SCALE ORDER SLIP', { size: LARGE, font: bold, align: 'center', color: GRAY })
  y -= LINE_H + 4
  drawDivider(y); y -= 8

  // ── Order # ────────────────────────────────────────────────────────────────
  drawText('ORDER #', { size: SMALL, font: bold, color: GRAY })
  drawText(data.orderNumber, { size: LARGE, font: bold, align: 'center' })
  y -= LINE_H
  drawText(`${formatDate(data.createdAt)}  ${formatTime(data.createdAt)}`, { size: SMALL, color: GRAY, align: 'center' })
  y -= LINE_H + 4
  drawDivider(y); y -= 8

  // ── Customer ───────────────────────────────────────────────────────────────
  drawText('CUSTOMER', { size: SMALL, font: bold, color: GRAY })
  y -= LINE_H - 2
  drawText(data.customerName, { size: NORMAL, font: bold })
  y -= LINE_H
  drawText(data.customerPhone, { size: SMALL, color: GRAY })
  y -= LINE_H + 4
  drawDivider(y); y -= 8

  // ── Product(s) & Weight(s) ─────────────────────────────────────────────────
  if (multiLine) {
    drawText(`PRODUCTS (${data.lines.length})`, { size: SMALL, font: bold, color: GRAY })
    y -= LINE_H - 2

    data.lines.forEach((line, i) => {
      drawText(`${i + 1}. ${line.productName}`, { size: NORMAL, font: bold })
      y -= LINE_H - 1
      drawText(`   ${line.categoryName}`, { size: SMALL, color: GRAY })
      y -= LINE_H - 1
      drawText('WEIGHT', { size: SMALL, font: bold, color: GRAY })
      drawText(line.weight, { size: LARGE, font: bold, align: 'right' })
      y -= LINE_H + 2
      if (i < data.lines.length - 1) y -= 4
    })
  } else {
    const line = data.lines[0]!
    drawText('PRODUCT', { size: SMALL, font: bold, color: GRAY })
    y -= LINE_H - 2
    drawText(line.productName, { size: NORMAL, font: bold })
    y -= LINE_H - 1
    drawText(`Category: ${line.categoryName}`, { size: SMALL, color: GRAY })
    y -= LINE_H + 1

    drawText('WEIGHT', { size: SMALL, font: bold, color: GRAY })
    drawText(line.weight, { size: LARGE, font: bold, align: 'right' })
    y -= LINE_H + 4
  }

  drawDivider(y); y -= 8

  // ── Operator ───────────────────────────────────────────────────────────────
  drawText(`Operator: ${data.operatorName}`, { size: SMALL, color: GRAY })
  y -= LINE_H + 8
  drawDivider(y); y -= 8

  // ── Footer ─────────────────────────────────────────────────────────────────
  drawText('Present this slip at reception', { size: SMALL, font: bold, align: 'center' })
  y -= LINE_H
  drawText('for payment processing.', { size: SMALL, font: bold, align: 'center' })
  y -= LINE_H + 2
  drawText('NO PRICE ON THIS SLIP', { size: SMALL, color: GRAY, align: 'center' })

  const bytes = await doc.save()
  return bytes
}
