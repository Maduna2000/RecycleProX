/**
 * Police Inspection Certificate PDF.
 *
 * Generated when an officer ends an inspection session at the officer portal.
 * Records who inspected, when, what was searched, and carries the officer's
 * digital signature — proof for both the dealer and the police service that
 * the register was produced on request.
 *
 * Returns Uint8Array (PDF bytes). Server-side only.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface CertificateSearchRow {
  createdAt:   Date
  searchType:  string
  queryText:   string
  resultCount: number
}

export interface InspectionCertificateData {
  visitId:           string
  officerName:       string
  rank:              string | null
  badgeNumber:       string | null
  stationName:       string | null
  contactNumber:     string | null
  visitReason:       string | null
  visitNote:         string | null
  startedAt:         Date | null
  signedAt:          Date | null
  status:            string
  searches:          CertificateSearchRow[]
  signatureBytes:    Uint8Array | null
  dealerName:        string
  dealerAddress:     string
  policeServiceName: string
  legalNote:         string
  generatedAt:       Date
}

const PAGE_W = 595   // A4 portrait
const PAGE_H = 841
const MARGIN = 48

const DARK_BLUE = rgb(0.05, 0.18, 0.40)
const GREEN     = rgb(0.11, 0.53, 0.22)
const DARK      = rgb(0.1, 0.1, 0.1)
const GRAY      = rgb(0.5, 0.5, 0.5)
const LGRAY     = rgb(0.94, 0.94, 0.94)
const WHITE     = rgb(1, 1, 1)

const SEARCH_TYPE_LABELS: Record<string, string> = {
  register_by_date: 'Register by date',
  person:           'Person search',
  goods:            'Goods search',
}

const REASON_LABELS: Record<string, string> = {
  routine_inspection:         'Routine inspection',
  stolen_goods_investigation: 'Stolen goods investigation',
  person_enquiry:             'Person enquiry',
  other:                      'Other',
}

export async function generateInspectionCertificate(data: InspectionCertificateData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg  = await doc.embedFont(StandardFonts.Helvetica)

  const SEARCHES_FIRST_PAGE = 20
  const SEARCHES_PER_PAGE   = 32
  const chunks: CertificateSearchRow[][] = []
  if (data.searches.length <= SEARCHES_FIRST_PAGE) {
    chunks.push(data.searches)
  } else {
    chunks.push(data.searches.slice(0, SEARCHES_FIRST_PAGE))
    for (let i = SEARCHES_FIRST_PAGE; i < data.searches.length; i += SEARCHES_PER_PAGE) {
      chunks.push(data.searches.slice(i, i + SEARCHES_PER_PAGE))
    }
  }
  const totalPages = chunks.length

  const fmt = (d: Date | null) =>
    d ? d.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = doc.addPage([PAGE_W, PAGE_H])
    let y = PAGE_H

    // ── Header bar ──
    page.drawRectangle({ x: 0, y: PAGE_H - 64, width: PAGE_W, height: 64, color: DARK_BLUE })
    page.drawText('POLICE INSPECTION CERTIFICATE', {
      x: MARGIN, y: PAGE_H - 30, size: 14, font: bold, color: WHITE,
    })
    page.drawText(data.policeServiceName, {
      x: MARGIN, y: PAGE_H - 48, size: 9, font: reg, color: rgb(0.7, 0.8, 1),
    })
    const pageLabel = `Page ${pageIdx + 1} of ${totalPages}`
    page.drawText(pageLabel, {
      x: PAGE_W - MARGIN - reg.widthOfTextAtSize(pageLabel, 8),
      y: PAGE_H - 48, size: 8, font: reg, color: rgb(0.7, 0.8, 1),
    })
    y = PAGE_H - 84

    if (pageIdx === 0) {
      // ── Dealer block ──
      page.drawText(`Dealer: ${data.dealerName}`, { x: MARGIN, y, size: 10, font: bold, color: DARK })
      y -= 14
      page.drawText(`Address: ${data.dealerAddress}`, { x: MARGIN, y, size: 9, font: reg, color: DARK })
      y -= 24

      // ── Officer block ──
      page.drawRectangle({ x: MARGIN, y: y - 6, width: PAGE_W - MARGIN * 2, height: 18, color: GREEN })
      page.drawText('OFFICER DETAILS', { x: MARGIN + 6, y: y - 1, size: 9, font: bold, color: WHITE })
      y -= 26

      const officerRows: [string, string][] = [
        ['Officer name',    data.officerName],
        ['Rank',            data.rank ?? '—'],
        ['Service number',  data.badgeNumber ?? '—'],
        ['Police station',  data.stationName ?? '—'],
        ['Contact number',  data.contactNumber ?? '—'],
        ['Reason for visit', data.visitReason ? REASON_LABELS[data.visitReason] ?? data.visitReason : '—'],
        ...(data.visitNote ? [['Note', data.visitNote] as [string, string]] : []),
        ['Inspection started', fmt(data.startedAt)],
        ['Signed off',         data.status === 'expired' ? 'NOT SIGNED (session expired)' : fmt(data.signedAt)],
      ]
      for (const [label, value] of officerRows) {
        page.drawText(label, { x: MARGIN + 6,   y, size: 9, font: bold, color: GRAY })
        page.drawText(value, { x: MARGIN + 150, y, size: 9, font: reg,  color: DARK })
        y -= 15
      }
      y -= 10

      // ── Searches header ──
      page.drawRectangle({ x: MARGIN, y: y - 6, width: PAGE_W - MARGIN * 2, height: 18, color: GREEN })
      page.drawText(`SEARCHES PERFORMED (${data.searches.length})`, {
        x: MARGIN + 6, y: y - 1, size: 9, font: bold, color: WHITE,
      })
      y -= 26
    }

    // ── Searches table ──
    const rows = chunks[pageIdx] ?? []
    if (rows.length === 0 && pageIdx === 0) {
      page.drawText('No searches were performed during this inspection.', {
        x: MARGIN + 6, y, size: 9, font: reg, color: GRAY,
      })
      y -= 18
    }
    for (let i = 0; i < rows.length; i++) {
      const s = rows[i]!
      if (i % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - MARGIN * 2, height: 15, color: LGRAY })
      }
      const time = s.createdAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
      page.drawText(time, { x: MARGIN + 6, y, size: 8, font: reg, color: DARK })
      page.drawText(SEARCH_TYPE_LABELS[s.searchType] ?? s.searchType, {
        x: MARGIN + 50, y, size: 8, font: bold, color: DARK,
      })
      const query = s.queryText.length > 58 ? s.queryText.substring(0, 57) + '…' : s.queryText
      page.drawText(query, { x: MARGIN + 150, y, size: 8, font: reg, color: DARK })
      const countLabel = `${s.resultCount} result${s.resultCount === 1 ? '' : 's'}`
      page.drawText(countLabel, {
        x: PAGE_W - MARGIN - reg.widthOfTextAtSize(countLabel, 8) - 6,
        y, size: 8, font: reg, color: GRAY,
      })
      y -= 15
    }

    // ── Signature + legal note on last page ──
    if (pageIdx === totalPages - 1) {
      y -= 20
      page.drawText('Officer signature:', { x: MARGIN, y, size: 9, font: bold, color: DARK })
      y -= 8

      if (data.signatureBytes && data.signatureBytes.length > 0) {
        try {
          let img
          try { img = await doc.embedPng(data.signatureBytes) }
          catch { img = await doc.embedJpg(data.signatureBytes) }
          const sigW = 180
          const sigH = Math.min(75, img.height * (sigW / img.width))
          page.drawImage(img, { x: MARGIN, y: y - sigH, width: sigW, height: sigH })
          page.drawLine({
            start: { x: MARGIN, y: y - sigH - 4 }, end: { x: MARGIN + sigW, y: y - sigH - 4 },
            thickness: 0.5, color: GRAY,
          })
          y -= sigH + 18
        } catch {
          page.drawText('(signature image could not be embedded)', { x: MARGIN, y: y - 12, size: 8, font: reg, color: GRAY })
          y -= 30
        }
      } else {
        page.drawLine({
          start: { x: MARGIN, y: y - 24 }, end: { x: MARGIN + 180, y: y - 24 },
          thickness: 0.5, color: GRAY,
        })
        page.drawText(data.status === 'expired' ? 'Session expired before sign-off' : 'Not signed', {
          x: MARGIN, y: y - 36, size: 8, font: reg, color: GRAY,
        })
        y -= 50
      }

      // Legal note box
      const noteLines = wrapText(data.legalNote, reg, 8, PAGE_W - MARGIN * 2 - 16)
      const boxH = noteLines.length * 11 + 14
      page.drawRectangle({
        x: MARGIN, y: y - boxH, width: PAGE_W - MARGIN * 2, height: boxH,
        color: rgb(0.96, 0.97, 1), borderColor: DARK_BLUE, borderWidth: 0.5,
      })
      let ny = y - 14
      for (const line of noteLines) {
        page.drawText(line, { x: MARGIN + 8, y: ny, size: 8, font: reg, color: DARK_BLUE })
        ny -= 11
      }
    }

    // Footer
    page.drawText(
      `Certificate ${data.visitId} · Generated: ${data.generatedAt.toLocaleString('en-ZA')} · Renovo Pro · Golden Key Investments (Pty) Ltd`,
      { x: MARGIN, y: 30, size: 6, font: reg, color: GRAY }
    )
  }

  return doc.save()
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}
