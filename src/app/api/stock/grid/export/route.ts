import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import * as XLSX from 'xlsx'
import { getPeriodBounds } from '@/lib/utils/stock-periods'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'
import { expandCategoryNames } from '@/lib/services/productService'
import { buildReportMeta } from '@/lib/services/reports/meta'
import { getAllSettings, currencySymbolFromSettings } from '@/lib/services/settingsService'
import { generateBusinessReportPdf } from '@/lib/pdf/businessReport'
import type { ReportDocument, ReportGroup } from '@/lib/reports/types'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const PERIOD_LABELS = { daily: 'Daily', weekly: 'Weekly', mtd: 'Month to Date' } as const

/**
 * GET /api/stock/grid/export?period=daily|weekly|mtd&date=YYYY-MM-DD&category=&format=xlsx|pdf
 * Downloads a stock grid as an .xlsx (default) or .pdf file.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params    = req.nextUrl.searchParams
  const period    = (params.get('period') ?? 'daily') as 'daily' | 'weekly' | 'mtd'
  const dateParam = params.get('date') ?? new Date().toISOString().slice(0, 10)
  const category  = params.get('category') ?? undefined
  const format    = params.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  try {
    const { periodStart, periodEnd, openingCutoff } = getPeriodBounds(period, dateParam)

    const [products, rawMovements, voidedPurchaseIds, voidedSaleIds] = await runWithRequestTenant(req, async () => {
      // A parent category selection covers its sub-categories too
      const productWhere: Prisma.ProductWhereInput = {
        isActive: true,
        ...(category ? { category: { in: await expandCategoryNames(category) } } : undefined),
      }

      return Promise.all([
        prisma.product.findMany({
          where: productWhere,
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        }),
        prisma.stockMovement.findMany({
          where: {
            product: productWhere,
            createdAt: { gte: openingCutoff, lte: periodEnd },
          },
          select: { productId: true, direction: true, quantity: true, source: true, sourceId: true, createdAt: true },
        }),
        prisma.purchase.findMany({ where: { status: 'voided' }, select: { id: true } }).then((r) => r.map((x) => x.id)),
        prisma.sale.findMany({ where: { status: 'voided' }, select: { id: true } }).then((r) => r.map((x) => x.id)),
      ])
    })

    // See the matching comment in src/app/api/stock/grid/route.ts — a
    // voided purchase/sale's original movement is never deleted or retagged,
    // only offset by a separate void_reversal sharing the same sourceId.
    // Dropping both before aggregating keeps Purchased/Sold real.
    const voidedIds = new Set([...voidedPurchaseIds, ...voidedSaleIds])
    const movements = rawMovements.filter((m) => !m.sourceId || !voidedIds.has(m.sourceId))

    // Build rows
    const rows = products.map((p) => {
      const pMvt = movements.filter((m) => m.productId === p.id)

      const openingIn  = pMvt.filter((m) => m.createdAt < periodStart && m.direction === 'in').reduce((a, m) => a.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const openingOut = pMvt.filter((m) => m.createdAt < periodStart && m.direction === 'out').reduce((a, m) => a.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const openingQty = openingIn.minus(openingOut)

      const period_mvt = pMvt.filter((m) => m.createdAt >= periodStart && m.createdAt <= periodEnd)

      const purchasedQty = period_mvt.filter((m) => m.direction === 'in' && m.source === 'purchase').reduce((a, m) => a.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const soldQty      = period_mvt.filter((m) => m.direction === 'out' && m.source === 'sale').reduce((a, m) => a.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const adjIn        = period_mvt.filter((m) => m.direction === 'in' && m.source === 'manual_adjustment').reduce((a, m) => a.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const adjOut       = period_mvt.filter((m) => m.direction === 'out' && m.source === 'manual_adjustment').reduce((a, m) => a.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const adjustedQty  = adjIn.minus(adjOut)
      // No separate "voided" term needed: movements tied to a currently-
      // voided purchase/sale were already dropped from `movements` above.
      const closingQty   = openingQty.plus(purchasedQty).minus(soldQty).plus(adjustedQty)
      const closingValue = closingQty.times(new Decimal(p.defaultBuyPrice.toString()))

      return {
        code:      p.code,
        name:      p.name,
        category:  p.category,
        unit:      p.unit,
        opening:   openingQty.toFixed(2),
        purchased: purchasedQty.toFixed(2),
        sold:      soldQty.toFixed(2),
        adjusted:  adjustedQty.toFixed(2),
        closing:   closingQty.toFixed(2),
        buyPrice:  new Decimal(p.defaultBuyPrice.toString()),
        value:     closingValue,
      }
    })

    const currencySymbol = currencySymbolFromSettings(await getAllSettings())

    logger.info({ userId: session.user.id, period, date: dateParam, format }, 'stock.grid.export')

    if (format === 'pdf') {
      const meta = await buildReportMeta(session.user.name ?? session.user.username ?? 'Unknown')
      if (meta.company.name === 'Renovo Pro') {
        meta.company = { ...meta.company, name: 'Golden Key Investments (Pty) Ltd' }
      }

      // One group per category (rows are already category-sorted)
      const groups: ReportGroup[] = []
      for (const row of rows) {
        let group = groups[groups.length - 1]
        if (!group || group.label !== row.category.toUpperCase()) {
          group = { level: 0, label: row.category.toUpperCase(), rows: [], subtotal: { value: '0.00' } }
          groups.push(group)
        }
        group.rows!.push({
          cells: {
            code:      row.code,
            name:      row.name,
            unit:      row.unit,
            opening:   row.opening,
            purchased: row.purchased,
            sold:      row.sold,
            adjusted:  row.adjusted,
            closing:   row.closing,
            value:     row.value.toFixed(2),
          },
        })
        group.subtotal = { value: new Decimal(group.subtotal?.value ?? '0').plus(row.value).toFixed(2) }
      }
      const totalValue = rows.reduce((a, r) => a.plus(r.value), new Decimal(0))

      const doc: ReportDocument = {
        reportId: 'stock-grid',
        title: `Stock Grid — ${PERIOD_LABELS[period]}`,
        subtitle: category ? `Category: ${category}` : undefined,
        params: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
        columns: [
          { key: 'code',      label: 'Code',      width: 0.08 },
          { key: 'name',      label: 'Product',   width: 0.21 },
          { key: 'unit',      label: 'Unit',      width: 0.05 },
          { key: 'opening',   label: 'Opening',   width: 0.09, align: 'right', format: 'qty' },
          { key: 'purchased', label: 'Purchased', width: 0.09, align: 'right', format: 'qty' },
          { key: 'sold',      label: 'Sold',      width: 0.08, align: 'right', format: 'qty' },
          { key: 'adjusted',  label: 'Adjusted',  width: 0.09, align: 'right', format: 'qty' },
          { key: 'closing',   label: 'Closing',   width: 0.10, align: 'right', format: 'qty' },
          { key: 'value',     label: 'Value',     width: 0.12, align: 'right', format: 'money' },
        ],
        groups,
        grandTotal: { value: totalValue.toFixed(2) },
        meta: { ...meta, rowCount: rows.length },
      }

      const pdfBytes = await generateBusinessReportPdf(doc)
      const body = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer

      return new NextResponse(body, {
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="stock-grid-${period}-${dateParam}.pdf"`,
          'Content-Length':      String(body.byteLength),
        },
      })
    }

    const xlsxRows = rows.map((r) => ({
      Code:           r.code,
      Product:        r.name,
      Category:       r.category,
      Unit:           r.unit,
      'Opening Qty':  r.opening,
      'Purchased':    r.purchased,
      'Sold':         r.sold,
      'Adjusted':     r.adjusted,
      'Closing Qty':  r.closing,
      'Buy Price':    r.buyPrice.toNumber(),
      [`Closing Value (${currencySymbol})`]: Number(r.value.toFixed(2)),
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(xlsxRows)

    // Column widths
    ws['!cols'] = [
      { wch: 10 }, { wch: 30 }, { wch: 14 }, { wch: 8 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 18 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Stock Grid')

    const rawBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const filename = `stock-grid-${period}-${dateParam}.xlsx`

    return new NextResponse(rawBuf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    logger.error({ err }, 'GET /api/stock/grid/export failed')
    return NextResponse.json({ error: 'Failed to export stock grid' }, { status: 500 })
  }
}
