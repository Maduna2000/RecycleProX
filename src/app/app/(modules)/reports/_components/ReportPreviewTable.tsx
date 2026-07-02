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

const GROUP_SHADES = ['#CCCCCC', '#E0E0E0', '#EFEFEF']

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

  return (
    <div className="rounded border bg-white overflow-auto" style={{ borderColor: colors.border }}>
      <table className="w-full border-collapse" style={{ fontSize: fontSize.xs }}>
        <thead>
          <tr>
            {doc.columns.map((col) => (
              <th
                key={col.key}
                className="sticky top-0 px-2 py-1.5 border"
                style={{
                  background: 'linear-gradient(#F8F8F8, #E8E8E8)',
                  borderColor: '#BBB',
                  color: colors.textPrimary,
                  textAlign: col.align ?? 'left',
                  whiteSpace: 'nowrap',
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
                    className="px-2 py-1 border font-semibold"
                    style={{
                      background: GROUP_SHADES[Math.min(row.level, GROUP_SHADES.length - 1)],
                      borderColor: '#BBB',
                      paddingLeft: 8 + row.level * 16,
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

            return (
              <tr
                key={i}
                style={
                  row.type === 'grandTotal'
                    ? { background: '#D8D8D8', borderTop: '2px solid #555' }
                    : row.type === 'subtotal'
                      ? { background: '#F3F3F3', borderTop: '1.5px solid #888' }
                      : undefined
                }
              >
                {doc.columns.map((col, cIdx) => {
                  // Total rows: label spans the leading non-measure columns
                  if (isTotal && cIdx === 0) {
                    const span = firstMeasureIdx === -1 ? colCount : firstMeasureIdx
                    if (span > 0) {
                      return (
                        <td
                          key={col.key}
                          colSpan={span}
                          className="px-2 py-1 border font-semibold"
                          style={{ borderColor: '#CCC', textAlign: 'right', color: colors.textPrimary, whiteSpace: 'nowrap' }}
                        >
                          {row.label}
                        </td>
                      )
                    }
                  }
                  if (isTotal && firstMeasureIdx > 0 && cIdx < firstMeasureIdx) return null

                  const has = Object.prototype.hasOwnProperty.call(cells, col.key)
                  return (
                    <td
                      key={col.key}
                      className={`px-2 py-1 border ${isTotal ? 'font-semibold' : ''}`}
                      style={{
                        borderColor: '#DDD',
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
