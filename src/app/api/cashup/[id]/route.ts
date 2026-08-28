import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { SubmitCashUpSchema } from '@/lib/schemas/cashup'
import { getCashUp, submitCashUp, MomoBalanceMismatchError } from '@/lib/services/cashUpService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

// GET /api/cashup/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const cashUp = await runWithRequestTenant(req, () => getCashUp(params.id))
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

    // The MoMo-mismatch override is admin-only — strip it from anyone else's
    // request here rather than trusting cashUpService to re-derive the
    // caller's role, so a non-admin can never talk the service into
    // accepting an override reason it shouldn't.
    const input = session.user.role === 'admin' ? parsed.data : { ...parsed.data, momoOverrideReason: undefined }

    const cashUp = await runWithRequestTenant(req, () => submitCashUp(params.id, session.user.id, input))
    return NextResponse.json({ cashUp })
  } catch (err: unknown) {
    if (err instanceof MomoBalanceMismatchError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          expected: err.expected,
          statementBalance: err.statementBalance,
          difference: err.difference,
          canOverride: session.user.role === 'admin',
        },
        { status: 422 }
      )
    }
    const msg = 'Failed to submit cash-up'
    logger.error({ err, id: params.id }, 'PUT /api/cashup/[id] failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
