import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getPurchase, PurchaseNotFoundError } from '@/lib/services/purchaseService'

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Await params for Next.js 15 compatibility
  const { id } = await context.params

  try {
    const purchase = await getPurchase(id)
    return NextResponse.json(purchase)
  } catch (err) {
    if (err instanceof PurchaseNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err, purchaseId: id }, 'GET /api/purchases/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch purchase' }, { status: 500 })
  }
}
