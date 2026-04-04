import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getStockOnHand } from '@/lib/services/stockService'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const productId = req.nextUrl.searchParams.get('productId') ?? undefined

  try {
    const stock = await getStockOnHand(productId)
    return NextResponse.json({ stock })
  } catch (err) {
    logger.error({ err }, 'GET /api/stock/on-hand failed')
    return NextResponse.json({ error: 'Failed to fetch stock levels' }, { status: 500 })
  }
}
