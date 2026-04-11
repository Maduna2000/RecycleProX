import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'

/**
 * GET /api/stock/grid?period=daily|weekly|mtd&date=YYYY-MM-DD&categoryId=
 * Returns a stock movement grid per product for the given period.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params    = req.nextUrl.searchParams
  const period    = (params.get('period') ?? 'daily') as 'daily' | 'weekly' | 'mtd'
  const dateParam = params.get('date') ?? new Date().toISOString().slice(0, 10)
  const category  = params.get('category') ?? undefined

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'Invalid date format (YYYY-MM-DD required)' }, { status: 400 })
  }

  try {
    const { periodStart, periodEnd, openingCutoff } = getPeriodBounds(period, dateParam)

    const productWhere: Prisma.ProductWhereInput = {
      isActive: true,
      ...(category ? { category } : undefined),
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

    // Build per-product aggregates
    const grid = products.map((p) => {
      const pMovements = movements.filter((m) => m.productId === p.id)

      // Opening balance = movements strictly before the period start
      const openingIn = pMovements
        .filter((m) => m.createdAt < periodStart && m.direction === 'in')
        .reduce((acc, m) => acc.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const openingOut = pMovements
        .filter((m) => m.createdAt < periodStart && m.direction === 'out')
        .reduce((acc, m) => acc.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const openingQty = openingIn.minus(openingOut)

      // Period movements
      const periodMvt = pMovements.filter((m) => m.createdAt >= periodStart && m.createdAt <= periodEnd)

      const purchasedQty = periodMvt
        .filter((m) => m.direction === 'in' && m.source === 'purchase')
        .reduce((acc, m) => acc.plus(new Decimal(m.quantity.toString())), new Decimal(0))

      const soldQty = periodMvt
        .filter((m) => m.direction === 'out' && m.source === 'sale')
        .reduce((acc, m) => acc.plus(new Decimal(m.quantity.toString())), new Decimal(0))

      const adjustedIn = periodMvt
        .filter((m) => m.direction === 'in' && m.source === 'manual_adjustment')
        .reduce((acc, m) => acc.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const adjustedOut = periodMvt
        .filter((m) => m.direction === 'out' && m.source === 'manual_adjustment')
        .reduce((acc, m) => acc.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const adjustedQty = adjustedIn.minus(adjustedOut)

      const closingQty = openingQty.plus(purchasedQty).minus(soldQty).plus(adjustedQty)
      const closingValue = closingQty.times(new Decimal(p.defaultBuyPrice.toString()))

      return {
        productId:    p.id,
        code:         p.code,
        name:         p.name,
        category:     p.category,
        unit:         p.unit,
        openingQty:   openingQty.toFixed(3),
        purchasedQty: purchasedQty.toFixed(3),
        soldQty:      soldQty.toFixed(3),
        adjustedQty:  adjustedQty.toFixed(3),
        closingQty:   closingQty.toFixed(3),
        closingValue: closingValue.toFixed(2),
        buyPrice:     p.defaultBuyPrice.toString(),
      }
    })

    return NextResponse.json({ grid, period, date: dateParam, periodStart, periodEnd })
  } catch (err) {
    logger.error({ err, period, date: dateParam }, 'GET /api/stock/grid failed')
    return NextResponse.json({ error: 'Failed to build stock grid' }, { status: 500 })
  }
}

export function getPeriodBounds(period: 'daily' | 'weekly' | 'mtd', dateParam: string) {
  const [y, m, d] = dateParam.split('-').map(Number)
  const refDate = new Date(y!, m! - 1, d!)

  let periodStart: Date
  const periodEnd = new Date(refDate)
  periodEnd.setHours(23, 59, 59, 999)

  if (period === 'daily') {
    periodStart = new Date(refDate)
    periodStart.setHours(0, 0, 0, 0)
  } else if (period === 'weekly') {
    // Monday–Sunday week containing refDate
    const dow = refDate.getDay() === 0 ? 6 : refDate.getDay() - 1 // 0=Mon
    periodStart = new Date(refDate)
    periodStart.setDate(refDate.getDate() - dow)
    periodStart.setHours(0, 0, 0, 0)
  } else {
    // MTD: 1st of the month to refDate
    periodStart = new Date(y!, m! - 1, 1, 0, 0, 0, 0)
  }

  // Opening cutoff: beginning of time (we pull all history to compute opening balance)
  const openingCutoff = new Date(0)

  return { periodStart, periodEnd, openingCutoff }
}
