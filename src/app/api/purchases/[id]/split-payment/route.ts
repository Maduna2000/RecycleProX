import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { ProcessSplitPaymentSchema } from '@/lib/schemas/splitPayment'
import {
  processSplitPayment,
  PurchaseNotPendingError,
  PaymentExceedsBalanceError,
  PartialPaymentNotAllowedError,
} from '@/lib/services/purchaseService'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = ProcessSplitPaymentSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  try {
    const { updated, isFullySettled } = await processSplitPayment(
      params.id,
      parsed.data,
      session.user.id
    )
    return NextResponse.json({ purchase: updated, isFullySettled })
  } catch (err) {
    if (err instanceof PurchaseNotPendingError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof PaymentExceedsBalanceError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    if (err instanceof PartialPaymentNotAllowedError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    logger.error({ err, id: params.id }, 'POST /api/purchases/[id]/split-payment failed')
    return NextResponse.json({ error: 'Failed to process split payment' }, { status: 500 })
  }
}
