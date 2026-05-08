import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import Decimal from 'decimal.js'
import { addFloatMovement } from '@/lib/services/floatService'

const WithdrawSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount')
    .refine((v) => new Decimal(v).gte(new Decimal('0.01')), { message: 'Minimum amount is E0.01' }),
  reason: z.string().min(1, 'Reason is required').max(200),
})

// POST /api/float/withdraw
// Body: { amount: "200.00", reason: "Petty cash" }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Only managers and admins can withdraw from the float' }, { status: 403 })
  }

  const body   = await req.json().catch(() => ({}))
  const parsed = WithdrawSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const result = await addFloatMovement('withdrawal', parsed.data.amount, parsed.data.reason, session.user.id)
    return NextResponse.json(result, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('would exceed float balance')) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    logger.error({ err }, 'POST /api/float/withdraw failed')
    return NextResponse.json({ error: 'Failed to record float withdrawal' }, { status: 500 })
  }
}
