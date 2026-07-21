import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { ProcessSaleSplitPaymentSchema } from '@/lib/schemas/splitPayment'
import {
  processSaleSplitPayment,
  SaleNotPendingError,
  SalePaymentExceedsBalanceError,
  SalePartialPaymentNotAllowedError,
  SaleHasNoLinkedCustomerError,
} from '@/lib/services/saleService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can record payments' }, { status: 403 })
  }

  const body   = await req.json().catch(() => ({}))
  const parsed = ProcessSaleSplitPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const { updated, isFullySettled } = await runWithRequestTenant(req, () =>
      processSaleSplitPayment(params.id, parsed.data, session.user.id))
    return NextResponse.json({ sale: updated, isFullySettled })
  } catch (err) {
    if (err instanceof SaleNotPendingError)             return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof SalePaymentExceedsBalanceError)  return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof SalePartialPaymentNotAllowedError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof SaleHasNoLinkedCustomerError)    return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err, saleId: params.id }, 'POST /api/sales/[id]/split-payment failed')
    return NextResponse.json({ error: 'Failed to process split payment' }, { status: 500 })
  }
}
