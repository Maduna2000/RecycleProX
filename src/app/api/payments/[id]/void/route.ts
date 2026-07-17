import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { VoidPaymentSchema } from '@/lib/schemas/payment'
import { voidPayment, PaymentNotFoundError, PaymentAlreadyVoidedError } from '@/lib/services/paymentService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can void payments' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = VoidPaymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const payment = await runWithRequestTenant(req, () => voidPayment(params.id, parsed.data, session.user.id))
    return NextResponse.json(payment)
  } catch (err) {
    if (err instanceof PaymentNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof PaymentAlreadyVoidedError) return NextResponse.json({ error: err.message }, { status: 409 })
    logger.error({ err }, 'POST /api/payments/[id]/void failed')
    return NextResponse.json({ error: 'Failed to void payment' }, { status: 500 })
  }
}
