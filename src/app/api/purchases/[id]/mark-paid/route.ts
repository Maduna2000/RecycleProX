import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { z } from 'zod'
import Decimal from 'decimal.js'
import { markPurchasePaid, PurchaseNotPendingError, PaymentExceedsBalanceError } from '@/lib/services/purchaseService'

const SettleSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount (e.g. 150.00)')
    .refine((v) => new Decimal(v).gte(new Decimal('0.01')), {
      message: 'Minimum payment amount is E0.01',
    }),
  paymentMethod: z.enum(['cash', 'eft', 'cheque', 'amplopay']).default('cash'),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body   = await req.json().catch(() => ({}))
  const parsed = SettleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const { updated } = await markPurchasePaid(params.id, parsed.data, session.user.id)
    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof PurchaseNotPendingError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof PaymentExceedsBalanceError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    logger.error({ err }, 'PATCH /api/purchases/[id]/mark-paid failed')
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 })
  }
}
