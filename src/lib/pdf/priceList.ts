/**
 * Daily materials price list — A4 document styled to match the vat264
 * Second-Hand Goods Declaration's document language: a letterhead zone
 * (logo + company details), a full-bleed colour ribbon carrying the title,
 * a zebra-striped price table with a coloured header row, and a hairline
 * footer with a retention/print note. Long lists flow onto extra pages with
 * the ribbon and table header repeated. Server-side only.
 */
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, PDFImage } from 'pdf-lib'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriceListPdfItem {
  displayName: string
  /** INC VAT price, 2 dp string. */
  priceIncVat: string
  /** EX VAT price, 2 dp string (derived by the caller — never stored). */
  priceExVat: string
}

export interface PriceListPdfData {
  title: string
  listDate: Date
  footerText: string
  showExVat: boolean
  company: { name: string; address?: string; phone?: string }
  /** PNG or JPG bytes; rendered per the logo rules when present. */
  logoBytes?: Uint8Array | null
  currencySymbol: string
  items: PriceListPdfItem[]
  generatedAt: Date
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 50
const COL_W = PAGE_W - MARGIN * 2

// Brand navy (matches colors.primary / #1B3A6B) + the legacy sheet's gold accent.
const NAVY  = rgb(0.106, 0.227, 0.420)
const NAVY_TINT = rgb(0.90, 0.92, 0.96)
const GOLD  = rgb(0.788, 0.635, 0.153)
const DARK  = rgb(0.07, 0.07, 0.07)
const GRAY  = rgb(0.45, 0.45, 0.45)
const LGRAY = rgb(0.95, 0.95, 0.95)
const WHITE = rgb(1, 1, 1)

const RIBBON_H = 46

// Logo rules: fixed max height, width from the image's own aspect ratio but
// never more than 40% of the printable width — oversized art scales down,
// nothing is ever cropped or stretched.
const LOGO_MAX_H = 54
const LOGO_MAX_W = COL_W * 0.4

const ROW_H = 22
const FOOTER_ZONE = MARGIN + 40 // rows never draw below this; footer sits inside it

function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\xFF–—‘’“”•…]/g, '?')
}

