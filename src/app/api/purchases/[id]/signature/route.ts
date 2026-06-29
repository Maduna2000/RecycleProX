import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { savePurchaseSignature, PurchaseNotFoundError } from '@/lib/services/purchaseService'

/**
 * PATCH /api/purchases/[id]/signature
 * Body: { signatureR2Key: string }
 * Saves the R2 key of the seller's signature image to the Purchase record.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Await params for Next.js 15 compatibility
  const { id } = await context.params

  try {
    const body = await req.json() as { signatureR2Key?: string }
    if (!body.signatureR2Key) {
      return NextResponse.json({ error: 'signatureR2Key is required' }, { status: 400 })
    }
    await savePurchaseSignature(id, body.signatureR2Key, session.user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PurchaseNotFoundError) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
    }
    logger.error({ err, purchaseId: id }, 'PATCH /api/purchases/[id]/signature failed')
    return NextResponse.json({ error: 'Failed to save signature' }, { status: 500 })
  }
}
