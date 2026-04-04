import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getPurchase, PurchaseNotFoundError } from '@/lib/services/purchaseService'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const purchase = await getPurchase(params.id)
    return NextResponse.json(purchase)
  } catch (err) {
    if (err instanceof PurchaseNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/purchases/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch purchase' }, { status: 500 })
  }
}
