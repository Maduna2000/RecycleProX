import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { ReversePurchasePaymentSchema } from '@/lib/schemas/purchase'
import { reversePurchasePayment, PurchaseNotFoundError, PurchaseNotCompletedError } from '@/lib/services/purchaseService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can reverse a purchase payment' }, { status: 403 })
  }

  const { id } = await context.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ReversePurchasePaymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const purchase = await runWithRequestTenant(req, () => reversePurchasePayment(id, parsed.data, session.user.id))
    return NextResponse.json(purchase)
  } catch (err) {
    if (err instanceof PurchaseNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof PurchaseNotCompletedError) return NextResponse.json({ error: err.message }, { status: 409 })

    const message = err instanceof Error ? err.message : 'Failed to reverse purchase payment'
    logger.error({ err, purchaseId: id }, 'POST /api/purchases/[id]/reverse-payment failed')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
