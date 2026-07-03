/**
 * Stock report builders.
 *
 * Stock on hand is computed from the StockMovement ledger (no stored level
 * column): Σ in − Σ out, cut off at the end of the report's "to" day — so
 * the report answers "what was on hand as at that date", not just "now".
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { groupRows } from '@/lib/services/reports/grouping'
import { countDataRows } from '@/lib/reports/flatten'
import type { ReportDocument, ReportGroup, ReportMeta, ReportRow } from '@/lib/reports/types'
import type { StockOnHandParams, StockMovementParams } from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

const D = (v: unknown) => new Decimal(String(v ?? 0))

async function sumMovements(
  where: { direction: 'in' | 'out'; createdAt?: { gte?: Date; lte?: Date }; productId?: string }
): Promise<Map<string, Decimal>> {
  const agg = await prisma.stockMovement.groupBy({
    by: ['productId'],
    where,
    _sum: { quantity: true },
  })
  return new Map(agg.map((r) => [r.productId, D(r._sum.quantity)]))
}

// ─── Stock On Hand ────────────────────────────────────────────────────────────

export async function buildStockOnHand(
  params: StockOnHandParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { end } = getRangeBoundsSAST(params.from, params.to)
  const valuation = params.valuation ?? 'buy'

  const [inMap, outMap, products] = await Promise.all([
    sumMovements({ direction: 'in', createdAt: { lte: end } }),
    sumMovements({ direction: 'out', createdAt: { lte: end } }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        category: true,
        defaultBuyPrice: true,
        defaultSellPrice: true,
        categoryRef: { select: { name: true, parent: { select: { name: true } } } },
      },
    }),
  ])

  const items = products
    .map((p) => {
      const onHand = (inMap.get(p.id) ?? new Decimal(0)).minus(outMap.get(p.id) ?? new Decimal(0))
      const unitValue = D(valuation === 'buy' ? p.defaultBuyPrice : p.defaultSellPrice)
      return { product: p, onHand, unitValue, totalValue: onHand.times(unitValue).toDecimalPlaces(2) }
    })
    .filter((i) => !i.onHand.isZero())

  type Item = (typeof items)[number]
  const topCategoryOf = (i: Item) =>
    (i.product.categoryRef?.parent?.name ?? i.product.categoryRef?.name ?? i.product.category).toUpperCase()
  const subCategoryOf = (i: Item) =>
    (i.product.categoryRef?.parent ? i.product.categoryRef.name : topCategoryOf(i)).toUpperCase()

  const { groups, grandTotal } = groupRows(items, {
    groups: [
      { label: topCategoryOf },
      { label: subCategoryOf, collapseIfSameAsParent: true },
    ],
    row: {
      key: (i) => i.product.code,
      build: (rows) => {
        const i = rows[0]!
        return {
          code: i.product.code,
          name: i.product.name,
          unit: i.product.unit,
          onHand: i.onHand.toFixed(3),
          unitValue: i.unitValue.toFixed(2),
          totalValue: i.totalValue.toFixed(2),
        }
      },
      sortBy: (rows) => rows[0]!.product.name,
    },
    measures: {
      onHand: (i) => i.onHand,
      totalValue: (i) => i.totalValue,
    },
    formatTotals: (t) => ({
      onHand: t.onHand!.toFixed(3),
      totalValue: t.totalValue!.toFixed(2),
    }),
  })

  return {
    reportId: 'stock-on-hand',
    title: 'Stock On Hand Report',
    subtitle: `As at end of ${params.to}  ·  valued at default ${valuation} price`,
    params: { from: params.from, to: params.to, filters: { valuation } },
    columns: [
      { key: 'code', label: 'Code', width: 0.12, format: 'text', excelWidth: 12 },
      { key: 'name', label: 'Product', width: 0.34, format: 'text', excelWidth: 30 },
      { key: 'unit', label: 'Unit', width: 0.08, format: 'text', excelWidth: 8 },
      { key: 'onHand', label: 'On Hand', width: 0.14, align: 'right', format: 'mass', excelWidth: 13 },
      { key: 'unitValue', label: 'Unit Value', width: 0.14, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'totalValue', label: 'Total Value', width: 0.18, align: 'right', format: 'money', excelWidth: 15 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}

// ─── Stock Movement ───────────────────────────────────────────────────────────

export async function buildStockMovement(
  params: StockMovementParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)
  const mode = params.mode ?? 'summary'

  if (mode === 'detail') {
    const movements = await prisma.stockMovement.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ...(params.productId ? { productId: params.productId } : {}),
      },
      select: {
        id: true,
        direction: true,
        quantity: true,
        source: true,
        notes: true,
        createdAt: true,
        product: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const { groups, grandTotal } = groupRows(movements, {
      groups: [{ label: (m) => `${m.product.code}  ${m.product.name}` }],
      row: {
        key: (m) => m.id,
        build: (items) => {
          const m = items[0]!
          return {
            date: m.createdAt.toISOString(),
            direction: m.direction.toUpperCase(),
            source: m.source.replace(/_/g, ' ').toUpperCase(),
            notes: m.notes ?? null,
            qtyIn: m.direction === 'in' ? D(m.quantity).toFixed(3) : null,
            qtyOut: m.direction === 'out' ? D(m.quantity).toFixed(3) : null,
          }
        },
        sortBy: (items) => items[0]!.createdAt.toISOString(),
      },
      measures: {
        qtyIn: (m) => (m.direction === 'in' ? D(m.quantity) : new Decimal(0)),
        qtyOut: (m) => (m.direction === 'out' ? D(m.quantity) : new Decimal(0)),
      },
      formatTotals: (t) => ({ qtyIn: t.qtyIn!.toFixed(3), qtyOut: t.qtyOut!.toFixed(3) }),
    })

    return {
      reportId: 'stock-movement',
      title: 'Stock Movement Report (Detail)',
      params: {
        from: params.from,
        to: params.to,
        filters: { mode, ...(params.productId ? { productId: params.productId } : {}) },
      },
      columns: [
        { key: 'date', label: 'Date', width: 0.16, format: 'datetime', excelWidth: 16 },
        { key: 'direction', label: 'Dir', width: 0.07, format: 'text', excelWidth: 6 },
        { key: 'source', label: 'Source', width: 0.17, format: 'text', excelWidth: 16 },
        { key: 'notes', label: 'Notes', width: 0.32, format: 'text', excelWidth: 32 },
        { key: 'qtyIn', label: 'Qty In', width: 0.14, align: 'right', format: 'mass', excelWidth: 12 },
        { key: 'qtyOut', label: 'Qty Out', width: 0.14, align: 'right', format: 'mass', excelWidth: 12 },
      ],
      groups,
      grandTotal,
      meta: { ...meta, rowCount: countDataRows(groups) },
    }
  }

  // Summary mode: opening (before range) + in/out (in range) → closing
  const [openInMap, openOutMap, inMap, outMap, products] = await Promise.all([
    sumMovements({ direction: 'in', createdAt: { lte: new Date(start.getTime() - 1) } }),
    sumMovements({ direction: 'out', createdAt: { lte: new Date(start.getTime() - 1) } }),
    sumMovements({ direction: 'in', createdAt: { gte: start, lte: end } }),
    sumMovements({ direction: 'out', createdAt: { gte: start, lte: end } }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        categoryRef: { select: { name: true, parent: { select: { name: true } } } },
      },
    }),
  ])

  const items = products
    .map((p) => {
      const opening = (openInMap.get(p.id) ?? new Decimal(0)).minus(openOutMap.get(p.id) ?? new Decimal(0))
      const qtyIn = inMap.get(p.id) ?? new Decimal(0)
      const qtyOut = outMap.get(p.id) ?? new Decimal(0)
      return { product: p, opening, qtyIn, qtyOut, closing: opening.plus(qtyIn).minus(qtyOut) }
    })
    .filter((i) => !(i.opening.isZero() && i.qtyIn.isZero() && i.qtyOut.isZero()))

  type Item = (typeof items)[number]
  const topCategoryOf = (i: Item) =>
    (i.product.categoryRef?.parent?.name ?? i.product.categoryRef?.name ?? i.product.category).toUpperCase()

  const rowsByCategory = new Map<string, ReportRow[]>()
  for (const i of items.sort((a, b) => a.product.name.localeCompare(b.product.name))) {
    const cat = topCategoryOf(i)
    if (!rowsByCategory.has(cat)) rowsByCategory.set(cat, [])
    rowsByCategory.get(cat)!.push({
      cells: {
        code: i.product.code,
        name: i.product.name,
        opening: i.opening.toFixed(3),
        qtyIn: i.qtyIn.toFixed(3),
        qtyOut: i.qtyOut.toFixed(3),
        closing: i.closing.toFixed(3),
      },
    })
  }

  const groups: ReportGroup[] = Array.from(rowsByCategory.keys())
    .sort()
    .map((cat) => {
      const rows = rowsByCategory.get(cat)!
      const sum = (key: 'opening' | 'qtyIn' | 'qtyOut' | 'closing') =>
        rows.reduce((a, r) => a.plus(r.cells[key]!), new Decimal(0)).toFixed(3)
      return {
        level: 0,
        label: cat,
        rows,
        subtotal: { opening: sum('opening'), qtyIn: sum('qtyIn'), qtyOut: sum('qtyOut'), closing: sum('closing') },
      }
    })

  const total = (key: 'opening' | 'qtyIn' | 'qtyOut' | 'closing') =>
    items
      .reduce(
        (a, i) => a.plus(key === 'opening' ? i.opening : key === 'qtyIn' ? i.qtyIn : key === 'qtyOut' ? i.qtyOut : i.closing),
        new Decimal(0)
      )
      .toFixed(3)

  return {
    reportId: 'stock-movement',
    title: 'Stock Movement Report',
    params: { from: params.from, to: params.to, filters: { mode } },
    columns: [
      { key: 'code', label: 'Code', width: 0.12, format: 'text', excelWidth: 12 },
      { key: 'name', label: 'Product', width: 0.32, format: 'text', excelWidth: 30 },
      { key: 'opening', label: 'Opening', width: 0.14, align: 'right', format: 'mass', excelWidth: 13 },
      { key: 'qtyIn', label: 'In', width: 0.14, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'qtyOut', label: 'Out', width: 0.14, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'closing', label: 'Closing', width: 0.14, align: 'right', format: 'mass', excelWidth: 13 },
    ],
    groups,
    grandTotal: {
      opening: total('opening'),
      qtyIn: total('qtyIn'),
      qtyOut: total('qtyOut'),
      closing: total('closing'),
    },
    meta: { ...meta, rowCount: items.length },
  }
}
