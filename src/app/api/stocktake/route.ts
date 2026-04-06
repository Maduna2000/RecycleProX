import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { createStocktake, listStocktakes } from '@/lib/services/stocktakeService'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await listStocktakes()
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/stocktake failed')
    return NextResponse.json({ error: 'Failed to list stocktakes' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const stocktake = await createStocktake(session.user.id, body.notes)
    return NextResponse.json(stocktake, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/stocktake failed')
    return NextResponse.json({ error: 'Failed to create stocktake' }, { status: 500 })
  }
}
