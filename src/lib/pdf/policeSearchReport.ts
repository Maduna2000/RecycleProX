/**
 * Police search-result report PDFs, downloaded by officers from the portal:
 *
 *  - Person Record Report: identity details + ID photo + blacklist status
 *    + the person's full transaction history at this yard.
 *  - Goods Trace Report: every purchase line of a product across a date
 *    range — who sold it, when, how much.
 *
 * Both downloads are logged against the inspection visit like searches.
 * Returns Uint8Array (PDF bytes). Server-side only.
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import Decimal from 'decimal.js'

const PAGE_W = 595   // A4 portrait
const PAGE_H = 841
const MARGIN = 48

const DARK_BLUE = rgb(0.05, 0.18, 0.40)
const GREEN     = rgb(0.11, 0.53, 0.22)
const DARK      = rgb(0.1, 0.1, 0.1)
const GRAY      = rgb(0.5, 0.5, 0.5)
const LGRAY     = rgb(0.94, 0.94, 0.94)
const WHITE     = rgb(1, 1, 1)
const RED       = rgb(0.75, 0.1, 0.1)

export interface ReportOfficer {
  name:        string
  rank:        string | null
  badgeNumber: string | null
  stationName: string | null
}

interface ReportBase {
  policeServiceName: string
  dealerName:        string
  dealerAddress:     string
  officer:           ReportOfficer
  generatedAt:       Date
  currencySymbol?:   string
}

function drawHeader(page: PDFPage, bold: PDFFont, reg: PDFFont, title: string, serviceName: string, pageLabel: string) {
  page.drawRectangle({ x: 0, y: PAGE_H - 64, width: PAGE_W, height: 64, color: DARK_BLUE })
  page.drawText(title, { x: MARGIN, y: PAGE_H - 30, size: 14, font: bold, color: WHITE })
  page.drawText(serviceName, { x: MARGIN, y: PAGE_H - 48, size: 9, font: reg, color: rgb(0.7, 0.8, 1) })
  page.drawText(pageLabel, {
    x: PAGE_W - MARGIN - reg.widthOfTextAtSize(pageLabel, 8),
    y: PAGE_H - 48, size: 8, font: reg, color: rgb(0.7, 0.8, 1),
  })
}

function drawSectionBar(page: PDFPage, bold: PDFFont, label: string, y: number): number {
  page.drawRectangle({ x: MARGIN, y: y - 6, width: PAGE_W - MARGIN * 2, height: 18, color: GREEN })
  page.drawText(label, { x: MARGIN + 6, y: y - 1, size: 9, font: bold, color: WHITE })
  return y - 26
}

function drawKV(page: PDFPage, bold: PDFFont, reg: PDFFont, rows: [string, string][], y: number, labelWidth = 150): number {
  for (const [label, value] of rows) {
    page.drawText(label, { x: MARGIN + 6,          y, size: 9, font: bold, color: GRAY })
    page.drawText(value, { x: MARGIN + labelWidth, y, size: 9, font: reg,  color: DARK })
    y -= 15
  }
  return y
}

function drawFooter(page: PDFPage, reg: PDFFont, base: ReportBase, ref: string) {
  page.drawText(
    `${ref} · Generated: ${base.generatedAt.toLocaleString('en-ZA')} · ${base.dealerName} · Renovo Pro`,
    { x: MARGIN, y: 30, size: 6, font: reg, color: GRAY }
  )
}

function officerRows(o: ReportOfficer): [string, string][] {
  return [
    ['Requested by',   `${o.rank ? o.rank + ' ' : ''}${o.name}`],
    ['Service number', o.badgeNumber ?? '—'],
    ['Police station', o.stationName ?? '—'],
  ]
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max - 1) + '…' : s
}

// ─── Person Record Report ─────────────────────────────────────────────────────

export interface PersonRecordReportData extends ReportBase {
  person: {
    fullName:        string
    idNumber:        string | null
    dateOfBirth:     Date | null
    gender:          string | null
    nationality:     string | null
    phone:           string
    email:           string | null
    address:         string
    blacklisted:     boolean
    blacklistReason: string | null
    idPhotoBytes:    Uint8Array | null
  }
  purchases: {
    createdAt:   Date
    refNumber:   string
    items:       string
    totalAmount: string
  }[]
}

export async function generatePersonRecordReport(data: PersonRecordReportData): Promise<Uint8Array> {
  const sym  = data.currencySymbol ?? 'R'
  const doc  = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)

  const ROWS_FIRST = 18
  const ROWS_NEXT  = 38
  const chunks: PersonRecordReportData['purchases'][] = []
  if (data.purchases.length <= ROWS_FIRST) {
    chunks.push(data.purchases)
  } else {
    chunks.push(data.purchases.slice(0, ROWS_FIRST))
    for (let i = ROWS_FIRST; i < data.purchases.length; i += ROWS_NEXT) {
      chunks.push(data.purchases.slice(i, i + ROWS_NEXT))
    }
  }
  const totalPages = chunks.length

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = doc.addPage([PAGE_W, PAGE_H])
    drawHeader(page, bold, reg, 'PERSON RECORD REPORT', data.policeServiceName, `Page ${pageIdx + 1} of ${totalPages}`)
    let y = PAGE_H - 84

    if (pageIdx === 0) {
      page.drawText(`Dealer: ${data.dealerName}`, { x: MARGIN, y, size: 10, font: bold, color: DARK })
      y -= 14
      page.drawText(`Address: ${data.dealerAddress}`, { x: MARGIN, y, size: 9, font: reg, color: DARK })
      y -= 22

      y = drawSectionBar(page, bold, 'REQUESTING OFFICER', y)
      y = drawKV(page, bold, reg, officerRows(data.officer), y)
      y -= 8

      y = drawSectionBar(page, bold, 'PERSON DETAILS', y)

      // ID photo on the right of the details block
      const photoX = PAGE_W - MARGIN - 110
      if (data.person.idPhotoBytes && data.person.idPhotoBytes.length > 0) {
        try {
          let img
          try { img = await doc.embedPng(data.person.idPhotoBytes) }
          catch { img = await doc.embedJpg(data.person.idPhotoBytes) }
          const imgW = 104
          const imgH = Math.min(120, img.height * (imgW / img.width))
          page.drawImage(img, { x: photoX, y: y - imgH + 8, width: imgW, height: imgH })
          page.drawRectangle({ x: photoX, y: y - imgH + 8, width: imgW, height: imgH, borderColor: GRAY, borderWidth: 0.5 })
          page.drawText('ID Photo', { x: photoX, y: y - imgH - 2, size: 7, font: reg, color: GRAY })
        } catch { /* unreadable image — skip */ }
      } else {
        page.drawRectangle({ x: photoX, y: y - 112, width: 104, height: 120, color: LGRAY, borderColor: GRAY, borderWidth: 0.5 })
        page.drawText('No ID photo', { x: photoX + 24, y: y - 56, size: 8, font: reg, color: GRAY })
      }

      const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('en-ZA') : '—'
      y = drawKV(page, bold, reg, [
        ['Full name',     data.person.fullName],
        ['ID number',     data.person.idNumber ?? '—'],
        ['Date of birth', fmtDate(data.person.dateOfBirth)],
        ['Gender',        data.person.gender ?? '—'],
        ['Nationality',   data.person.nationality ?? '—'],
        ['Phone',         data.person.phone],
        ['Email',         data.person.email ?? '—'],
        ['Address',       truncate(data.person.address, 55)],
      ], y)
      y -= 6

      if (data.person.blacklisted) {
        const reason = data.person.blacklistReason ? ` — ${truncate(data.person.blacklistReason, 70)}` : ''
        page.drawRectangle({ x: MARGIN, y: y - 8, width: PAGE_W - MARGIN * 2, height: 20, color: rgb(0.99, 0.93, 0.92), borderColor: RED, borderWidth: 0.7 })
        page.drawText(`BLACKLISTED AT THIS YARD${reason}`, { x: MARGIN + 8, y: y - 2, size: 8.5, font: bold, color: RED })
        y -= 26
      }

      y = drawSectionBar(page, bold, `TRANSACTION HISTORY (${data.purchases.length})`, y)
    }

    // Transactions table
    const rows = chunks[pageIdx] ?? []
    if (rows.length === 0 && pageIdx === 0) {
      page.drawText('No completed purchases on record for this person.', { x: MARGIN + 6, y, size: 9, font: reg, color: GRAY })
      y -= 18
    } else if (rows.length > 0) {
      page.drawText('Date / Time', { x: MARGIN + 6,   y, size: 8, font: bold, color: GRAY })
      page.drawText('Ref No.',     { x: MARGIN + 95,  y, size: 8, font: bold, color: GRAY })
      page.drawText('Goods',       { x: MARGIN + 200, y, size: 8, font: bold, color: GRAY })
      page.drawText(`Amount (${sym})`,  { x: PAGE_W - MARGIN - 70, y, size: 8, font: bold, color: GRAY })
      y -= 14
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!
        if (i % 2 === 1) {
          page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - MARGIN * 2, height: 15, color: LGRAY })
        }
        const when = r.createdAt.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' })
        page.drawText(when,                     { x: MARGIN + 6,   y, size: 8, font: reg,  color: DARK })
        page.drawText(r.refNumber,              { x: MARGIN + 95,  y, size: 8, font: bold, color: DARK })
        page.drawText(truncate(r.items, 40),    { x: MARGIN + 200, y, size: 8, font: reg,  color: DARK })
        const amt = `${sym} ${new Decimal(r.totalAmount).toFixed(2)}`
        page.drawText(amt, { x: PAGE_W - MARGIN - 6 - reg.widthOfTextAtSize(amt, 8), y, size: 8, font: reg, color: DARK })
        y -= 15
      }
    }

    // Totals on last page
    if (pageIdx === totalPages - 1 && data.purchases.length > 0) {
      const total = data.purchases.reduce((acc, p) => acc.plus(new Decimal(p.totalAmount)), new Decimal(0))
      y -= 6
      page.drawLine({ start: { x: MARGIN, y: y + 10 }, end: { x: PAGE_W - MARGIN, y: y + 10 }, thickness: 0.5, color: GRAY })
      const label = `Total paid to this person: ${sym} ${total.toFixed(2)}`
      page.drawText(label, {
        x: PAGE_W - MARGIN - bold.widthOfTextAtSize(label, 9), y: y - 2, size: 9, font: bold, color: RED,
      })
    }

    drawFooter(page, reg, data, 'Person Record Report')
  }

  return doc.save()
}

