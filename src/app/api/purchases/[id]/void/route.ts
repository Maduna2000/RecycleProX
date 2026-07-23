import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { VoidPurchaseSchema } from '@/lib/schemas/purchase'
import { voidPurchase, PurchaseNotFoundError, PurchaseAlreadyVoidedError } from '@/lib/services/purchaseService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can void purchases' }, { status: 403 })
  }

  // Await params for Next.js 15 compatibility
  const { id } = await context.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = VoidPurchaseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const purchase = await runWithRequestTenant(req, () => voidPurchase(id, parsed.data, session.user.id))
    return NextResponse.json(purchase)
  } catch (err) {
    if (err instanceof PurchaseNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof PurchaseAlreadyVoidedError) return NextResponse.json({ error: err.message }, { status: 409 })

    // Return specific error messages for known error types
    const message = err instanceof Error ? err.message : 'Failed to void purchase'
    logger.error({ err, purchaseId: id }, 'POST /api/purchases/[id]/void failed')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
