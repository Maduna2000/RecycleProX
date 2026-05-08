import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { updatePurchasePhotos, PurchaseNotFoundError } from '@/lib/services/purchaseService'

// PATCH /api/purchases/[id]/photos
// Body: { add: string } | { remove: string }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body   = await req.json() as { add?: string; remove?: string }
    const result = await updatePurchasePhotos(params.id, body, session.user?.id ?? '')
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof PurchaseNotFoundError) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
    }
    if (err instanceof Error && err.message === 'Provide add or remove') {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    logger.error({ err }, 'PATCH /api/purchases/[id]/photos failed')
    return NextResponse.json({ error: 'Failed to update photos' }, { status: 500 })
  }
}
