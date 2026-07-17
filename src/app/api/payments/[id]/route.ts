import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getPayment, PaymentNotFoundError } from '@/lib/services/paymentService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const payment = await runWithRequestTenant(req, () => getPayment(params.id))
    return NextResponse.json(payment)
  } catch (err) {
    if (err instanceof PaymentNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/payments/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 })
  }
}
