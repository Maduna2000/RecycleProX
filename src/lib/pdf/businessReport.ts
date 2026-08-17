/**
 * Generic business-report PDF engine.
 *
 * Renders any ReportDocument (multi-level grouped, subtotals per level, grand
 * total, optional summary block) as an A4 portrait black-&-white report in
 * the legacy Lariat layout: title bar with PRINT DATE, selected-date-range
 * line, company info, bordered table with group bands, per-level subtotal
 * rows and a grand-total band, "Page X of Y" + generated-by footer.
 *
 * Walks the flattened row stream with a y-cursor (group bands make row
 * heights uneven), repeats the column header after every page break, and
 * never strands a group header at the bottom of a page.
 *
 * Modeled on cashupReport.ts, which stays untouched — the cash-up pack keeps
 * its own engine. Server-side only. Returns PDF bytes.
 */
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, PDFImage } from 'pdf-lib'
import sharp from 'sharp'
import type { FlatRow, ReportDocument } from '@/lib/reports/types'
import { flattenReportDocument } from '@/lib/reports/flatten'
import { formatCell, formatDateSAST, formatDateTimeSAST } from '@/lib/reports/format'
import { fetchR2Bytes } from '@/lib/r2'

// Scale-kiosk photos are captured at full camera resolution (often several
// MB each) but only ever render as a thumbnail in the printed report — and
// pdf-lib embeds the RAW bytes regardless of how small drawImage later
// scales them on the page, so a report with many photos at native
// resolution can produce a PDF response large enough to exceed the hosting
// platform's response-size cap, which fails the whole download outright
// (surfacing as a bare "Failed to fetch", not a real error). Downscaling
// and re-compressing to a print-thumbnail size before embedding keeps the
// PDF a small fraction of that.
const REPORT_IMAGE_MAX_DIMENSION = 600
const REPORT_IMAGE_JPEG_QUALITY = 70

async function downscaleForReport(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    return await sharp(bytes)
      .rotate() // apply EXIF orientation before stripping metadata
      .resize({ width: REPORT_IMAGE_MAX_DIMENSION, height: REPORT_IMAGE_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: REPORT_IMAGE_JPEG_QUALITY })
      .toBuffer()
  } catch {
    return null
  }
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const PAGE_SIZES: Record<'portrait' | 'landscape', { w: number; h: number }> = {
  portrait: { w: 595, h: 842 }, // A4 portrait
  landscape: { w: 842, h: 595 }, // A4 landscape
}
const MARGIN = 40
const FOOTER_SPACE = 26

const BLACK = rgb(0, 0, 0)
const DARK_GRAY = rgb(0.25, 0.25, 0.25)
const MEDIUM_GRAY = rgb(0.5, 0.5, 0.5)
const LIGHT_GRAY = rgb(0.85, 0.85, 0.85)
const VERY_LIGHT_GRAY = rgb(0.95, 0.95, 0.95)

const GROUP_SHADES = [rgb(0.8, 0.8, 0.8), rgb(0.88, 0.88, 0.88), rgb(0.94, 0.94, 0.94)]

const ROW_H = 15
const IMAGE_ROW_H = 46
const GROUP_H = 16
const SUBTOTAL_H = 16
const GRAND_H = 20
const HEADER_ROW_H = 20
const CELL_PADDING = 4
const BORDER_WIDTH = 0.5
const DATA_FONT_SIZE = 7.5

// WinAnsi-safe: pdf-lib throws on chars outside WinAnsi; replace rather than
// crash. Latin-1 plus the typographic chars WinAnsi does encode (dashes,
// curly quotes, ellipsis, bullet) pass through.
function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\xFF–—‘’“”•…]/g, '?')
}

// Measures with the ACTUAL font/size the text will be drawn with — a fixed
// per-character width estimate (the previous approach) is only right for one
// specific font+size, and silently under-truncates everywhere else (notably
// bold labels, which run wider per character than the regular 7.5pt data
// font that estimate was calibrated for). Under-truncated text then renders
// wider than the column it was budgeted for and spills into the next one —
// this is what caused long group/company names in subtotal bands to run
// straight into the adjacent amount column.
function truncate(text: string, maxWidthPt: number, font: PDFFont, size: number): string {
  const avail = maxWidthPt - CELL_PADDING * 2
  if (font.widthOfTextAtSize(text, size) <= avail) return text
  let result = text
  while (result.length > 1 && font.widthOfTextAtSize(result + '…', size) > avail) {
    result = result.slice(0, -1)
  }
  return result + '…'
}