// ─── Goods Trace Report ───────────────────────────────────────────────────────

export interface GoodsTraceReportData extends ReportBase {
  productName: string
  unit:        string
  from:        string | null
  to:          string | null
  minQuantity: number | null
  rows: {
    createdAt:    Date
    refNumber:    string
    supplierName: string
    idNumber:     string | null
    blacklisted:  boolean
    quantity:     string
    lineTotal:    string
  }[]
}

export async function generateGoodsTraceReport(data: GoodsTraceReportData): Promise<Uint8Array> {
  const sym  = data.currencySymbol ?? 'R'
  const doc  = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)

  const ROWS_FIRST = 28
  const ROWS_NEXT  = 40
  const chunks: GoodsTraceReportData['rows'][] = []
  if (data.rows.length <= ROWS_FIRST) {
    chunks.push(data.rows)
  } else {
    chunks.push(data.rows.slice(0, ROWS_FIRST))
    for (let i = ROWS_FIRST; i < data.rows.length; i += ROWS_NEXT) {
      chunks.push(data.rows.slice(i, i + ROWS_NEXT))
    }
  }
  const totalPages = chunks.length

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = doc.addPage([PAGE_W, PAGE_H])
    drawHeader(page, bold, reg, 'GOODS TRACE REPORT', data.policeServiceName, `Page ${pageIdx + 1} of ${totalPages}`)
    let y = PAGE_H - 84

    if (pageIdx === 0) {
      page.drawText(`Dealer: ${data.dealerName}`, { x: MARGIN, y, size: 10, font: bold, color: DARK })
      y -= 14
      page.drawText(`Address: ${data.dealerAddress}`, { x: MARGIN, y, size: 9, font: reg, color: DARK })
      y -= 22

      y = drawSectionBar(page, bold, 'REQUESTING OFFICER', y)
      y = drawKV(page, bold, reg, officerRows(data.officer), y)
      y -= 8

      y = drawSectionBar(page, bold, 'TRACE FILTERS', y)
      const range = data.from || data.to
        ? `${data.from ?? 'earliest'} to ${data.to ?? 'today'}`
        : 'All dates'
      y = drawKV(page, bold, reg, [
        ['Product / material', data.productName],
        ['Date range',         range],
        ['Minimum quantity',   data.minQuantity ? `${data.minQuantity} ${data.unit}` : 'Any'],
        ['Matches',            String(data.rows.length)],
      ], y)
      y -= 8

      y = drawSectionBar(page, bold, 'PURCHASES FOUND', y)
    }

    const rows = chunks[pageIdx] ?? []
    if (rows.length === 0 && pageIdx === 0) {
      page.drawText('No purchases of this product match the chosen filters.', { x: MARGIN + 6, y, size: 9, font: reg, color: GRAY })
      y -= 18
    } else if (rows.length > 0) {
      page.drawText('Date / Time', { x: MARGIN + 6,   y, size: 8, font: bold, color: GRAY })
      page.drawText('Ref No.',     { x: MARGIN + 95,  y, size: 8, font: bold, color: GRAY })
      page.drawText('Seller',      { x: MARGIN + 195, y, size: 8, font: bold, color: GRAY })
      page.drawText('ID Number',   { x: MARGIN + 320, y, size: 8, font: bold, color: GRAY })
      page.drawText('Qty',         { x: MARGIN + 400, y, size: 8, font: bold, color: GRAY })
      page.drawText(`Amount (${sym})`,  { x: PAGE_W - MARGIN - 70, y, size: 8, font: bold, color: GRAY })
      y -= 14
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!
        if (i % 2 === 1) {
          page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - MARGIN * 2, height: 15, color: LGRAY })
        }
        const when = r.createdAt.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' })
        page.drawText(when,        { x: MARGIN + 6,   y, size: 8, font: reg,  color: DARK })
        page.drawText(r.refNumber, { x: MARGIN + 95,  y, size: 8, font: bold, color: DARK })
        page.drawText(truncate(r.supplierName, 20) + (r.blacklisted ? ' *' : ''), {
          x: MARGIN + 195, y, size: 8, font: reg, color: r.blacklisted ? RED : DARK,
        })
        page.drawText(r.idNumber ?? '—', { x: MARGIN + 320, y, size: 8, font: reg, color: DARK })
        page.drawText(`${r.quantity}${data.unit}`, { x: MARGIN + 400, y, size: 8, font: reg, color: DARK })
        const amt = `${sym} ${new Decimal(r.lineTotal).toFixed(2)}`
        page.drawText(amt, { x: PAGE_W - MARGIN - 6 - reg.widthOfTextAtSize(amt, 8), y, size: 8, font: reg, color: DARK })
        y -= 15
      }
    }

    if (pageIdx === totalPages - 1 && data.rows.length > 0) {
      const totalQty = data.rows.reduce((acc, r) => acc.plus(new Decimal(r.quantity)), new Decimal(0))
      const totalAmt = data.rows.reduce((acc, r) => acc.plus(new Decimal(r.lineTotal)), new Decimal(0))
      y -= 6
      page.drawLine({ start: { x: MARGIN, y: y + 10 }, end: { x: PAGE_W - MARGIN, y: y + 10 }, thickness: 0.5, color: GRAY })
      page.drawText(`Total quantity: ${totalQty.toString()}${data.unit}`, { x: MARGIN + 6, y: y - 2, size: 9, font: bold, color: DARK })
      const amtLabel = `Total paid: ${sym} ${totalAmt.toFixed(2)}`
      page.drawText(amtLabel, {
        x: PAGE_W - MARGIN - bold.widthOfTextAtSize(amtLabel, 9), y: y - 2, size: 9, font: bold, color: RED,
      })
      y -= 16
      if (data.rows.some((r) => r.blacklisted)) {
        page.drawText('* Seller is blacklisted at this yard', { x: MARGIN + 6, y, size: 7.5, font: reg, color: RED })
      }
    }

    drawFooter(page, reg, data, 'Goods Trace Report')
  }

  return doc.save()
}
