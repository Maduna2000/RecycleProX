import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { ReverseSalePaymentSchema } from '@/lib/schemas/sale'
import { reverseSalePayment, SaleNotFoundError, SaleNotCompletedError } from '@/lib/services/saleService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can reverse a sale payment' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = ReverseSalePaymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const sale = await runWithRequestTenant(req, () => reverseSalePayment(params.id, parsed.data, session.user.id))
    return NextResponse.json(sale)
  } catch (err) {
    if (err instanceof SaleNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof SaleNotCompletedError) return NextResponse.json({ error: err.message }, { status: 409 })

    const message = err instanceof Error ? err.message : 'Failed to reverse sale payment'
    logger.error({ err }, 'POST /api/sales/[id]/reverse-payment failed')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
