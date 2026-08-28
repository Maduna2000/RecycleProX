import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import {
  rejectCashUp,
  CashUpNotSubmittedError,
  CashUpNewerSessionOpenError,
} from '@/lib/services/cashUpService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const RejectCashUpSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
})

// POST /api/cashup/[id]/reject — manager/admin only. Sends a submitted session
// back to the cashier ('open') for correction, e.g. a fat-fingered declared cash.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden — managers only' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const parsed = RejectCashUpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const cashUp = await runWithRequestTenant(req, () => rejectCashUp(params.id, session.user.id, parsed.data.reason))
    return NextResponse.json({ cashUp })
  } catch (err: unknown) {
    if (err instanceof CashUpNotSubmittedError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof CashUpNewerSessionOpenError) return NextResponse.json({ error: err.message }, { status: 409 })
    const msg = 'Failed to reject cash-up'
    logger.error({ err, id: params.id }, 'POST /api/cashup/[id]/reject failed')
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
