/**
 * Stock Variance report builder — every point where the physical stock was
 * found to differ from what the system showed, to help trace missing stock.
 *
 * Two sources, never overlapping:
 *  - Completed stocktake entries (structured systemQty / countedQty / variance).
 *    The movements a stocktake completion writes (source 'stocktake_adjustment')
 *    are deliberately NOT read, so the same variance is never counted twice.
 *  - Manual stock adjustments (source 'manual_adjustment'). A "physical count"
 *    adjustment records system/counted only inside its notes text, so those
 *    are parsed back out; a plain in/out adjustment has no system figure, so
 *    only its signed quantity is shown. Product-to-product transfers share
 *    the same source and are skipped — they move stock, they don't lose it.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { groupRows } from '@/lib/services/reports/grouping'
import { countDataRows } from '@/lib/reports/flatten'
import type { ReportDocument, ReportMeta, ReportRow, ReportSummaryLine } from '@/lib/reports/types'
import type { StockVarianceParams } from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

const D = (v: unknown) => new Decimal(String(v ?? 0))

const KIND_LABELS = {
  stocktake: 'Stocktake',
  manual_count: 'Manual Count',
  manual_adjustment: 'Manual Adjustment',
} as const
type Kind = keyof typeof KIND_LABELS

const COUNT_NOTE = /^Physical count: system (-?\d+(?:\.\d+)?), counted (-?\d+(?:\.\d+)?), diff [+-]\d+(?:\.\d+)?\.?\s*/
const TRANSFER_NOTE = /^Transfer (?:to|from) /

interface VarianceEvent {
  at: Date
  kind: Kind
  ref: string
  productId: string
  systemQty: Decimal | null
  countedQty: Decimal | null
  variance: Decimal
  byUserId: string | null
  notes: string
}

