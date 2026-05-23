/**
 * Scale Order Slip — 80 mm receipt-style PDF.
 * Shows order number, customer, product, weight. NO price.
 * Server-side only.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface ScaleSlipData {
  orderNumber:   string
  createdAt:     Date
  customerName:  string
  customerPhone: string
  productName:   string
  categoryName:  string
  weight:        string   // formatted string e.g. "12.750 kg"
  operatorName:  string
  yardName:      string
}

// ─── Layout constants (80 mm paper) ──────────────────────────────────────────
const W      = 227
const MARGIN = 10
const BODY_W = W - MARGIN * 2
const LINE_H = 12
const SMALL  = 7
const NORMAL = 8
const LARGE  = 10
const HUGE   = 13

const BLACK = rgb(0, 0, 0)
const GRAY  = rgb(0.45, 0.45, 0.45)

function pad(str: string, width: number, align: 'left' | 'right' = 'left'): string {
  if (str.length >= width) return str.substring(0, width)
  return align === 'left' ? str.padEnd(width) : str.padStart(width)
}

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

  // Estimate height
  let h = 14 + HUGE + 4 + LINE_H + 8   // header
  h += LINE_H + LINE_H + 8              // order # + date
  h += LINE_H * 2 + 8                   // customer
  h += LINE_H * 2 + 8                   // product + weight
  h += LINE_H + 8                       // operator
  h += LINE_H * 3 + 14                  // footer

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

  // ── Product & Weight ───────────────────────────────────────────────────────
  drawText('PRODUCT', { size: SMALL, font: bold, color: GRAY })
  y -= LINE_H - 2
  drawText(data.productName, { size: NORMAL, font: bold })
  y -= LINE_H - 1
  drawText(`Category: ${data.categoryName}`, { size: SMALL, color: GRAY })
  y -= LINE_H + 1

  drawText('WEIGHT', { size: SMALL, font: bold, color: GRAY })
  drawText(data.weight, { size: LARGE, font: bold, align: 'right' })
  y -= LINE_H + 4
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
