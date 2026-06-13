import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'

// Debug endpoint to check scale orders in database
// Only accessible by admin
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 })
  }

  try {
    // Get counts
    const totalOrders = await prisma.scaleOrder.count()
    const pendingOrders = await prisma.scaleOrder.count({ where: { status: 'pending' } })
    const processedOrders = await prisma.scaleOrder.count({ where: { status: 'processed' } })
    const voidedOrders = await prisma.scaleOrder.count({ where: { status: 'voided' } })

    // Get orders by day for the last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const recentOrders = await prisma.scaleOrder.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        status: true,
        operator: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Group by date
    const ordersByDate: Record<string, number> = {}
    for (const order of recentOrders) {
      const date = order.createdAt.toISOString().split('T')[0]
      ordersByDate[date] = (ordersByDate[date] || 0) + 1
    }

    return NextResponse.json({
      summary: {
        totalOrders,
        pendingOrders,
        processedOrders,
        voidedOrders,
      },
      ordersByDate,
      recentOrders: recentOrders.map(o => ({
        orderNumber: o.orderNumber,
        date: o.createdAt.toISOString(),
        status: o.status,
        operator: o.operator?.fullName ?? 'Unknown',
      })),
    })
  } catch (err) {
    return NextResponse.json({
      error: 'Database query failed',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 })
  }
}
