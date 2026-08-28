import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getStocktake, upsertEntry, completeStocktake, updateEntryPhoto } from '@/lib/services/stocktakeService'
import { UpsertEntrySchema, UpdateEntryPhotoSchema } from '@/lib/schemas/stocktake'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const stocktake = await runWithRequestTenant(req, () => getStocktake(params.id))
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
    const parsed = UpsertEntrySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const entry = await runWithRequestTenant(req, () => upsertEntry(
      params.id,
      parsed.data.productId,
      parsed.data.countedQty,
      {
        grossQty: parsed.data.grossQty,
        tareQty: parsed.data.tareQty,
        photoR2Key: parsed.data.photoR2Key,
        includeTodayStock: parsed.data.includeTodayStock,
      }
    ))
    return NextResponse.json(entry)
  } catch (err: unknown) {
    const msg = 'Failed to add entry'
    logger.error({ err, id: params.id }, 'PUT /api/stocktake/[id] failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// PATCH — update photo on a specific entry
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const parsed = UpdateEntryPhotoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const entry = await runWithRequestTenant(req, () => updateEntryPhoto(params.id, parsed.data.productId, parsed.data.photoR2Key))
    return NextResponse.json(entry)
  } catch (err: unknown) {
    const msg = 'Failed to update photo'
    logger.error({ err, id: params.id }, 'PATCH /api/stocktake/[id] failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// POST — complete the stocktake
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const stocktake = await runWithRequestTenant(req, () => completeStocktake(params.id, session.user.id))
    return NextResponse.json(stocktake)
  } catch (err: unknown) {
    const msg = 'Failed to complete stocktake'
    logger.error({ err, id: params.id }, 'POST /api/stocktake/[id] failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