function hRule(page: PDFPage, y: number, color = GRAY, thickness = 0.5) {
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness, color })
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generatePriceListPdf(data: PriceListPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique)
  const sym = data.currencySymbol

  let logo: PDFImage | null = null
  if (data.logoBytes && data.logoBytes.length > 0) {
    try {
      logo = await doc.embedPng(data.logoBytes)
    } catch {
      try {
        logo = await doc.embedJpg(data.logoBytes)
      } catch {
        logo = null // never fail the document over a bad logo
      }
    }
  }

  const dateLabel = data.listDate.toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  })
  const generatedLabel = data.generatedAt.toLocaleString('en-ZA', {
    dateStyle: 'medium', timeStyle: 'short',
  })

  // Column geometry — MATERIAL takes what the price columns leave over.
  const PRICE_COL_W = 100
  const priceCols = data.showExVat ? 2 : 1
  const materialW = COL_W - PRICE_COL_W * priceCols

  const pages: PDFPage[] = []

  function money(v: string): string {
    return `${sym}${new Decimal(v).toFixed(2)}`
  }

  function drawRight(page: PDFPage, text: string, rightEdge: number, y: number, size: number, font: PDFFont, color = DARK) {
    page.drawText(text, { x: rightEdge - font.widthOfTextAtSize(text, size), y, size, font, color })
  }

  function drawCentered(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = DARK) {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (PAGE_W - w) / 2, y, size, font, color })
  }

  function drawTableHeader(page: PDFPage, y: number): number {
    page.drawRectangle({ x: MARGIN, y: y - 20, width: COL_W, height: 20, color: NAVY })
    page.drawText('MATERIAL', { x: MARGIN + 8, y: y - 14, size: 9.5, font: bold, color: WHITE })
    let right = MARGIN + COL_W
    if (data.showExVat) {
      drawRight(page, 'EX VAT', right - 8, y - 14, 9.5, bold, WHITE)
      right -= PRICE_COL_W
    }
    drawRight(page, 'INC VAT', right - 8, y - 14, 9.5, bold, WHITE)
    return y - 20
  }

  // "Page X of Y" needs the final page count, which isn't known until every
  // page has been created — stamped in a final pass below, not here.
  function drawFooter(page: PDFPage) {
    const y = MARGIN - 6
    hRule(page, y + 22, GRAY, 0.5)
    if (data.footerText) {
      drawCentered(page, sanitize(data.footerText), y + 10, 7.5, reg, GRAY)
    }
    page.drawText(`Generated ${generatedLabel}`, { x: MARGIN, y, size: 7, font: italic, color: GRAY })
  }

  function newPage(first: boolean): { page: PDFPage; y: number } {
    const page = doc.addPage([PAGE_W, PAGE_H])
    pages.push(page)
    let y = PAGE_H - MARGIN

    if (first) {
      // ── Letterhead: logo left, company details right ─────────────────────
      let letterheadBottom = y
      if (logo) {
        const scale = Math.min(LOGO_MAX_H / logo.height, LOGO_MAX_W / logo.width, 1)
        const w = logo.width * scale
        const h = logo.height * scale
        page.drawImage(logo, { x: MARGIN, y: y - h, width: w, height: h })
        letterheadBottom = y - h
      }
      const name = sanitize(data.company.name).toUpperCase()
      const nameSize = 15
      drawRight(page, name, MARGIN + COL_W, y - nameSize, nameSize, bold, NAVY)
      let infoY = y - nameSize - 13
      if (data.company.address) {
        drawRight(page, sanitize(data.company.address), MARGIN + COL_W, infoY, 8, reg, GRAY)
        infoY -= 11
      }
      if (data.company.phone) {
        drawRight(page, `Tel: ${sanitize(data.company.phone)}`, MARGIN + COL_W, infoY, 8, reg, GRAY)
        infoY -= 11
      }
      y = Math.min(letterheadBottom, infoY) - 12

      // ── Colour ribbon: title left, list date right — full page bleed ──────
      page.drawRectangle({ x: 0, y: y - RIBBON_H, width: PAGE_W, height: RIBBON_H, color: NAVY })
      page.drawRectangle({ x: 0, y: y - RIBBON_H, width: PAGE_W, height: 3, color: GOLD })
      const title = sanitize(data.title).toUpperCase()
      page.drawText(title, { x: MARGIN, y: y - 30, size: 20, font: bold, color: WHITE })
      const dateW = bold.widthOfTextAtSize(dateLabel, 12)
      page.drawText(dateLabel, { x: PAGE_W - MARGIN - dateW, y: y - 22, size: 12, font: bold, color: WHITE })
      const itemsLabel = `${data.items.length} material${data.items.length === 1 ? '' : 's'}`
      const itemsW = reg.widthOfTextAtSize(itemsLabel, 8)
      page.drawText(itemsLabel, { x: PAGE_W - MARGIN - itemsW, y: y - 36, size: 8, font: reg, color: rgb(0.85, 0.88, 0.95) })
      y -= RIBBON_H + 14
    } else {
      // Continuation pages get a slim repeat of the ribbon, no letterhead.
      page.drawRectangle({ x: 0, y: y - 26, width: PAGE_W, height: 26, color: NAVY })
      const title = sanitize(data.title).toUpperCase()
      page.drawText(title, { x: MARGIN, y: y - 18, size: 11, font: bold, color: WHITE })
      const contLabel = `${dateLabel} — continued`
      drawRight(page, contLabel, PAGE_W - MARGIN, y - 18, 8, reg, rgb(0.85, 0.88, 0.95))
      y -= 26 + 12
    }

    y = drawTableHeader(page, y)
    return { page, y }
  }

  let { page, y } = newPage(true)

  data.items.forEach((item, i) => {
    if (y - ROW_H < FOOTER_ZONE) {
      drawFooter(page)
      ;({ page, y } = newPage(false))
    }
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: COL_W, height: ROW_H, color: NAVY_TINT })
    }
    const textY = y - ROW_H + 7

    let name = sanitize(item.displayName).toUpperCase()
    const maxNameW = materialW - 16
    while (name.length > 1 && bold.widthOfTextAtSize(name, 11.5) > maxNameW) {
      name = name.slice(0, -2) + '…'
    }
    page.drawText(name, { x: MARGIN + 8, y: textY, size: 11.5, font: bold, color: DARK })

    let right = MARGIN + COL_W
    if (data.showExVat) {
      drawRight(page, money(item.priceExVat), right - 8, textY, 11, reg, GRAY)
      right -= PRICE_COL_W
    }
    drawRight(page, money(item.priceIncVat), right - 8, textY, 12, bold, NAVY)
    y -= ROW_H

    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + COL_W, y }, thickness: 0.5, color: LGRAY })
  })

  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + COL_W, y }, thickness: 1, color: NAVY })
  drawFooter(page)

  // Page numbers only once every page exists, and only when the list spills
  // over a single page.
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      drawRight(p, `Page ${i + 1} of ${pages.length}`, MARGIN + COL_W, MARGIN - 6, 7, reg, GRAY)
    })
  }

  return doc.save()
}
