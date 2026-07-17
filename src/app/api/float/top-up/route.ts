import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import Decimal from 'decimal.js'
import { addFloatMovement, FloatMovementLockedError } from '@/lib/services/floatService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

const TopUpSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount')
    .refine((v) => new Decimal(v).gte(new Decimal('0.01')), { message: 'Minimum amount is 0.01' }),
  note: z.string().max(200).optional(),
})

// POST /api/float/top-up
// Body: { amount: "500.00", note?: "Manager top-up" }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Only managers and admins can top up the float' }, { status: 403 })
  }

  const body   = await req.json().catch(() => ({}))
  const parsed = TopUpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const result = await runWithRequestTenant(req, () => addFloatMovement('top_up', parsed.data.amount, parsed.data.note, session.user.id))
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof FloatMovementLockedError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    logger.error({ err }, 'POST /api/float/top-up failed')
    return NextResponse.json({ error: 'Failed to record float top-up' }, { status: 500 })
  }
}
