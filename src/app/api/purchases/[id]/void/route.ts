import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { VoidPurchaseSchema } from '@/lib/schemas/purchase'
import { voidPurchase, PurchaseNotFoundError, PurchaseAlreadyVoidedError } from '@/lib/services/purchaseService'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can void purchases' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = VoidPurchaseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const purchase = await voidPurchase(params.id, parsed.data, session.user.id)
    return NextResponse.json(purchase)
  } catch (err) {
    if (err instanceof PurchaseNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof PurchaseAlreadyVoidedError) return NextResponse.json({ error: err.message }, { status: 409 })
    logger.error({ err }, 'POST /api/purchases/[id]/void failed')
    return NextResponse.json({ error: 'Failed to void purchase' }, { status: 500 })
  }
}
