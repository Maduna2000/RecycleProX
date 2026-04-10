import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getStocktake, upsertEntry, completeStocktake } from '@/lib/services/stocktakeService'
import { z } from 'zod'

const nonNegNum = z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, {
  message: 'Must be a non-negative number',
})

const entrySchema = z.object({
  productId:  z.string().uuid(),
  countedQty: nonNegNum,
  grossQty:   nonNegNum.optional(),
  tareQty:    nonNegNum.optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const stocktake = await getStocktake(params.id)
    return NextResponse.json(stocktake)
  } catch (err) {
    logger.error({ err, id: params.id }, 'GET /api/stocktake/[id] failed')
    return NextResponse.json({ error: 'Stocktake not found' }, { status: 404 })
  }
}

// PUT — add/update a counted entry
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const parsed = entrySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const entry = await upsertEntry(
      params.id,
      parsed.data.productId,
      parsed.data.countedQty,
      { grossQty: parsed.data.grossQty, tareQty: parsed.data.tareQty }
    )
    return NextResponse.json(entry)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to add entry'
    logger.error({ err, id: params.id }, 'PUT /api/stocktake/[id] failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// POST — complete the stocktake
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const stocktake = await completeStocktake(params.id, session.user.id)
    return NextResponse.json(stocktake)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to complete stocktake'
    logger.error({ err, id: params.id }, 'POST /api/stocktake/[id] failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
