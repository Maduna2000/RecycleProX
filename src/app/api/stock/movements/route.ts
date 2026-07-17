import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { listMovements } from '@/lib/services/stockService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const productId = searchParams.get('productId') ?? undefined
  const direction = searchParams.get('direction') as 'in' | 'out' | undefined
  const source = searchParams.get('source') ?? undefined
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '100')
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined
  const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined

  try {
    const result = await runWithRequestTenant(req, () => listMovements({ productId, direction, source, page, pageSize, from, to }))
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/stock/movements failed')
    return NextResponse.json({ error: 'Failed to fetch movements' }, { status: 500 })
  }
}
