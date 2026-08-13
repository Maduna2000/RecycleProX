/**
 * Daily materials price list — A4 document matching the yard's reference
 * price sheet precisely: a rounded inset header card (logo/company, small
 * letter-spaced subtitle, a rounded date pill), a quiet neutral column-
 * header row, category divider bars (COPPER, BRASS, ...) grouping the
 * table, a tight uniform row grid, and a rounded footer card carrying the
 * declaration text — mirroring the header so the page reads as one
 * designed object. Server-side only.
 *
 * Layout constants below are measured from the reference document (see
 * docs/superpowers/specs/2026-08-13-price-list-builder-design.md history)
 * rather than guessed: 26pt page margin, 17pt uniform row grid, #0B3D2E /
 * #C9A227 sampled from the reference render.
 */
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, PDFImage } from 'pdf-lib'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriceListPdfItem {
  displayName: string
  category: string
  /** INC VAT price, 2 dp string. */
  priceIncVat: string
  /** EX VAT price, 2 dp string (derived by the caller — never stored). */
  priceExVat: string
}

/** Print palette — hex strings (#RRGGBB). Every document has all seven, defaulted server-side by the Zod schema. */
export interface PriceListPdfColors {
  primaryColor:      string
  accentColor:       string
  headerTextColor:   string
  materialTextColor: string
  priceTextColor:    string
  exVatTextColor:    string
  rowTintColor:      string
}

export interface PriceListPdfData {
  title: string
  listDate: Date
  footerText: string
  showExVat: boolean
  colors: PriceListPdfColors
  company: { name: string; address?: string; phone?: string }
  /** PNG or JPG bytes; rendered per the logo rules when present. */
  logoBytes?: Uint8Array | null
  currencySymbol: string
  items: PriceListPdfItem[]
  generatedAt: Date
}

function hexToRgb(hex: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return rgb(0, 0, 0)
  return rgb(parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255)
}

// ─── Layout constants (measured from the reference document) ──────────────────

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 26
const COL_W = PAGE_W - MARGIN * 2

const CARD_RADIUS = 14
const CARD_PAD = 18
const HEADER_CARD_H = 74
const CONT_BAR_H = 26
const FOOTER_CARD_H = 32
const ROW_H = 17
const PRICE_COL_W = 92
const PRICE_PAD = 15 // internal right padding for price text within its column

// Logo rules: fixed max height, width from the image's own aspect ratio but
// capped — oversized art scales down, nothing is ever cropped or stretched.
const LOGO_MAX_H = 30
const LOGO_MAX_W = COL_W * 0.32

// Fixed neutrals — not part of the customizable palette, so the column
// header stays quiet regardless of the chosen scheme (the category bars
// remain the only mid-page color accent) and hairlines stay legible.
const NEUTRAL_HEADER_BG = rgb(0.94, 0.94, 0.94)
const NEUTRAL_HEADER_TX = rgb(0.4, 0.4, 0.4)
const DARK = rgb(0.07, 0.07, 0.07)
const HAIRLINE = rgb(0.93, 0.93, 0.93)

function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\xFF–—‘’“”•…]/g, '?')
}

/** M/L/Q rounded-rectangle path — bottom-left anchored, verified against pdf-lib's drawSvgPath coordinate convention. */
function roundedRectPath(w: number, h: number, r: number): string {
  return `M ${r},0 L ${w - r},0 Q ${w},0 ${w},${r} L ${w},${h - r} Q ${w},${h} ${w - r},${h} L ${r},${h} Q 0,${h} 0,${h - r} L 0,${r} Q 0,0 ${r},0 Z`
}

