/**
 * Police Register PDF generator.
 *
 * Second-hand goods dealers are required to keep a register of every purchase
 * from the public, available for inspection by the police service configured
 * in Settings → Police Register (SAPS by default).
 *
 * Columns: #, Time, Supplier Name, ID Number, Address, Items, Total Paid
 *
 * Returns Uint8Array (PDF bytes). Server-side only.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import Decimal from 'decimal.js'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface RegisterEntry {
  rowNumber:       number
  createdAt:       Date
  refNumber:       string
  supplierName:    string
  idNumber:        string | null
  dateOfBirth?:    Date | null
  policeRegNo?:    string | null
  address:         string
  items:           string          // comma-joined product list
  totalAmount:     string          // Decimal string
  idPhotoBytes?:   Uint8Array | null
}

export interface PoliceRegisterData {
  date:      Date
  entries:   RegisterEntry[]
  dealerName: string       // business name
  dealerAddress: string
  policeServiceName: string
  generatedAt: Date
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_W = 841   // A4 landscape
const PAGE_H = 595
const MARGIN = 36
const COL_W  = PAGE_W - MARGIN * 2

const DARK_BLUE = rgb(0.05, 0.18, 0.40)
const GREEN     = rgb(0.11, 0.53, 0.22)
const DARK      = rgb(0.1, 0.1, 0.1)
const GRAY      = rgb(0.5, 0.5, 0.5)
const LGRAY     = rgb(0.94, 0.94, 0.94)
const WHITE     = rgb(1, 1, 1)
const RED       = rgb(0.75, 0.1, 0.1)

// Column widths as fractions of COL_W
const COLS = {
  num:     0.04,
  time:    0.06,
  ref:     0.09,
  name:    0.15,
  idno:    0.11,
  dob:     0.09,
  address: 0.14,
  items:   0.15,
  total:   0.09,
  photo:   0.08,   // ID photo thumbnail
}

function colX(key: keyof typeof COLS): number {
  const keys = Object.keys(COLS) as Array<keyof typeof COLS>
  let x = MARGIN
  for (const k of keys) {
    if (k === key) break
    x += COLS[k] * COL_W
  }
  return x
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generatePoliceRegister(data: PoliceRegisterData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)

  // We may need multiple pages
  const ROWS_PER_PAGE = 18
  const chunks: RegisterEntry[][] = []
  for (let i = 0; i < Math.max(1, data.entries.length); i += ROWS_PER_PAGE) {
    chunks.push(data.entries.slice(i, i + ROWS_PER_PAGE))
  }

  const totalPages = chunks.length

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page   = doc.addPage([PAGE_W, PAGE_H])
    const rows   = chunks[pageIdx] ?? []
    let y        = PAGE_H - MARGIN

    // ── Blue header bar ─────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: PAGE_H - 60, width: PAGE_W, height: 60, color: DARK_BLUE })

    page.drawText('SECOND-HAND GOODS DEALER — PURCHASE REGISTER', {
      x: MARGIN, y: PAGE_H - 26, size: 13, font: bold, color: WHITE,
    })
    page.drawText(`Available for inspection by the ${data.policeServiceName}`, {
      x: MARGIN, y: PAGE_H - 44, size: 8, font: reg, color: rgb(0.7, 0.8, 1),
    })

    const dateStr = data.date.toLocaleDateString('en-ZA', { dateStyle: 'full' })
    const dw = bold.widthOfTextAtSize(dateStr, 10)
    page.drawText(dateStr, {
      x: PAGE_W - MARGIN - dw, y: PAGE_H - 30, size: 10, font: bold, color: WHITE,
    })
    page.drawText(`Page ${pageIdx + 1} of ${totalPages}`, {
      x: PAGE_W - MARGIN - bold.widthOfTextAtSize(`Page ${pageIdx + 1} of ${totalPages}`, 8),
      y: PAGE_H - 46, size: 8, font: reg, color: rgb(0.7, 0.8, 1),
    })

    y = PAGE_H - 72

    // ── Dealer info (first page only) ────────────────────────────────────────
    if (pageIdx === 0) {
      page.drawText(`Dealer: ${data.dealerName}`, {
        x: MARGIN, y, size: 9, font: bold, color: DARK,
      })
      page.drawText(`Address: ${data.dealerAddress}`, {
        x: MARGIN + 200, y, size: 9, font: reg, color: DARK,
      })
      y -= 14
    }

    // ── Column headers ───────────────────────────────────────────────────────
    page.drawRectangle({ x: MARGIN, y: y - 4, width: COL_W, height: 16, color: GREEN })

    const headers: [keyof typeof COLS, string][] = [
      ['num',     '#'],
      ['time',    'Time'],
      ['ref',     'Ref No.'],
      ['name',    'Supplier Name'],
      ['idno',    'ID Number'],
      ['dob',     'Date of Birth'],
      ['address', 'Address'],
      ['items',   'Items Purchased'],
      ['total',   'Amount (R)'],
      ['photo',   'ID Photo'],
    ]

    for (const [key, label] of headers) {
      page.drawText(label, {
        x: colX(key) + 2, y: y - 1, size: 7, font: bold, color: WHITE,
      })
    }
    y -= 20

    // ── Data rows ────────────────────────────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i]!
      const bg = i % 2 === 0 ? WHITE : LGRAY
      const ROW_H = 16
      page.drawRectangle({ x: MARGIN, y: y - 3, width: COL_W, height: ROW_H, color: bg })

      const timeStr = entry.createdAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
      const dobStr = entry.dateOfBirth
        ? entry.dateOfBirth.toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—'
      const cells: [keyof typeof COLS, string][] = [
        ['num',     String(entry.rowNumber)],
        ['time',    timeStr],
        ['ref',     entry.refNumber],
        ['name',    truncate(entry.supplierName, 22)],
        ['idno',    entry.idNumber ?? ''],
        ['dob',     dobStr],
        ['address', truncate(entry.address, 20)],
        ['items',   truncate(entry.items, 22)],
        ['total',   `R ${new Decimal(entry.totalAmount).toFixed(2)}`],
      ]

      for (const [key, val] of cells) {
        page.drawText(val, {
          x: colX(key) + 2, y, size: 7, font: reg, color: DARK,
        })
      }

      // Embed ID photo thumbnail if available
      if (entry.idPhotoBytes && entry.idPhotoBytes.length > 0) {
        try {
          let embeddedImg
          try { embeddedImg = await doc.embedPng(entry.idPhotoBytes) }
          catch { embeddedImg = await doc.embedJpg(entry.idPhotoBytes) }
          const photoColX = colX('photo')
          const photoColW = COLS.photo * COL_W - 2
          const imgH = ROW_H - 2
          const imgW = Math.min(photoColW, embeddedImg.width * (imgH / embeddedImg.height))
          page.drawImage(embeddedImg, {
            x: photoColX + 2,
            y: y - 2,
            width: imgW,
            height: imgH,
          })
        } catch {
          // Photo embed failed — skip silently
        }
      } else {
        page.drawText('—', { x: colX('photo') + 2, y, size: 7, font: reg, color: GRAY })
      }

      y -= ROW_H
    }

    // Empty rows (SA regulation — fill to ROWS_PER_PAGE rows)
    const emptyRows = ROWS_PER_PAGE - rows.length
    const ROW_H = 16
    for (let e = 0; e < emptyRows; e++) {
      const i = rows.length + e
      const bg = i % 2 === 0 ? WHITE : LGRAY
      page.drawRectangle({ x: MARGIN, y: y - 3, width: COL_W, height: ROW_H, color: bg })
      y -= ROW_H
    }

    // ── Bottom rule ──────────────────────────────────────────────────────────
    page.drawLine({
      start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5, color: GRAY,
    })
    y -= 12

    // Summary on last page
    if (pageIdx === totalPages - 1) {
      const grandTotal = data.entries.reduce(
        (acc, e) => acc.plus(new Decimal(e.totalAmount)), new Decimal(0)
      )
      page.drawText(`Total transactions: ${data.entries.length}`, {
        x: MARGIN, y, size: 8, font: reg, color: GRAY,
      })
      page.drawText(`Grand Total Paid Out: R ${grandTotal.toFixed(2)}`, {
        x: PAGE_W - MARGIN - bold.widthOfTextAtSize(`Grand Total Paid Out: R ${grandTotal.toFixed(2)}`, 9),
        y, size: 9, font: bold, color: RED,
      })
      y -= 20

      // Signature block
      page.drawText('Dealer Signature: ____________________________', {
        x: MARGIN, y, size: 8, font: reg, color: DARK,
      })
      page.drawText(`Date: ${data.date.toLocaleDateString('en-ZA')}`, {
        x: MARGIN + 350, y, size: 8, font: reg, color: DARK,
      })
      y -= 14
      page.drawText('Police Officer Signature: ____________________________', {
        x: MARGIN, y, size: 8, font: reg, color: DARK,
      })
      page.drawText('Badge No: ________________', {
        x: MARGIN + 350, y, size: 8, font: reg, color: DARK,
      })
    }

    // Footer
    page.drawText(`Generated: ${data.generatedAt.toLocaleString('en-ZA')} · Renovo Pro · Golden Key Investments (Pty) Ltd`, {
      x: MARGIN, y: MARGIN, size: 6, font: reg, color: GRAY,
    })
  }

  return doc.save()
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max - 1) + '…' : s
}