interface Ctx {
  doc: PDFDocument
  report: ReportDocument
  bold: PDFFont
  reg: PDFFont
  pages: PDFPage[]
  page: PDFPage
  y: number
  /** Page dimensions for this report's orientation (portrait by default). */
  pageW: number
  pageH: number
  contentW: number
  /**
   * Ledger mode: when no level-1 band exists to carry the column labels
   * (flat reports, or ticket bands that carry meta instead), draw a bare
   * columns row at the top of every page including the first.
   */
  ledgerTopColumns: boolean
  /** Row height for 'data' rows in the grid layout — taller when an isImage column is present. */
  dataRowH: number
  /** R2 key -> embedded image, pre-fetched once for every distinct key used by an isImage column. */
  imageCache: Map<string, PDFImage>
}

export async function generateBusinessReportPdf(report: ReportDocument): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)

  const { w: pageW, h: pageH } = PAGE_SIZES[report.orientation ?? 'portrait']
  const contentW = pageW - MARGIN * 2

  const flat = flattenReportDocument(report)

  const hasImageCol = report.columns.some((c) => c.isImage)
  const imageCache = new Map<string, PDFImage>()
  if (hasImageCol) {
    const keys = Array.from(new Set(flat.filter((r) => r.imageR2Key).map((r) => r.imageR2Key as string)))
    // Bounded concurrency instead of one unlimited Promise.all — a report
    // covering a busy month can have 100+ distinct photos, and fetching
    // them all at once risks exhausting memory/bandwidth and blowing past
    // the hosting platform's function timeout (which kills the connection
    // outright, surfacing to the user as a generic "Failed to fetch" rather
    // than any real error). fetchR2Bytes itself is already timeout-bounded
    // per key, so a single slow object just falls back to "No image".
    const IMAGE_FETCH_CONCURRENCY = 6
    for (let i = 0; i < keys.length; i += IMAGE_FETCH_CONCURRENCY) {
      const batch = keys.slice(i, i + IMAGE_FETCH_CONCURRENCY)
      await Promise.all(
        batch.map(async (key) => {
          const bytes = await fetchR2Bytes(key)
          if (!bytes || bytes.length === 0) return
          const downscaled = await downscaleForReport(bytes)
          if (!downscaled) return
          try {
            const img = await doc.embedJpg(downscaled)
            imageCache.set(key, img)
          } catch {
            // Unembeddable image — falls back to "No image" at render time
          }
        })
      )
    }
  }

  const hasPlainClassBands = flat.some((r) => r.type === 'groupHeader' && r.level === 1 && !r.meta)
  const ctx: Ctx = {
    doc, report, bold, reg, pages: [],
    page: undefined as unknown as PDFPage, y: 0,
    pageW, pageH, contentW,
    ledgerTopColumns: !hasPlainClassBands,
    dataRowH: hasImageCol ? IMAGE_ROW_H : ROW_H,
    imageCache,
  }
  newPage(ctx, true)

  for (let i = 0; i < flat.length; i++) {
    const row = flat[i]!
    drawFlatRow(ctx, row, flat[i + 1])
  }

  if (flat.length === 0) {
    ensureSpace(ctx, ROW_H)
    ctx.page.drawText('No records for the selected parameters.', {
      x: MARGIN + CELL_PADDING,
      y: ctx.y - ROW_H + 4,
      size: 8,
      font: reg,
      color: MEDIUM_GRAY,
    })
    ctx.y -= ROW_H
  }

  drawSummaryBlock(ctx)
  stampFooters(ctx)

  return doc.save()
}

// ─── Page management ──────────────────────────────────────────────────────────

