import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'
import { getPeriodBounds } from '@/lib/utils/stock-periods'
import { expandCategoryNames } from '@/lib/services/productService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

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

    const [products, movements] = await runWithRequestTenant(req, async () => {
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
          select: { productId: true, direction: true, quantity: true, source: true, createdAt: true },
        }),
      ])
    })

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

      // Net effect of voided-transaction reversals within the period — a
      // voided purchase gives stock back (out), a voided sale takes it back
      // (in). Shown as its own bucket rather than folded silently into
      // purchasedQty/soldQty so the breakdown stays honest; previously this
      // was left out of closingQty entirely, overstating stock by the full
      // amount of any purchase voided within the period (confirmed live:
      // PROCESSED HEAVY STEEL was overstated by 605kg from one voided
      // purchase before this fix).
      const voidedIn = periodMvt
        .filter((m) => m.direction === 'in' && m.source === 'void_reversal')
        .reduce((acc, m) => acc.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const voidedOut = periodMvt
        .filter((m) => m.direction === 'out' && m.source === 'void_reversal')
        .reduce((acc, m) => acc.plus(new Decimal(m.quantity.toString())), new Decimal(0))
      const voidedQty = voidedIn.minus(voidedOut)

      const closingQty = openingQty.plus(purchasedQty).minus(soldQty).plus(adjustedQty).plus(voidedQty)
      const closingValue = closingQty.times(new Decimal(p.defaultBuyPrice.toString()))

      return {
        productId:    p.id,
        code:         p.code,
        name:         p.name,
        category:     p.category,
        unit:         p.unit,
        openingQty:   openingQty.toFixed(2),
        purchasedQty: purchasedQty.toFixed(2),
        soldQty:      soldQty.toFixed(2),
        adjustedQty:  adjustedQty.toFixed(2),
        voidedQty:    voidedQty.toFixed(2),
        closingQty:   closingQty.toFixed(2),
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

