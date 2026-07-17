import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { VoidScaleOrderSchema } from '@/lib/schemas/scale'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { voidScaleOrder, ScaleOrderNotFoundError, ScaleOrderAlreadyVoidedError } from '@/lib/services/scaleService'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = VoidScaleOrderSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const order = await runWithRequestTenant(req, () => voidScaleOrder(params.id, parsed.data, session.user.id))
    return NextResponse.json(order)
  } catch (err) {
    if (err instanceof ScaleOrderNotFoundError)     return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof ScaleOrderAlreadyVoidedError) return NextResponse.json({ error: err.message }, { status: 409 })
    logger.error({ err }, 'POST /api/scale/orders/[id]/void failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
