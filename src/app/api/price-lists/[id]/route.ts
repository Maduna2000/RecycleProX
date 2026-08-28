import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPriceList, updatePriceList, deletePriceList } from '@/lib/services/priceListService'
import { UpdatePriceListSchema } from '@/lib/schemas/priceList'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const priceList = await runWithRequestTenant(req, () => getPriceList(params.id))
    return NextResponse.json(priceList)
  } catch {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = UpdatePriceListSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const priceList = await runWithRequestTenant(req, () => updatePriceList(params.id, parsed.data))
    return NextResponse.json(priceList)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    logger.error({ err, priceListId: params.id }, 'PATCH /api/price-lists/[id] failed')
    if (message === 'Price list not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message === 'Price list was modified by another user') {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update price list' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
  }

  try {
    await runWithRequestTenant(req, () => deletePriceList(params.id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ err, priceListId: params.id }, 'DELETE /api/price-lists/[id] failed')
    return NextResponse.json({ error: 'Failed to delete price list' }, { status: 500 })
  }
}
