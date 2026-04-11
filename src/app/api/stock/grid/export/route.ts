import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import * as XLSX from 'xlsx'
import { getPeriodBounds } from '../route'
import { prisma } from '@/lib/db/prisma'
import { Prisma, ProductCategory } from '@prisma/client'
import Decimal from 'decimal.js'

const CATEGORY_LABELS: Record<string, string> = {
  ferrous: 'Ferrous', non_ferrous: 'Non-Ferrous', copper: 'Copper',
  aluminium: 'Aluminium', plastic: 'Plastic', paper: 'Paper',
  e_waste: 'E-Waste', other: 'Other',
}

/**
 * GET /api/stock/grid/export?period=daily|weekly|mtd&date=YYYY-MM-DD&category=
 * Downloads a stock grid as an .xlsx file.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params    = req.nextUrl.searchParams
  const period    = (params.get('period') ?? 'daily') as 'daily' | 'weekly' | 'mtd'
  const dateParam = params.get('date') ?? new Date().toISOString().slice(0, 10)
  const category  = params.get('category') ?? undefined

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  try {
    const { periodStart, periodEnd, openingCutoff } = getPeriodBounds(period, dateParam)

    const productWhere: Prisma.ProductWhereInput = {
      isActive: true,
      ...(category ? { category: category as ProductCategory } : undefined),
    }

    const [products, movements] = await Promise.all([
      prisma.product.findMany({
        where: productWhere,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      prisma.stockMovement.findMany({
        where: {
          product: productWhere,
          createdAt: { gte: openingCutoff, lte: periodEnd },
        },
        select: { productId: true, direction: true, quantity: true, source: true, createdAt: true },
      }),
    ])

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

      const closingQty   = openingQty.plus(purchasedQty).minus(soldQty).plus(adjustedQty)
      const closingValue = closingQty.times(new Decimal(p.defaultBuyPrice.toString()))

      return {
        Code:           p.code,
        Product:        p.name,
        Category:       CATEGORY_LABELS[p.category] ?? p.category,
        Unit:           p.unit,
        'Opening Qty':  openingQty.toFixed(3),
        'Purchased':    purchasedQty.toFixed(3),
        'Sold':         soldQty.toFixed(3),
        'Adjusted':     adjustedQty.toFixed(3),
        'Closing Qty':  closingQty.toFixed(3),
        'Buy Price':    Number(p.defaultBuyPrice),
        'Closing Value (R)': Number(closingValue.toFixed(2)),
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)

    // Column widths
    ws['!cols'] = [
      { wch: 10 }, { wch: 30 }, { wch: 14 }, { wch: 8 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 18 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Stock Grid')

    const rawBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const filename = `stock-grid-${period}-${dateParam}.xlsx`

    logger.info({ userId: session.user.id, period, date: dateParam }, 'stock.grid.export')

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