function newPage(ctx: Ctx, first: boolean): void {
  ctx.page = ctx.doc.addPage([ctx.pageW, ctx.pageH])
  ctx.pages.push(ctx.page)
  ctx.y = ctx.pageH - MARGIN
  drawPageHeader(ctx, first)
  if (ctx.report.pdfStyle === 'ledger') {
    // Class bands carry the column labels when they exist; otherwise (and on
    // continuation pages) a bare columns row provides the context.
    if (!first || ctx.ledgerTopColumns) drawLedgerColumnsRow(ctx, undefined)
  } else {
    drawTableHeader(ctx)
  }
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + FOOTER_SPACE) {
    newPage(ctx, false)
  }
}

// ─── Header sections ──────────────────────────────────────────────────────────

function drawPageHeader(ctx: Ctx, first: boolean): void {
  const { page, bold, reg, report } = ctx
  let y = ctx.y

  // Title (left) + PRINT DATE box (right)
  const title = sanitize(report.title.toUpperCase())
  page.drawText(truncate(title, ctx.contentW - 150, bold, 12), {
    x: MARGIN, y: y - 4, size: 12, font: bold, color: BLACK,
  })

  const printDate = `PRINT DATE: ${formatDateTimeSAST(report.meta.generatedAt)}`
  page.drawText(printDate, {
    x: ctx.pageW - MARGIN - bold.widthOfTextAtSize(printDate, 8),
    y: y - 3, size: 8, font: bold, color: BLACK,
  })

  y -= 12
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: ctx.pageW - MARGIN, y },
    thickness: 1.2, color: BLACK,
  })
  y -= 12

  if (first) {
    // Selected date range + filters
    let rangeLine = `Selected Date Range From: ${formatDateSAST(report.params.from)}  To: ${formatDateSAST(report.params.to)}`
    if (report.subtitle) rangeLine = `${sanitize(report.subtitle)}  |  ${rangeLine}`
    page.drawText(rangeLine, { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY })
    y -= 12

    // Company info
    const { company } = report.meta
    page.drawText(sanitize(company.name), { x: MARGIN, y, size: 9, font: bold, color: BLACK })
    y -= 10
    if (company.address) {
      page.drawText(sanitize(company.address), { x: MARGIN, y, size: 7.5, font: ctx.reg, color: DARK_GRAY })
      y -= 9
    }
    let infoLine = ''
    if (company.phone) infoLine += `Tel: ${company.phone}`
    if (company.vat) infoLine += (infoLine ? '  |  ' : '') + `VAT: ${company.vat}`
    if (infoLine) {
      page.drawText(sanitize(infoLine), { x: MARGIN, y, size: 7.5, font: reg, color: DARK_GRAY })
      y -= 9
    }
    y -= 4
  }

  ctx.y = y
}

function drawTableHeader(ctx: Ctx): void {
  const { page, bold, report } = ctx
  const headerY = ctx.y - HEADER_ROW_H

  page.drawRectangle({
    x: MARGIN, y: headerY, width: ctx.contentW, height: HEADER_ROW_H,
    color: LIGHT_GRAY, borderColor: BLACK, borderWidth: BORDER_WIDTH,
  })

  let x = MARGIN
  for (let i = 0; i < report.columns.length; i++) {
    const col = report.columns[i]!
    const colW = col.width * ctx.contentW
    if (i > 0) {
      page.drawLine({
        start: { x, y: headerY }, end: { x, y: headerY + HEADER_ROW_H },
        thickness: BORDER_WIDTH, color: BLACK,
      })
    }
    const label = truncate(sanitize(col.label), colW, bold, 8)
    const textX = col.align === 'right'
      ? x + colW - bold.widthOfTextAtSize(label, 8) - CELL_PADDING
      : x + CELL_PADDING
    page.drawText(label, {
      x: textX, y: headerY + (HEADER_ROW_H - 8) / 2, size: 8, font: bold, color: BLACK,
    })
    x += colW
  }

  ctx.y = headerY
}

// ─── Ledger layout (legacy Lariat open ruled style) ──────────────────────────

const LEDGER_ROW_H = 12.5
const LEDGER_BAND_H = 16

/** Width of the leading (left-aligned) columns — the space a band label may occupy. */
function ledgerLabelSpan(ctx: Ctx): number {
  let span = 0
  for (const col of ctx.report.columns) {
    if (col.align === 'right') break
    span += col.width * ctx.contentW
  }
  return Math.max(span, ctx.contentW * 0.25)
}

