import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdateScaleProductSchema } from '@/lib/schemas/scale'
import { updateProduct, deactivateProduct, ScaleProductNotFoundError } from '@/lib/services/scaleProductService'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = UpdateScaleProductSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const product = await updateProduct(params.id, parsed.data, session.user.id)
    return NextResponse.json(product)
  } catch (err) {
    if (err instanceof ScaleProductNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'PATCH /api/scale/products/[id] failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const product = await deactivateProduct(params.id, session.user.id)
    return NextResponse.json(product)
  } catch (err) {
    if (err instanceof ScaleProductNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'DELETE /api/scale/products/[id] failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