export async function buildStockVariance(
  params: StockVarianceParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)
  const kindFilter = params.kind ?? 'all'

  const events: VarianceEvent[] = []

  if (kindFilter === 'all' || kindFilter === 'stocktake') {
    const stocktakes = await prisma.stocktake.findMany({
      where: { status: 'completed', completedAt: { gte: start, lte: end } },
      select: {
        refNumber: true,
        completedAt: true,
        createdByUserId: true,
        entries: {
          where: params.productId ? { productId: params.productId } : {},
          select: { productId: true, systemQty: true, countedQty: true, variance: true },
        },
      },
    })
    for (const st of stocktakes) {
      for (const e of st.entries) {
        events.push({
          at: st.completedAt as Date,
          kind: 'stocktake',
          ref: st.refNumber,
          productId: e.productId,
          systemQty: D(e.systemQty),
          countedQty: D(e.countedQty),
          variance: D(e.variance),
          byUserId: st.createdByUserId,
          notes: '',
        })
      }
    }
  }

  if (kindFilter !== 'stocktake') {
    const movements = await prisma.stockMovement.findMany({
      where: {
        source: 'manual_adjustment',
        createdAt: { gte: start, lte: end },
        ...(params.productId ? { productId: params.productId } : {}),
      },
      select: { id: true, productId: true, direction: true, quantity: true, notes: true, createdAt: true, createdByUserId: true },
    })
    for (const m of movements) {
      const notes = m.notes ?? ''
      if (TRANSFER_NOTE.test(notes)) continue
      const qty = D(m.quantity)
      const signed = m.direction === 'in' ? qty : qty.negated()
      const counted = COUNT_NOTE.exec(notes)
      const kind: Kind = counted ? 'manual_count' : 'manual_adjustment'
      if (kindFilter !== 'all' && kindFilter !== kind) continue
      events.push({
        at: m.createdAt,
        kind,
        ref: '',
        productId: m.productId,
        systemQty: counted ? D(counted[1]) : null,
        countedQty: counted ? D(counted[2]) : null,
        variance: signed,
        byUserId: m.createdByUserId,
        notes: counted ? notes.replace(COUNT_NOTE, '').trim() : notes,
      })
    }
  }

  const productIds = Array.from(new Set(events.map((e) => e.productId)))
  const userIds = Array.from(new Set(events.map((e) => e.byUserId).filter((u): u is string => !!u)))
  const [products, users] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true, code: true, name: true, category: true, defaultBuyPrice: true,
        categoryRef: { select: { name: true, parent: { select: { name: true } } } },
      },
    }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, username: true } }),
  ])
  const productById = new Map(products.map((p) => [p.id, p]))
  const userById = new Map(users.map((u) => [u.id, u]))

  const categoryFilter = params.category?.toLowerCase()
  const userFilter = params.user?.toLowerCase()
  const minVariance = params.minVariance ? D(params.minVariance) : null

  const kept = events.filter((e) => {
    const p = productById.get(e.productId)
    if (!p) return false
    if (params.direction === 'shortage' && !e.variance.isNegative()) return false
    if (params.direction === 'surplus' && !e.variance.isPositive()) return false
    if (e.variance.isZero() && !params.includeZero) return false
    if (minVariance && e.variance.abs().lt(minVariance)) return false
    if (categoryFilter) {
      const names = [p.category, p.categoryRef?.name, p.categoryRef?.parent?.name]
      if (!names.some((n) => n?.toLowerCase().includes(categoryFilter))) return false
    }
    if (userFilter) {
      const u = e.byUserId ? userById.get(e.byUserId) : undefined
      if (!u || !`${u.fullName} ${u.username}`.toLowerCase().includes(userFilter)) return false
    }
    return true
  })

  kept.sort((a, b) => a.at.getTime() - b.at.getTime())

  let shortageQty = new Decimal(0)
  let surplusQty = new Decimal(0)
  let shortageValue = new Decimal(0)
  let surplusValue = new Decimal(0)

  const items = kept.map((e, idx) => {
    const p = productById.get(e.productId)!
    const value = e.variance.times(D(p.defaultBuyPrice))
    if (e.variance.isNegative()) {
      shortageQty = shortageQty.plus(e.variance)
      shortageValue = shortageValue.plus(value)
    } else {
      surplusQty = surplusQty.plus(e.variance)
      surplusValue = surplusValue.plus(value)
    }
    const u = e.byUserId ? userById.get(e.byUserId) : undefined
    const row: ReportRow = {
      cells: {
        at: e.at.toISOString(),
        kind: KIND_LABELS[e.kind],
        ref: e.ref,
        systemQty: e.systemQty ? e.systemQty.toFixed(3) : null,
        countedQty: e.countedQty ? e.countedQty.toFixed(3) : null,
        variance: e.variance.toFixed(3),
        value: value.toFixed(2),
        by: u?.fullName ?? '',
        notes: e.notes,
      },
    }
    return {
      id: `${e.at.getTime()}-${idx}`,
      row,
      product: `${p.name} (${p.code})`,
      category: (p.categoryRef?.parent?.name ?? p.categoryRef?.name ?? p.category).toUpperCase(),
      variance: e.variance,
      value,
    }
  })

  const { groups } = groupRows(items, {
    groups: [{ label: (i) => i.category }, { label: (i) => i.product }],
    row: { key: (i) => i.id, build: (rows) => rows[0]!.row.cells },
    measures: { variance: (i) => i.variance, value: (i) => i.value },
    formatTotals: (t) => ({ variance: t.variance!.toFixed(3), value: t.value!.toFixed(2) }),
  })

  const net = shortageQty.plus(surplusQty)
  const summary: ReportSummaryLine[] = [
    { label: 'Shortages (qty)', value: shortageQty.toFixed(3) },
    { label: 'Shortages (est. value at buy price)', value: shortageValue.toFixed(2) },
    { label: 'Surpluses (qty)', value: surplusQty.toFixed(3) },
    { label: 'Surpluses (est. value at buy price)', value: surplusValue.toFixed(2) },
    { label: 'Net variance (qty)', value: net.toFixed(3), emphasis: true },
    { label: 'Net variance (est. value)', value: shortageValue.plus(surplusValue).toFixed(2), emphasis: true },
  ]

  const filters: Record<string, string> = {}
  if (params.kind) filters.kind = params.kind
  if (params.direction) filters.direction = params.direction
  if (params.category) filters.category = params.category
  if (params.user) filters.user = params.user
  if (params.minVariance) filters.minVariance = params.minVariance
  if (params.productId) filters.productId = params.productId

  const doc: ReportDocument = {
    reportId: 'stock-variance',
    title: 'Stock Variance Report',
    subtitle: 'Negative variance = counted less than the system showed (possible missing stock)',
    orientation: 'landscape',
    params: { from: params.from, to: params.to, ...(Object.keys(filters).length ? { filters } : {}) },
    columns: [
      { key: 'at', label: 'Date', width: 0.1, format: 'datetime', excelWidth: 17 },
      { key: 'kind', label: 'Type', width: 0.11, format: 'text', excelWidth: 18 },
      { key: 'ref', label: 'Stocktake', width: 0.09, format: 'text', excelWidth: 16 },
      { key: 'systemQty', label: 'System Qty', width: 0.1, align: 'right', format: 'mass', excelWidth: 13 },
      { key: 'countedQty', label: 'Counted Qty', width: 0.1, align: 'right', format: 'mass', excelWidth: 13 },
      { key: 'variance', label: 'Variance', width: 0.09, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'value', label: 'Est. Value', width: 0.1, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'by', label: 'By', width: 0.11, format: 'text', excelWidth: 18 },
      { key: 'notes', label: 'Notes', width: 0.2, format: 'text', excelWidth: 40 },
    ],
    groups,
    grandTotal: { variance: net.toFixed(3), value: shortageValue.plus(surplusValue).toFixed(2) },
    summary,
    meta: { ...meta, rowCount: 0 },
  }
  doc.meta.rowCount = countDataRows(doc.groups)
  return doc
}
