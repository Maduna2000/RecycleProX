import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { parseSASTDateRange } from '@/lib/utils/dayBounds'
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
  const range = parseSASTDateRange(searchParams.get('from'), searchParams.get('to'))
  if (!range) return NextResponse.json({ error: 'Invalid date filter' }, { status: 400 })
  const { from, to } = range

  try {
    const result = await runWithRequestTenant(req, () => listMovements({ productId, direction, source, page, pageSize, from, to }))
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/stock/movements failed')
    return NextResponse.json({ error: 'Failed to fetch movements' }, { status: 500 })
  }
}
