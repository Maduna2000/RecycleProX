'use client'

/**
 * On-screen preview of a ReportDocument — renders the same flattened row
 * stream as the PDF: group bands (indented, shaded by depth), bordered data
 * rows, bold subtotal rows, grand-total band. Purpose-built rather than
 * DataTable (which has no grouped-band/colspan concept). Capped at 1,000
 * flat rows; downloads always render the full data server-side.
 *
 * Deliberately ruled (bordered cells, gradient header) rather than the
 * borderless/shaded "soft" table style used elsewhere — this preview stands
 * in for the printed report, so it reads as the same document.
 */
import { useMemo } from 'react'
import type { ReportDocument } from '@/lib/reports/types'
import { flattenReportDocument } from '@/lib/reports/flatten'
import { formatCell } from '@/lib/reports/format'
import { colors, fontSize } from '@/lib/design-tokens'
import { PANEL, HEADER_GRAD, CARD_BORDER } from '@/components/rpx'

const PREVIEW_ROW_CAP = 1000

const GRID_LINE = '1px solid #E3E3E3'
const ZEBRA_FILL = '#FAFAFA'
const GROUP_SHADES = ['#E4E7EB', '#EDEFF1', '#F4F5F6']
const SUBTOTAL_BG = '#F0F0F0'
const GRANDTOTAL_BG = '#E0E0E0'

interface ReportPreviewTableProps {
  doc: ReportDocument
}

export function ReportPreviewTable({ doc }: ReportPreviewTableProps) {
  const flat = useMemo(() => flattenReportDocument(doc), [doc])
  const capped = flat.length > PREVIEW_ROW_CAP
  const rows = capped ? flat.slice(0, PREVIEW_ROW_CAP) : flat
  const symbol = doc.meta.currencySymbol
  const colCount = doc.columns.length

  // Each column's `width` is a fraction of content width (same numbers the
  // PDF export uses) — sizing the on-screen table to those same proportions,
  // scaled to fill 100%, is what keeps every report's columns snug against
  // each other instead of stretching to fit unwrapped content and forcing a
  // horizontal scroll. Falls back to an even split if a report definition
  // ever omits widths.
  const totalWidth = doc.columns.reduce((sum, c) => sum + (c.width || 0), 0) || colCount
  const colWidthPct = doc.columns.map((c) => `${((c.width || 1) / totalWidth) * 100}%`)

  if (flat.length === 0) {
    return (
      <div style={{ ...PANEL, padding: '32px 16px', textAlign: 'center', fontSize: fontSize.sm, color: colors.textSecondary }}>
        No records for the selected parameters.
      </div>
    )
  }

  // Zebra fill alternates by data-row order only, so group/total bands
  // (which have their own fill) don't throw off the sequence.
  let dataRowCount = 0

  return (
    <div style={{ ...PANEL, overflow: 'auto' }}>
      <table style={{ width: '100%', tableLayout: 'fixed', fontSize: fontSize.xs, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {doc.columns.map((col, i) => (
              <th
                key={col.key}
                style={{
                  position: 'sticky', top: 0, padding: '0 6px', height: 30,
                  width: colWidthPct[i],
                  background: HEADER_GRAD,
                  borderBottom: CARD_BORDER,
                  borderRight: i < colCount - 1 ? GRID_LINE : undefined,
                  color: colors.textSecondary,
                  textAlign: col.align ?? 'left',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 700,
                  fontSize: 10,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            if (row.type === 'groupHeader') {
              return (
                <tr key={i}>
                  <td
                    colSpan={colCount}
                    style={{
                      padding: '4px 6px',
                      fontWeight: 700,
                      background: GROUP_SHADES[Math.min(row.level, GROUP_SHADES.length - 1)],
                      borderBottom: GRID_LINE,
                      paddingLeft: 10 + row.level * 16,
                      color: colors.textPrimary,
                    }}
                  >
                    {row.label}
                    {row.meta && (
                      <span style={{ marginLeft: 12, fontWeight: 400, color: colors.textSecondary }}>
                        {row.meta}
                      </span>
                    )}
                  </td>
                </tr>
              )
            }

            const isTotal = row.type === 'subtotal' || row.type === 'grandTotal'
            const cells = row.cells ?? {}
            const firstMeasureIdx = doc.columns.findIndex((c) =>
              Object.prototype.hasOwnProperty.call(cells, c.key)
            )

            let rowStyle: React.CSSProperties
            if (row.type === 'grandTotal') {
              rowStyle = { background: GRANDTOTAL_BG, borderTop: `2px solid ${colors.textPrimary}` }
            } else if (row.type === 'subtotal') {
              rowStyle = { background: SUBTOTAL_BG, borderTop: '1px solid #B0B0B0' }
            } else {
              rowStyle = { background: dataRowCount++ % 2 === 1 ? ZEBRA_FILL : 'transparent' }
            }

            return (
              <tr key={i} style={rowStyle}>
                {doc.columns.map((col, cIdx) => {
                  const cellBorder: React.CSSProperties = {
                    borderBottom: GRID_LINE,
                    borderRight: cIdx < colCount - 1 ? GRID_LINE : undefined,
                  }

                  // Total rows: label spans the leading non-measure columns
                  if (isTotal && cIdx === 0) {
                    const span = firstMeasureIdx === -1 ? colCount : firstMeasureIdx
                    if (span > 0) {
                      return (
                        <td
                          key={col.key}
                          colSpan={span}
                          style={{ padding: '4px 6px', fontWeight: 700, textAlign: 'right', color: colors.textPrimary, whiteSpace: 'nowrap', ...cellBorder }}
                        >
                          {row.label}
                        </td>
                      )
                    }
                  }
                  if (isTotal && firstMeasureIdx > 0 && cIdx < firstMeasureIdx) return null

                  if (col.isImage) {
                    return (
                      <td key={col.key} style={{ padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap', ...cellBorder }}>
                        {row.imageUrl ? (
                          <a href={row.imageUrl} target="_blank" rel="noopener noreferrer" style={{ color: colors.process }}>
                            View
                          </a>
                        ) : (
                          <span style={{ color: colors.textSecondary }}>No image</span>
                        )}
                      </td>
                    )
                  }

                  const has = Object.prototype.hasOwnProperty.call(cells, col.key)
                  return (
                    <td
                      key={col.key}
                      style={{
                        padding: '4px 6px',
                        fontWeight: isTotal ? 700 : 400,
                        textAlign: col.align ?? 'left',
                        color: colors.textPrimary,
                        fontFamily: col.format && col.format !== 'text' ? 'monospace' : undefined,
                        // Text columns wrap within their assigned share of
                        // the table's width instead of forcing the column
                        // wider to fit unwrapped content (which is what was
                        // pushing reports into horizontal scroll) — short,
                        // fixed-shape values (dates, money, mass) stay on
                        // one line since they never need the room.
                        whiteSpace: !col.format || col.format === 'text' ? 'normal' : 'nowrap',
                        wordBreak: 'break-word',
                        ...cellBorder,
                      }}
                    >
                      {has ? formatCell(cells[col.key], col.format, symbol) : ''}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      {capped && (
        <div style={{ padding: '8px 10px', borderTop: CARD_BORDER, textAlign: 'center', fontSize: fontSize.xs, color: colors.textSecondary }}>
          Showing the first {PREVIEW_ROW_CAP.toLocaleString()} rows — download the PDF or Excel for the full report.
        </div>
      )}
    </div>
  )
}