/** Column labels row; when a material-class band label is given it shares the row (legacy style). */
function drawLedgerColumnsRow(ctx: Ctx, bandLabel: string | undefined): void {
  const { page, bold, report } = ctx
  const rowY = ctx.y - LEDGER_BAND_H

  page.drawLine({
    start: { x: MARGIN, y: ctx.y }, end: { x: ctx.pageW - MARGIN, y: ctx.y },
    thickness: 0.9, color: BLACK,
  })

  if (bandLabel) {
    page.drawText(truncate(sanitize(bandLabel), ledgerLabelSpan(ctx), bold, 9), {
      x: MARGIN, y: rowY + 4.5, size: 9, font: bold, color: BLACK,
    })
  }

  let x = MARGIN
  for (const col of report.columns) {
    const colW = col.width * ctx.contentW
    // Legacy leaves the leading text columns unlabeled — the band name owns that space
    if (col.align === 'right') {
      // Measure precisely — header labels are short and often just fit
      let label = sanitize(col.label)
      while (label.length > 3 && bold.widthOfTextAtSize(label, 7.5) > colW - CELL_PADDING) {
        label = label.slice(0, -2) + '…'
      }
      page.drawText(label, {
        x: x + colW - bold.widthOfTextAtSize(label, 7.5) - CELL_PADDING,
        y: rowY + 5, size: 7.5, font: bold, color: BLACK,
      })
    }
    x += colW
  }

  page.drawLine({
    start: { x: MARGIN, y: rowY }, end: { x: ctx.pageW - MARGIN, y: rowY },
    thickness: 0.5, color: BLACK,
  })
  ctx.y = rowY
}

function drawLedgerGroupHeader(ctx: Ctx, row: FlatRow): void {
  const { page, bold } = ctx
  if (row.level === 0) {
    // Account category: plain bold heading, breathing room above
    ctx.y -= 6
    const rowY = ctx.y - 14
    page.drawText(truncate(sanitize(row.label ?? ''), ctx.contentW, bold, 10), {
      x: MARGIN, y: rowY + 2, size: 10, font: bold, color: BLACK,
    })
    ctx.y = rowY
    return
  }
  if (row.level === 1 && !row.meta) {
    // Material class shares the row with the column labels
    drawLedgerColumnsRow(ctx, row.label)
    return
  }
  if (row.level === 1) {
    // Ticket-style band: label left, meta (date · status · method) right,
    // under a thin rule — column labels live at the top of the page instead
    const rowY = ctx.y - LEDGER_BAND_H
    page.drawLine({
      start: { x: MARGIN, y: ctx.y - 2 }, end: { x: ctx.pageW - MARGIN, y: ctx.y - 2 },
      thickness: 0.5, color: BLACK,
    })
    page.drawText(truncate(sanitize(row.label ?? ''), ctx.contentW * 0.45, bold, 8.5), {
      x: MARGIN, y: rowY + 3.5, size: 8.5, font: bold, color: BLACK,
    })
    const meta = truncate(sanitize(row.meta ?? ''), ctx.contentW * 0.5, ctx.reg, 7.5)
    page.drawText(meta, {
      x: ctx.pageW - MARGIN - ctx.reg.widthOfTextAtSize(meta, 7.5),
      y: rowY + 4, size: 7.5, font: ctx.reg, color: DARK_GRAY,
    })
    ctx.y = rowY
    return
  }
  // Subcategory: small bold label on its own line
  const rowY = ctx.y - LEDGER_ROW_H
  page.drawText(truncate(sanitize(row.label ?? ''), ctx.contentW * 0.4, bold, 7.5), {
    x: MARGIN + 2, y: rowY + 3, size: 7.5, font: bold, color: BLACK,
  })
  ctx.y = rowY
}

function drawLedgerDataRow(ctx: Ctx, row: FlatRow): void {
  const rowY = ctx.y - LEDGER_ROW_H
  drawCellsInColumns(ctx, row.cells ?? {}, rowY, LEDGER_ROW_H, ctx.reg, DATA_FONT_SIZE, false)
  ctx.y = rowY
}

