/**
 * Daily materials price list — A4 document matching the yard's legacy
 * "TODAY'S PRICES" sheet: logo top-left (optional), company name in the
 * yard's gold, dated title block, a MATERIAL | INC VAT | EX VAT table
 * (EX VAT column optional per document), and a small-print footer
 * disclaimer. Long lists flow onto extra pages with the table header
 * repeated. Server-side only.
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
  company: { name: string }
  /** PNG or JPG bytes; rendered per the logo rules when present. */
  logoBytes?: Uint8Array | null
  currencySymbol: string
  items: PriceListPdfItem[]
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 46
const COL_W = PAGE_W - MARGIN * 2

const DARK = rgb(0.07, 0.07, 0.07)
const GRAY = rgb(0.45, 0.45, 0.45)
const LGRAY = rgb(0.95, 0.95, 0.95)
// Sampled from the legacy reference sheet's header.
const GOLD = rgb(0.788, 0.635, 0.153)

// Logo rules: fixed max height, width from the image's own aspect ratio but
// never more than 40% of the printable width — oversized art scales down,
// nothing is ever cropped or stretched.
const LOGO_MAX_H = 60
const LOGO_MAX_W = COL_W * 0.4

const ROW_H = 22
const FOOTER_ZONE = MARGIN + 26 // rows never draw below this; footer sits inside it

function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\xFF–—‘’“”•…]/g, '?')
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generatePriceListPdf(data: PriceListPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
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

  function drawTableHeader(page: PDFPage, y: number): number {
    page.drawRectangle({ x: MARGIN, y: y - 20, width: COL_W, height: 20, color: DARK })
    page.drawText('MATERIAL', { x: MARGIN + 8, y: y - 14, size: 10, font: bold, color: rgb(1, 1, 1) })
    let right = MARGIN + COL_W
    if (data.showExVat) {
      drawRight(page, 'EX VAT', right - 8, y - 14, 10, bold, rgb(1, 1, 1))
      right -= PRICE_COL_W
    }
    drawRight(page, 'INC VAT', right - 8, y - 14, 10, bold, rgb(1, 1, 1))
    return y - 20
  }

  function drawFooter(page: PDFPage) {
    if (!data.footerText) return
    const text = sanitize(data.footerText)
    const size = 7.5
    const width = reg.widthOfTextAtSize(text, size)
    page.drawText(text, {
      x: Math.max(MARGIN, (PAGE_W - width) / 2),
      y: MARGIN - 14,
      size,
      font: reg,
      color: GRAY,
      maxWidth: COL_W,
    })
  }

  function newPage(first: boolean): { page: PDFPage; y: number } {
    const page = doc.addPage([PAGE_W, PAGE_H])
    pages.push(page)
    let y = PAGE_H - MARGIN

    if (first) {
      // ── Header: logo left, company name + date right ─────────────────────
      let headerBottom = y
      if (logo) {
        const scale = Math.min(LOGO_MAX_H / logo.height, LOGO_MAX_W / logo.width, 1)
        const w = logo.width * scale
        const h = logo.height * scale
        page.drawImage(logo, { x: MARGIN, y: y - h, width: w, height: h })
        headerBottom = y - h
      }
      const nameSize = 17
      const name = sanitize(data.company.name).toUpperCase()
      drawRight(page, name, MARGIN + COL_W, y - nameSize, nameSize, bold, GOLD)
      drawRight(page, dateLabel, MARGIN + COL_W, y - nameSize - 16, 11, bold, DARK)
      y = Math.min(headerBottom, y - nameSize - 16) - 18

      // ── Title block ──────────────────────────────────────────────────────
      const title = sanitize(data.title).toUpperCase()
      const titleSize = 26
      const titleW = bold.widthOfTextAtSize(title, titleSize)
      page.drawText(title, { x: (PAGE_W - titleW) / 2, y: y - titleSize, size: titleSize, font: bold, color: DARK })
      y -= titleSize + 6
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + COL_W, y }, thickness: 2, color: GOLD })
      y -= 14
    } else {
      y -= 4
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
      page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: COL_W, height: ROW_H, color: LGRAY })
    }
    const textY = y - ROW_H + 7

    let name = sanitize(item.displayName).toUpperCase()
    const maxNameW = materialW - 16
    while (name.length > 1 && bold.widthOfTextAtSize(name, 12) > maxNameW) {
      name = name.slice(0, -2) + '…'
    }
    page.drawText(name, { x: MARGIN + 8, y: textY, size: 12, font: bold, color: DARK })

    let right = MARGIN + COL_W
    if (data.showExVat) {
      drawRight(page, money(item.priceExVat), right - 8, textY, 12, reg)
      right -= PRICE_COL_W
    }
    drawRight(page, money(item.priceIncVat), right - 8, textY, 12, bold)
    y -= ROW_H
  })

  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + COL_W, y }, thickness: 1, color: DARK })
  drawFooter(page)

  // Page numbers only when the list spills over a single page.
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      drawRight(p, `Page ${i + 1} of ${pages.length}`, MARGIN + COL_W, MARGIN - 14, 7.5, reg, GRAY)
    })
  }

  return doc.save()
}
