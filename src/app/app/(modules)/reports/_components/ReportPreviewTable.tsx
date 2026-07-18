'use client'

/**
 * On-screen preview of a ReportDocument — renders the same flattened row
 * stream as the PDF: group bands (indented, shaded by depth), bordered data
 * rows, bold subtotal rows, grand-total band. Purpose-built rather than
 * DataTable (which has no grouped-band/colspan concept). Capped at 1,000
 * flat rows; downloads always render the full data server-side.
 */
import { useMemo } from 'react'
import type { ReportDocument } from '@/lib/reports/types'
import { flattenReportDocument } from '@/lib/reports/flatten'
import { formatCell } from '@/lib/reports/format'
import { colors, fontSize } from '@/lib/design-tokens'

const PREVIEW_ROW_CAP = 1000

// Modern/soft palette — no grid lines; rows are separated by a soft grey
// fill alternating with no fill, rather than borders.
const ZEBRA_FILL = '#F4F5F7'
const HEADER_BG = '#F8F9FA'
const GROUP_SHADES = ['#EEF0F2', '#F3F4F6', '#F8F9FA']
const SUBTOTAL_BG = '#EEF0F2'
const GRANDTOTAL_BG = '#E4E7EB'

interface ReportPreviewTableProps {
  doc: ReportDocument
}

export function ReportPreviewTable({ doc }: ReportPreviewTableProps) {
  const flat = useMemo(() => flattenReportDocument(doc), [doc])
  const capped = flat.length > PREVIEW_ROW_CAP
  const rows = capped ? flat.slice(0, PREVIEW_ROW_CAP) : flat
  const symbol = doc.meta.currencySymbol
  const colCount = doc.columns.length

  if (flat.length === 0) {
    return (
      <div
        className="rounded border bg-white px-4 py-8 text-center"
        style={{ borderColor: colors.border, fontSize: fontSize.sm, color: colors.textSecondary }}
      >
        No records for the selected parameters.
      </div>
    )
  }

  // Zebra fill alternates by data-row order only, so group/total bands
  // (which have their own fill) don't throw off the sequence.
  let dataRowCount = 0

  return (
    <div className="rounded-lg border bg-white overflow-auto" style={{ borderColor: colors.border }}>
      <table className="w-full" style={{ fontSize: fontSize.xs, borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            {doc.columns.map((col) => (
              <th
                key={col.key}
                className="sticky top-0 px-3 py-2 font-semibold"
                style={{
                  background: HEADER_BG,
                  borderBottom: `1px solid ${colors.border}`,
                  color: colors.textSecondary,
                  textAlign: col.align ?? 'left',
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  fontSize: fontSize.xs - 1,
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
                    className="px-3 py-1.5 font-semibold"
                    style={{
                      background: GROUP_SHADES[Math.min(row.level, GROUP_SHADES.length - 1)],
                      paddingLeft: 12 + row.level * 16,
                      color: colors.textPrimary,
                    }}
                  >
                    {row.label}
                    {row.meta && (
                      <span className="ml-3 font-normal" style={{ color: colors.textSecondary }}>
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
              rowStyle = { background: GRANDTOTAL_BG, borderTop: `2px solid ${colors.textSecondary}` }
            } else if (row.type === 'subtotal') {
              rowStyle = { background: SUBTOTAL_BG, borderTop: `1px solid ${colors.border}` }
            } else {
              rowStyle = { background: dataRowCount++ % 2 === 1 ? ZEBRA_FILL : 'transparent' }
            }

            return (
              <tr key={i} style={rowStyle}>
                {doc.columns.map((col, cIdx) => {
                  // Total rows: label spans the leading non-measure columns
                  if (isTotal && cIdx === 0) {
                    const span = firstMeasureIdx === -1 ? colCount : firstMeasureIdx
                    if (span > 0) {
                      return (
                        <td
                          key={col.key}
                          colSpan={span}
                          className="px-3 py-1.5 font-semibold"
                          style={{ textAlign: 'right', color: colors.textPrimary, whiteSpace: 'nowrap' }}
                        >
                          {row.label}
                        </td>
                      )
                    }
                  }
                  if (isTotal && firstMeasureIdx > 0 && cIdx < firstMeasureIdx) return null

                  if (col.isImage) {
                    return (
                      <td
                        key={col.key}
                        className="px-3 py-1.5"
                        style={{ textAlign: 'center', whiteSpace: 'nowrap' }}
                      >
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
                      className={`px-3 py-1.5 ${isTotal ? 'font-semibold' : ''}`}
                      style={{
                        textAlign: col.align ?? 'left',
                        color: colors.textPrimary,
                        fontFamily: col.format && col.format !== 'text' ? 'monospace' : undefined,
                        whiteSpace: 'nowrap',
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
        <div
          className="px-3 py-2 border-t text-center"
          style={{ borderColor: colors.border, fontSize: fontSize.xs, color: colors.textSecondary }}
        >
          Showing the first {PREVIEW_ROW_CAP.toLocaleString()} rows — download the PDF or Excel for the full report.
        </div>
      )}
    </div>
  )
}