function drawLedgerTotalRow(ctx: Ctx, row: FlatRow, grand: boolean): void {
  const { page, bold, report } = ctx
  const level = row.level
  const h = grand || level === 0 ? 16 : 14
  const rowY = ctx.y - h

  // Rule above the totals row — heavier for higher levels
  const thickness = grand ? 1.2 : level === 0 ? 1 : level === 1 ? 0.8 : 0.5
  page.drawLine({
    start: { x: MARGIN, y: ctx.y - 1.5 }, end: { x: ctx.pageW - MARGIN, y: ctx.y - 1.5 },
    thickness, color: BLACK,
  })
  if (grand) {
    page.drawLine({
      start: { x: MARGIN, y: ctx.y - 3.5 }, end: { x: ctx.pageW - MARGIN, y: ctx.y - 3.5 },
      thickness: 0.5, color: BLACK,
    })
  }

  // Legacy shows just the group name (no "TOTAL:"), right-aligned before the amounts
  const cells = row.cells ?? {}
  const firstMeasureIdx = report.columns.findIndex((c) =>
    Object.prototype.hasOwnProperty.call(cells, c.key)
  )
  const labelSpanW = report.columns
    .slice(0, firstMeasureIdx === -1 ? report.columns.length : firstMeasureIdx)
    .reduce((w, c) => w + c.width * ctx.contentW, 0)
  const size = grand || level === 0 ? 9 : 8
  const label = truncate(
    sanitize(grand ? (row.label ?? 'GRAND TOTAL:') : (row.label ?? '').replace(/\s+TOTAL:$/, '')),
    Math.max(labelSpanW, 120),
    bold, size
  )
  page.drawText(label, {
    x: Math.max(MARGIN, MARGIN + labelSpanW - bold.widthOfTextAtSize(label, size) - 10),
    y: rowY + (h - size) / 2, size, font: bold, color: BLACK,
  })

  drawCellsInColumns(ctx, cells, rowY, h, bold, DATA_FONT_SIZE, false)
  ctx.y = rowY
  if (grand || level === 0) ctx.y -= 4
}

// ─── Row rendering ────────────────────────────────────────────────────────────

function drawFlatRow(ctx: Ctx, row: FlatRow, next: FlatRow | undefined): void {
  if (ctx.report.pdfStyle === 'ledger') {
    switch (row.type) {
      case 'groupHeader': {
        const lookahead = next?.type === 'groupHeader' ? LEDGER_BAND_H + LEDGER_ROW_H * 2 : LEDGER_ROW_H * 2
        ensureSpace(ctx, LEDGER_BAND_H + lookahead)
        drawLedgerGroupHeader(ctx, row)
        break
      }
      case 'data':
        ensureSpace(ctx, LEDGER_ROW_H)
        drawLedgerDataRow(ctx, row)
        break
      case 'subtotal':
        ensureSpace(ctx, 18)
        drawLedgerTotalRow(ctx, row, false)
        break
      case 'grandTotal':
        ensureSpace(ctx, 24)
        drawLedgerTotalRow(ctx, row, true)
        break
    }
    return
  }

  switch (row.type) {
    case 'groupHeader': {
      // Never strand a band at a page bottom: need the band + ~2 rows,
      // more when the next row is a nested band.
      const lookahead = next?.type === 'groupHeader' ? GROUP_H + ROW_H * 2 : ROW_H * 2
      ensureSpace(ctx, GROUP_H + lookahead)
      drawGroupHeader(ctx, row)
      break
    }
    case 'data':
      ensureSpace(ctx, ctx.dataRowH)
      drawDataRow(ctx, row)
      break
    case 'subtotal':
      ensureSpace(ctx, SUBTOTAL_H)
      drawSubtotalRow(ctx, row)
      break
    case 'grandTotal':
      ensureSpace(ctx, GRAND_H + 6)
      drawGrandTotalRow(ctx, row)
      break
  }
}

