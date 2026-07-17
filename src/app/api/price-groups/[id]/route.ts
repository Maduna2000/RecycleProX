import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdatePriceGroupSchema } from '@/lib/schemas/product'
import {
  getPriceGroupWithOverrides, updatePriceGroup, deletePriceGroup,
  PriceGroupNotFoundError, DuplicatePriceGroupNameError,
  PriceGroupInUseError, DefaultPriceGroupDeleteError,
} from '@/lib/services/productService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const group = await runWithRequestTenant(req, () => getPriceGroupWithOverrides(params.id))
    return NextResponse.json(group)
  } catch (err) {
    if (err instanceof PriceGroupNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/price-groups/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch price group' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = UpdatePriceGroupSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const group = await runWithRequestTenant(req, () => updatePriceGroup(params.id, parsed.data, session.user.id))
    return NextResponse.json(group)
  } catch (err) {
    if (err instanceof PriceGroupNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof DuplicatePriceGroupNameError) return NextResponse.json({ error: err.message }, { status: 409 })
    logger.error({ err }, 'PUT /api/price-groups/[id] failed')
    return NextResponse.json({ error: 'Failed to update price group' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await runWithRequestTenant(req, () => deletePriceGroup(params.id, session.user.id))
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof PriceGroupNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof DefaultPriceGroupDeleteError) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof PriceGroupInUseError) return NextResponse.json({ error: err.message }, { status: 409 })
    logger.error({ err }, 'DELETE /api/price-groups/[id] failed')
    return NextResponse.json({ error: 'Failed to delete price group' }, { status: 500 })
  }
}
