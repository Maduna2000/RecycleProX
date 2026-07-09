/**
 * Stock Take report builder — one group per Stocktake session in the period,
 * with per-product system/counted/variance rows and a variance subtotal.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { formatDateSAST, formatTimeSAST } from '@/lib/reports/format'
import type { ReportDocument, ReportGroup, ReportMeta, ReportRow } from '@/lib/reports/types'
import type { StocktakeReportParams } from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

const D = (v: unknown) => new Decimal(String(v ?? 0))

export async function buildStocktakeReport(
  params: StocktakeReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)
  const status = params.status ?? 'all'

  const stocktakes = await prisma.stocktake.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      status: status === 'all' ? { in: ['open', 'completed'] } : status,
    },
    select: {
      refNumber: true,
      status: true,
      createdAt: true,
      entries: {
        select: {
          systemQty: true,
          countedQty: true,
          variance: true,
          grossQty: true,
          tareQty: true,
          product: {
            select: {
              code: true,
              name: true,
              category: true,
              categoryRef: { select: { name: true, parent: { select: { name: true } } } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  type Entry = (typeof stocktakes)[number]['entries'][number]
  const topCategoryOf = (e: Entry) =>
    (e.product.categoryRef?.parent?.name ?? e.product.categoryRef?.name ?? e.product.category).toUpperCase()

  const groups: ReportGroup[] = []
  let grandVariance = new Decimal(0)
  let rowCount = 0

  for (const st of stocktakes) {
    const rows: ReportRow[] = [...st.entries]
      .sort((a, b) => a.product.name.localeCompare(b.product.name))
      .map((e) => ({
        cells: {
          code: e.product.code,
          name: e.product.name,
          category: topCategoryOf(e),
          systemQty: D(e.systemQty).toFixed(3),
          countedQty: D(e.countedQty).toFixed(3),
          variance: D(e.variance).toFixed(3),
          grossQty: e.grossQty ? D(e.grossQty).toFixed(3) : null,
          tareQty: e.tareQty ? D(e.tareQty).toFixed(3) : null,
        },
      }))

    const sessionVariance = st.entries.reduce((acc, e) => acc.plus(D(e.variance)), new Decimal(0))
    grandVariance = grandVariance.plus(sessionVariance)
    rowCount += rows.length

    groups.push({
      level: 0,
      label: st.refNumber,
      meta: `${formatDateSAST(st.createdAt.toISOString())} ${formatTimeSAST(st.createdAt.toISOString())}  ·  ${st.status.toUpperCase()}`,
      rows,
      subtotal: { variance: sessionVariance.toFixed(3) },
    })
  }

  return {
    reportId: 'stocktake-report',
    title: 'Stock Take Report',
    params: {
      from: params.from,
      to: params.to,
      ...(params.status ? { filters: { status: params.status } } : {}),
    },
    columns: [
      { key: 'code', label: 'Code', width: 0.1, format: 'text', excelWidth: 12 },
      { key: 'name', label: 'Product', width: 0.22, format: 'text', excelWidth: 26 },
      { key: 'category', label: 'Category', width: 0.14, format: 'text', excelWidth: 16 },
      { key: 'systemQty', label: 'System Qty', width: 0.13, align: 'right', format: 'mass', excelWidth: 13 },
      { key: 'countedQty', label: 'Counted Qty', width: 0.13, align: 'right', format: 'mass', excelWidth: 13 },
      { key: 'variance', label: 'Variance', width: 0.11, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'grossQty', label: 'Gross Qty', width: 0.085, align: 'right', format: 'mass', excelWidth: 11 },
      { key: 'tareQty', label: 'Tare Qty', width: 0.085, align: 'right', format: 'mass', excelWidth: 11 },
    ],
    groups,
    grandTotal: { variance: grandVariance.toFixed(3) },
    meta: { ...meta, rowCount },
  }
}