function drawGroupHeader(ctx: Ctx, row: FlatRow): void {
  const { page, bold, reg } = ctx
  const bandY = ctx.y - GROUP_H
  const shade = GROUP_SHADES[Math.min(row.level, GROUP_SHADES.length - 1)]!

  page.drawRectangle({
    x: MARGIN, y: bandY, width: ctx.contentW, height: GROUP_H,
    color: shade, borderColor: BLACK, borderWidth: BORDER_WIDTH,
  })

  const indent = MARGIN + CELL_PADDING + row.level * 10
  const label = truncate(sanitize(row.label ?? ''), ctx.contentW - row.level * 10 - (row.meta ? 180 : 0), bold, 8)
  page.drawText(label, {
    x: indent, y: bandY + (GROUP_H - 8) / 2, size: 8, font: bold, color: BLACK,
  })

  if (row.meta) {
    const meta = truncate(sanitize(row.meta), 176, reg, 7)
    page.drawText(meta, {
      x: ctx.pageW - MARGIN - reg.widthOfTextAtSize(meta, 7) - CELL_PADDING,
      y: bandY + (GROUP_H - 7) / 2, size: 7, font: reg, color: DARK_GRAY,
    })
  }

  ctx.y = bandY
}

function drawCellsInColumns(
  ctx: Ctx,
  cells: Record<string, string | null>,
  rowY: number,
  rowH: number,
  font: PDFFont,
  size: number,
  withBorders: boolean,
  rowImageKey?: string | null
): void {
  const { page, report } = ctx
  let x = MARGIN
  for (let i = 0; i < report.columns.length; i++) {
    const col = report.columns[i]!
    const colW = col.width * ctx.contentW
    if (withBorders && i > 0) {
      page.drawLine({
        start: { x, y: rowY }, end: { x, y: rowY + rowH },
        thickness: BORDER_WIDTH, color: BLACK,
      })
    }
    if (col.isImage) {
      // rowImageKey === undefined means this call site (header/subtotal/grand
      // total/ledger rows) doesn't track a per-row image — leave the cell
      // blank rather than claim "No image" for a row that was never a photo row.
      const img = rowImageKey ? ctx.imageCache.get(rowImageKey) : undefined
      if (img) {
        const availW = colW - CELL_PADDING * 2
        const availH = rowH - 4
        const scale = Math.min(availW / img.width, availH / img.height, 1)
        const imgW = img.width * scale
        const imgH = img.height * scale
        page.drawImage(img, {
          x: x + (colW - imgW) / 2,
          y: rowY + (rowH - imgH) / 2,
          width: imgW,
          height: imgH,
        })
      } else if (rowImageKey !== undefined) {
        page.drawText('No image', {
          x: x + CELL_PADDING, y: rowY + (rowH - size) / 2, size, font: ctx.reg, color: MEDIUM_GRAY,
        })
      }
    } else if (Object.prototype.hasOwnProperty.call(cells, col.key)) {
      const raw = cells[col.key]
      const value = truncate(sanitize(formatCell(raw, col.format, ctx.report.meta.currencySymbol)), colW, font, size)
      const textX = col.align === 'right'
        ? x + colW - font.widthOfTextAtSize(value, size) - CELL_PADDING
        : x + CELL_PADDING
      page.drawText(value, { x: textX, y: rowY + (rowH - size) / 2, size, font, color: BLACK })
    }
    x += colW
  }
}

function drawDataRow(ctx: Ctx, row: FlatRow): void {
  const { page, reg } = ctx
  const rowY = ctx.y - ctx.dataRowH

  // Bordered cell row with left/right edges (zebra shading skipped — group
  // bands already delineate; legacy reports use plain white data rows)
  page.drawRectangle({
    x: MARGIN, y: rowY, width: ctx.contentW, height: ctx.dataRowH,
    borderColor: BLACK, borderWidth: BORDER_WIDTH,
  })

  drawCellsInColumns(ctx, row.cells ?? {}, rowY, ctx.dataRowH, reg, DATA_FONT_SIZE, true, row.imageR2Key ?? null)
  ctx.y = rowY
}

