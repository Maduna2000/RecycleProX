import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'

/**
 * GET /api/reports/today
 * Quick dashboard KPIs for today. All authenticated users.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now   = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  try {
    const [salesAgg, purchasesAgg, salesCount, purchasesCount, openCashUp] = await Promise.all([
      prisma.sale.aggregate({
        _sum: { totalAmount: true },
        where: { status: 'completed', createdAt: { gte: start, lte: end } },
      }),
      prisma.purchase.aggregate({
        _sum: { totalAmount: true },
        where: { status: 'completed', createdAt: { gte: start, lte: end } },
      }),
      prisma.sale.count({
        where: { status: 'completed', createdAt: { gte: start, lte: end } },
      }),
      prisma.purchase.count({
        where: { status: 'completed', createdAt: { gte: start, lte: end } },
      }),
      prisma.cashUp.findFirst({
        where: { sessionDate: start, status: { in: ['open', 'submitted'] } },
      }),
    ])

    const totalSales     = new Decimal(salesAgg._sum.totalAmount?.toString()     ?? '0')
    const totalPurchases = new Decimal(purchasesAgg._sum.totalAmount?.toString() ?? '0')

    return NextResponse.json({
      date:           start.toISOString().split('T')[0],
      sales:          { total: totalSales.toFixed(2),     count: salesCount },
      purchases:      { total: totalPurchases.toFixed(2), count: purchasesCount },
      netFlow:        totalSales.minus(totalPurchases).toFixed(2),
      cashUpStatus:   openCashUp?.status ?? null,
      cashUpId:       openCashUp?.id ?? null,
    })
  } catch (err) {
    logger.error({ err }, 'GET /api/reports/today failed')
    return NextResponse.json({ error: 'Failed to fetch today stats' }, { status: 500 })
  }
}
