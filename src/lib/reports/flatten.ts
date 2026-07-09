/**
 * Flattens a ReportDocument's group tree into a linear render stream.
 * The PDF paginator, the Excel sheet writer, and the on-screen preview all
 * consume this — one traversal, three renderers.
 */
import type { FlatRow, ReportDocument, ReportGroup } from './types'

function walkGroup(group: ReportGroup, out: FlatRow[]): void {
  out.push({ type: 'groupHeader', level: group.level, label: group.label, meta: group.meta })

  if (group.groups) {
    for (const child of group.groups) walkGroup(child, out)
  }
  if (group.rows) {
    for (const row of group.rows) {
      out.push({
        type: 'data',
        level: group.level + 1,
        cells: row.cells,
        imageR2Key: row.imageR2Key,
        imageUrl: row.imageUrl,
      })
    }
  }
  if (group.subtotal) {
    out.push({
      type: 'subtotal',
      level: group.level,
      label: `${group.label}  TOTAL:`,
      cells: group.subtotal,
    })
  }
}

export function flattenReportDocument(doc: ReportDocument): FlatRow[] {
  const out: FlatRow[] = []
  for (const group of doc.groups) walkGroup(group, out)
  if (doc.grandTotal) {
    out.push({ type: 'grandTotal', level: 0, label: 'GRAND TOTAL:', cells: doc.grandTotal })
  }
  return out
}

/** Count of data rows in a group tree (for meta.rowCount). */
export function countDataRows(groups: ReportGroup[]): number {
  let n = 0
  for (const g of groups) {
    if (g.rows) n += g.rows.length
    if (g.groups) n += countDataRows(g.groups)
  }
  return n
}
