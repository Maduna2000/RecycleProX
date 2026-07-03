/**
 * Generic multi-level grouping engine for report builders.
 *
 * Takes flat items (e.g. purchase lines), a list of group levels (key
 * functions), a row level (how leaf items collapse into data rows), and
 * measure accumulators — produces the ReportGroup tree with Decimal-exact
 * subtotals at every level plus the grand total.
 */
import Decimal from 'decimal.js'
import type { ReportGroup, ReportRow } from '@/lib/reports/types'

export interface GroupLevelSpec<T> {
  /** Group band label for an item, e.g. "DEALER 1" or "NON-FERROUS". */
  label: (item: T) => string
  /** Secondary band text (e.g. "PAID · Cash · 13:48" on a ticket band); read from the group's first item. */
  meta?: (item: T) => string | undefined
  /** Labels forced to sort after everything else (e.g. UNCATEGORISED). */
  sortLast?: string[]
  /** Explicit label order; unlisted labels sort alphabetically after listed ones. */
  order?: string[]
  /** Collapse this level when its label duplicates the parent band (degenerate nesting). */
  collapseIfSameAsParent?: boolean
}

export interface RowLevelSpec<T> {
  /** Groups items into leaf rows (e.g. product id, or a unique line id for detail reports). */
  key: (item: T) => string
  /**
   * Builds the row's cells from its aggregated items and their measure totals.
   * Totals arrive as Decimals keyed by measure name.
   */
  build: (items: T[], totals: Record<string, Decimal>) => ReportRow['cells']
  /** Sort key for rows within their group (defaults to the row key). */
  sortBy?: (items: T[], cells: ReportRow['cells']) => string
}

export interface GroupRowsOptions<T> {
  groups: GroupLevelSpec<T>[]
  row: RowLevelSpec<T>
  /** Measure accumulators, keyed by column key; summed at every level. */
  measures: Record<string, (item: T) => Decimal>
  /** Format Decimal totals into subtotal cell strings (defaults to toFixed(2)). */
  formatTotals?: (totals: Record<string, Decimal>) => Record<string, string>
}

export interface GroupedReport {
  groups: ReportGroup[]
  grandTotal: Record<string, string>
  totals: Record<string, Decimal>
}

function sumMeasures<T>(
  items: T[],
  measures: Record<string, (item: T) => Decimal>
): Record<string, Decimal> {
  const totals: Record<string, Decimal> = {}
  for (const key of Object.keys(measures)) {
    totals[key] = items.reduce((acc, it) => acc.plus(measures[key]!(it)), new Decimal(0))
  }
  return totals
}

function defaultFormatTotals(totals: Record<string, Decimal>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(totals)) out[k] = v.toFixed(2)
  return out
}

function sortLabels<T>(labels: string[], spec: GroupLevelSpec<T>): string[] {
  const order = spec.order ?? []
  const last = new Set(spec.sortLast ?? [])
  return [...labels].sort((a, b) => {
    const aLast = last.has(a) ? 1 : 0
    const bLast = last.has(b) ? 1 : 0
    if (aLast !== bLast) return aLast - bLast
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    }
    return a.localeCompare(b)
  })
}

function buildLevel<T>(
  items: T[],
  levelIdx: number,
  parentLabel: string | undefined,
  effectiveLevel: number,
  opts: GroupRowsOptions<T>
): { groups?: ReportGroup[]; rows?: ReportRow[] } {
  const formatTotals = opts.formatTotals ?? defaultFormatTotals

  // Past the last group level → build leaf rows
  if (levelIdx >= opts.groups.length) {
    const byKey = new Map<string, T[]>()
    for (const item of items) {
      const k = opts.row.key(item)
      const arr = byKey.get(k)
      if (arr) arr.push(item)
      else byKey.set(k, [item])
    }
    const rows: { sortKey: string; row: ReportRow }[] = []
    for (const groupItems of Array.from(byKey.values())) {
      const totals = sumMeasures(groupItems, opts.measures)
      const cells = opts.row.build(groupItems, totals)
      const sortKey = opts.row.sortBy
        ? opts.row.sortBy(groupItems, cells)
        : opts.row.key(groupItems[0]!)
      rows.push({ sortKey, row: { cells } })
    }
    rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    return { rows: rows.map((r) => r.row) }
  }

  const spec = opts.groups[levelIdx]!
  const byLabel = new Map<string, T[]>()
  for (const item of items) {
    const label = spec.label(item)
    const arr = byLabel.get(label)
    if (arr) arr.push(item)
    else byLabel.set(label, [item])
  }

  const groups: ReportGroup[] = []
  const looseRows: ReportRow[] = []
  for (const label of sortLabels(Array.from(byLabel.keys()), spec)) {
    const groupItems = byLabel.get(label)!

    // Degenerate level (label repeats the parent band) → skip the band and its
    // duplicate subtotal; rows/groups float up to the parent band.
    if (spec.collapseIfSameAsParent && parentLabel !== undefined && label === parentLabel) {
      const inner = buildLevel(groupItems, levelIdx + 1, label, effectiveLevel, opts)
      if (inner.groups) groups.push(...inner.groups)
      if (inner.rows) looseRows.push(...inner.rows)
      continue
    }

    const inner = buildLevel(groupItems, levelIdx + 1, label, effectiveLevel + 1, opts)
    const meta = spec.meta ? spec.meta(groupItems[0]!) : undefined
    groups.push({
      level: effectiveLevel,
      label,
      ...(meta ? { meta } : {}),
      ...(inner.groups ? { groups: inner.groups } : {}),
      ...(inner.rows ? { rows: inner.rows } : {}),
      subtotal: formatTotals(sumMeasures(groupItems, opts.measures)),
    })
  }
  return {
    ...(groups.length > 0 ? { groups } : {}),
    ...(looseRows.length > 0 ? { rows: looseRows } : {}),
  }
}

export function groupRows<T>(items: T[], opts: GroupRowsOptions<T>): GroupedReport {
  const formatTotals = opts.formatTotals ?? defaultFormatTotals
  const built = buildLevel(items, 0, undefined, 0, opts)
  const totals = sumMeasures(items, opts.measures)
  return {
    groups: built.groups ?? [],
    grandTotal: formatTotals(totals),
    totals,
  }
}
