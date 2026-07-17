import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import {
  markProcessed, ScaleOrderNotFoundError,
  ScaleOrderAlreadyVoidedError, ScaleOrderAlreadyProcessedError,
} from '@/lib/services/scaleService'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const order = await runWithRequestTenant(req, () => markProcessed(params.id, session.user.id))
    return NextResponse.json(order)
  } catch (err) {
    if (err instanceof ScaleOrderNotFoundError)          return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof ScaleOrderAlreadyVoidedError)     return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof ScaleOrderAlreadyProcessedError)  return NextResponse.json({ error: err.message }, { status: 409 })
    logger.error({ err }, 'POST /api/scale/orders/[id]/process failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
