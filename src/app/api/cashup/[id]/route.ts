import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { SubmitCashUpSchema } from '@/lib/schemas/cashup'
import { getCashUp, submitCashUp, attachCurrencyStatus } from '@/lib/services/cashUpService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// GET /api/cashup/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const cashUp = await runWithRequestTenant(req, async () => {
      const found = await getCashUp(params.id)
      return found ? attachCurrencyStatus(found) : null
    })
    if (!cashUp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ cashUp })
  } catch (err) {
    logger.error({ err, id: params.id }, 'GET /api/cashup/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch cash-up' }, { status: 500 })
  }
}

// PUT /api/cashup/[id] — submit (cashier declares denominations + cash)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = SubmitCashUpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const cashUp = await runWithRequestTenant(req, () => submitCashUp(params.id, session.user.id, parsed.data))
    return NextResponse.json({ cashUp })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit cash-up'
    logger.error({ err, id: params.id }, 'PUT /api/cashup/[id] failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
