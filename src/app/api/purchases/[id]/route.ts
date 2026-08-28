import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdatePurchaseSchema } from '@/lib/schemas/purchase'
import {
  getPurchase, updatePurchase, PurchaseNotFoundError, PurchaseNotPendingError,
  AmountAlreadyPaidError, CustomerBlacklistedError, CustomerInactiveError, ProductInactiveError,
} from '@/lib/services/purchaseService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Await params for Next.js 15 compatibility
  const { id } = await context.params

  try {
    const purchase = await runWithRequestTenant(req, () => getPurchase(id))
    return NextResponse.json(purchase)
  } catch (err) {
    if (err instanceof PurchaseNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err, purchaseId: id }, 'GET /api/purchases/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch purchase' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can edit a purchase' }, { status: 403 })
  }

  const { id } = await context.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdatePurchaseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const purchase = await runWithRequestTenant(req, () => updatePurchase(id, parsed.data, session.user.id))
    return NextResponse.json(purchase)
  } catch (err) {
    if (err instanceof PurchaseNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof PurchaseNotPendingError) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof AmountAlreadyPaidError) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof CustomerBlacklistedError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof CustomerInactiveError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof ProductInactiveError) return NextResponse.json({ error: err.message }, { status: 422 })

    const message = 'Failed to update purchase'
    logger.error({ err, purchaseId: id }, 'PATCH /api/purchases/[id] failed')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