function drawSubtotalRow(ctx: Ctx, row: FlatRow): void {
  const { page, bold, report } = ctx
  const rowY = ctx.y - SUBTOTAL_H

  page.drawRectangle({
    x: MARGIN, y: rowY, width: ctx.contentW, height: SUBTOTAL_H,
    color: VERY_LIGHT_GRAY, borderColor: BLACK, borderWidth: BORDER_WIDTH,
  })
  // Double top border — classic "totals" ruling
  page.drawLine({
    start: { x: MARGIN, y: rowY + SUBTOTAL_H - 1.5 },
    end: { x: ctx.pageW - MARGIN, y: rowY + SUBTOTAL_H - 1.5 },
    thickness: BORDER_WIDTH, color: BLACK,
  })

  // Label sits in the leading (non-measure) columns
  const cells = row.cells ?? {}
  const firstMeasureIdx = report.columns.findIndex((c) =>
    Object.prototype.hasOwnProperty.call(cells, c.key)
  )
  const labelSpanW = report.columns
    .slice(0, firstMeasureIdx === -1 ? report.columns.length : firstMeasureIdx)
    .reduce((w, c) => w + c.width * ctx.contentW, 0)
  const label = truncate(sanitize(row.label ?? 'TOTAL:'), Math.max(labelSpanW, 120), bold, 8)
  const labelX = Math.max(
    MARGIN + CELL_PADDING,
    MARGIN + labelSpanW - bold.widthOfTextAtSize(label, 8) - CELL_PADDING
  )
  ctx.page.drawText(label, {
    x: labelX, y: rowY + (SUBTOTAL_H - 8) / 2, size: 8, font: bold, color: BLACK,
  })

  drawCellsInColumns(ctx, cells, rowY, SUBTOTAL_H, bold, DATA_FONT_SIZE, false)
  ctx.y = rowY
}

function drawGrandTotalRow(ctx: Ctx, row: FlatRow): void {
  const { page, bold, report } = ctx
  ctx.y -= 4
  const rowY = ctx.y - GRAND_H

  page.drawRectangle({
    x: MARGIN, y: rowY, width: ctx.contentW, height: GRAND_H,
    color: LIGHT_GRAY, borderColor: BLACK, borderWidth: 1,
  })

  const cells = row.cells ?? {}
  const firstMeasureIdx = report.columns.findIndex((c) =>
    Object.prototype.hasOwnProperty.call(cells, c.key)
  )
  const labelSpanW = report.columns
    .slice(0, firstMeasureIdx === -1 ? report.columns.length : firstMeasureIdx)
    .reduce((w, c) => w + c.width * ctx.contentW, 0)
  const label = sanitize(row.label ?? 'GRAND TOTAL:')
  const labelX = Math.max(
    MARGIN + CELL_PADDING,
    MARGIN + labelSpanW - bold.widthOfTextAtSize(label, 9) - CELL_PADDING
  )
  page.drawText(label, {
    x: labelX, y: rowY + (GRAND_H - 9) / 2, size: 9, font: bold, color: BLACK,
  })

  drawCellsInColumns(ctx, cells, rowY, GRAND_H, bold, 8, false)
  ctx.y = rowY
}

function drawSummaryBlock(ctx: Ctx): void {
  const { report, bold, reg } = ctx
  if (!report.summary || report.summary.length === 0) return

  ctx.y -= 10
  for (const line of report.summary) {
    ensureSpace(ctx, 14)
    const font = line.emphasis ? bold : reg
    const size = line.emphasis ? 9 : 8
    const label = sanitize(line.label)
    const value = sanitize(line.value)
    const valueW = font.widthOfTextAtSize(value, size)
    ctx.page.drawText(label, {
      x: ctx.pageW - MARGIN - 220, y: ctx.y - 10, size, font, color: BLACK,
    })
    ctx.page.drawText(value, {
      x: ctx.pageW - MARGIN - valueW, y: ctx.y - 10, size, font, color: BLACK,
    })
    ctx.y -= 14
  }
}

// ─── Footers (stamped after layout so "Page X of Y" is exact) ─────────────────

function stampFooters(ctx: Ctx): void {
  const { pages, reg, report } = ctx
  const total = pages.length
  const generated = `Generated: ${formatDateTimeSAST(report.meta.generatedAt)} by ${sanitize(report.meta.generatedBy)}  |  ${sanitize(report.meta.company.name)}  |  Renovo Pro`
  for (let i = 0; i < total; i++) {
    const page = pages[i]!
    page.drawText(generated, {
      x: MARGIN, y: MARGIN - 14, size: 6, font: reg, color: MEDIUM_GRAY,
    })
    const pageText = `Page ${i + 1} of ${total}`
    page.drawText(pageText, {
      x: ctx.pageW - MARGIN - reg.widthOfTextAtSize(pageText, 7), y: MARGIN - 14,
      size: 7, font: reg, color: DARK_GRAY,
    })
  }
}