function groupByCategory<T extends { category: string }>(items: T[]): { category: string; items: T[] }[] {
  const order: string[] = []
  const map = new Map<string, T[]>()
  for (const item of items) {
    const cat = item.category?.trim() || 'Other'
    if (!map.has(cat)) { map.set(cat, []); order.push(cat) }
    map.get(cat)!.push(item)
  }
  return order.map((category) => ({ category, items: map.get(category)! }))
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generatePriceListPdf(data: PriceListPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const sym = data.currencySymbol

  const PRIMARY   = hexToRgb(data.colors.primaryColor)
  const ACCENT    = hexToRgb(data.colors.accentColor)
  const HEADER_TX = hexToRgb(data.colors.headerTextColor)
  const MATERIAL_TX = hexToRgb(data.colors.materialTextColor)
  const PRICE_TX  = hexToRgb(data.colors.priceTextColor)
  const EXVAT_TX  = hexToRgb(data.colors.exVatTextColor)
  const ROW_TINT  = hexToRgb(data.colors.rowTintColor)

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

  const priceCols = data.showExVat ? 2 : 1
  const materialW = COL_W - PRICE_COL_W * priceCols

  const pages: PDFPage[] = []

  function money(v: string): string {
    return `${sym}${new Decimal(v).toFixed(2)}`
  }

  /** Rounded card. `topY` is the shape's TOP edge — drawSvgPath anchors there and extends downward, unlike drawRectangle's bottom-left anchor. */
  function card(page: PDFPage, x: number, topY: number, w: number, h: number, color = PRIMARY, opacity = 1) {
    page.drawSvgPath(roundedRectPath(w, h, CARD_RADIUS), { x, y: topY, color, opacity })
  }

  function drawRight(page: PDFPage, text: string, rightEdge: number, y: number, size: number, font: PDFFont, color = DARK, opacity = 1) {
    page.drawText(text, { x: rightEdge - font.widthOfTextAtSize(text, size), y, size, font, color, opacity })
  }

  function drawCentered(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = DARK, opacity = 1) {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (PAGE_W - w) / 2, y, size, font, color, opacity })
  }

  /** Draws letter-spaced text (small-caps labels) and returns the x position after the last character. */
  function drawSpaced(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = DARK, spacing = 1.6, opacity = 1): number {
    let cx = x
    for (const ch of text) {
      page.drawText(ch, { x: cx, y, size, font, color, opacity })
      cx += font.widthOfTextAtSize(ch, size) + spacing
    }
    return cx - spacing
  }

  function drawSpacedRight(page: PDFPage, text: string, rightEdge: number, y: number, size: number, font: PDFFont, color = DARK, spacing = 1.6, opacity = 1) {
    let width = 0
    for (const ch of text) width += font.widthOfTextAtSize(ch, size) + spacing
    width -= spacing
    drawSpaced(page, text, rightEdge - width, y, size, font, color, spacing, opacity)
  }

  function drawColumnHeader(page: PDFPage, y: number): number {
    page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: COL_W, height: ROW_H, color: NEUTRAL_HEADER_BG })
    const textY = y - ROW_H + 6
    drawSpaced(page, 'MATERIAL', MARGIN + 8, textY, 8, bold, NEUTRAL_HEADER_TX, 1.2)
    let right = MARGIN + COL_W
    drawSpacedRight(page, 'INC VAT', right - 8, textY, 8, bold, NEUTRAL_HEADER_TX, 1.2)
    if (data.showExVat) {
      right -= PRICE_COL_W
      drawSpacedRight(page, 'EX VAT', right - 8, textY, 8, bold, NEUTRAL_HEADER_TX, 1.2)
    }
    return y - ROW_H
  }

  function drawCategoryBar(page: PDFPage, category: string, y: number): number {
    page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: COL_W, height: ROW_H, color: PRIMARY })
    const textY = y - ROW_H + 6
    drawSpaced(page, sanitize(category).toUpperCase(), MARGIN + 8, textY, 8, bold, HEADER_TX, 1.4)
    return y - ROW_H
  }

  function newPage(first: boolean): { page: PDFPage; y: number } {
    const page = doc.addPage([PAGE_W, PAGE_H])
    pages.push(page)
    let y = PAGE_H - MARGIN

    if (first) {
      // ── Rounded header card: logo/company, subtitle, date pill ──────────
      // card()'s y anchor is the shape's TOP edge (drawSvgPath convention —
      // verified empirically, opposite of drawRectangle's bottom-left).
      const cardBottom = y - HEADER_CARD_H
      card(page, MARGIN, y, COL_W, HEADER_CARD_H)

      let contentX = MARGIN + CARD_PAD
      const rowTopY = y - CARD_PAD
      if (logo) {
        const scale = Math.min(LOGO_MAX_H / logo.height, LOGO_MAX_W / logo.width, 1)
        const w = logo.width * scale
        const h = logo.height * scale
        page.drawImage(logo, { x: contentX, y: rowTopY - h, width: w, height: h })
        contentX += w + 10
      }
      const nameSize = 16
      const nameBaselineY = rowTopY - nameSize + 2
      page.drawText(sanitize(data.company.name).toUpperCase(), { x: contentX, y: nameBaselineY, size: nameSize, font: bold, color: HEADER_TX })
      drawSpaced(page, sanitize(data.title).toUpperCase(), contentX, nameBaselineY - 16, 9, bold, HEADER_TX, 1.8, 0.85)

      // Date pill, top-right, fully rounded ends
      const pillH = 18
      const pillTextSize = 10
      const pillPadX = 10
      const dateW = bold.widthOfTextAtSize(dateLabel, pillTextSize)
      const pillW = dateW + pillPadX * 2
      const pillX = PAGE_W - MARGIN - CARD_PAD - pillW
      const pillY = rowTopY - pillH
      page.drawSvgPath(roundedRectPath(pillW, pillH, pillH / 2), { x: pillX, y: rowTopY, color: ACCENT })
      page.drawText(dateLabel, { x: pillX + pillPadX, y: pillY + 5, size: pillTextSize, font: bold, color: DARK })

      // Optional address/phone, right-aligned under the pill
      if (data.company.address || data.company.phone) {
        const infoParts = [data.company.address, data.company.phone].filter(Boolean).join('  •  ')
        drawRight(page, sanitize(infoParts), PAGE_W - MARGIN - CARD_PAD, pillY - 11, 7, reg, HEADER_TX, 0.8)
      }

      y = cardBottom - 12
    } else {
      // Continuation pages get a slim repeat of the card, no logo/letterhead.
      const barBottom = y - CONT_BAR_H
      card(page, MARGIN, y, COL_W, CONT_BAR_H)
      const textY = barBottom + 8
      page.drawText(sanitize(data.title).toUpperCase(), { x: MARGIN + CARD_PAD, y: textY, size: 10, font: bold, color: HEADER_TX })
      drawRight(page, `${dateLabel} — continued`, PAGE_W - MARGIN - CARD_PAD, textY, 8, reg, HEADER_TX, 0.85)
      y = barBottom - 12
    }

    y = drawColumnHeader(page, y)
    return { page, y }
  }

  // Every page still needs FOOTER_ZONE clearance below its content for the
  // bottom-anchored footer card.
  const FOOTER_ZONE = MARGIN + FOOTER_CARD_H + 12

  let { page, y } = newPage(true)
  const sections = groupByCategory(data.items)

  for (const section of sections) {
    // Require room for the divider AND at least one row — otherwise the
    // divider is orphaned at the bottom of the page with its rows pushed to
    // an unlabeled continuation.
    if (y - ROW_H * 2 < FOOTER_ZONE) {
      ;({ page, y } = newPage(false))
    }
    y = drawCategoryBar(page, section.category, y)

    section.items.forEach((item, i) => {
      if (y - ROW_H < FOOTER_ZONE) {
        ;({ page, y } = newPage(false))
      }
      if (i % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: COL_W, height: ROW_H, color: ROW_TINT })
      }
      const textY = y - ROW_H + 5

      let name = sanitize(item.displayName)
      const maxNameW = materialW - 16
      while (name.length > 1 && reg.widthOfTextAtSize(name, 10) > maxNameW) {
        name = name.slice(0, -2) + '…'
      }
      page.drawText(name, { x: MARGIN + 8, y: textY, size: 10, font: reg, color: MATERIAL_TX })

      let right = MARGIN + COL_W
      drawRight(page, money(item.priceIncVat), right - PRICE_PAD, textY, 10, bold, PRICE_TX)
      if (data.showExVat) {
        right -= PRICE_COL_W
        drawRight(page, money(item.priceExVat), right - PRICE_PAD, textY, 10, bold, EXVAT_TX)
      }
      y -= ROW_H

      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + COL_W, y }, thickness: 0.5, color: HAIRLINE })
    })
  }

  // ── Footer card on every page — bookends the header, mirrors its style ─────
  pages.forEach((p, i) => {
    card(p, MARGIN, MARGIN + FOOTER_CARD_H, COL_W, FOOTER_CARD_H)
    if (data.footerText) {
      drawCentered(p, sanitize(data.footerText), MARGIN + 12, 7.5, reg, HEADER_TX, 0.9)
    }
    if (pages.length > 1) {
      drawRight(p, `Page ${i + 1} of ${pages.length}`, MARGIN + COL_W - CARD_PAD, MARGIN + 12, 7, reg, HEADER_TX, 0.6)
    }
  })

  return doc.save()
}
