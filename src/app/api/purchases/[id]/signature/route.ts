import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'

/**
 * PATCH /api/purchases/[id]/signature
 * Body: { signatureR2Key: string }
 * Saves the R2 key of the seller's signature image to the Purchase record.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json() as { signatureR2Key?: string }
    if (!body.signatureR2Key) {
      return NextResponse.json({ error: 'signatureR2Key is required' }, { status: 400 })
    }

    const purchase = await prisma.purchase.findUnique({ where: { id: params.id } })
    if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })

    await prisma.purchase.update({
      where: { id: params.id },
      data: { signatureR2Key: body.signatureR2Key },
    })

    logger.info({ purchaseId: params.id, userId: session.user.id }, 'Signature saved on purchase')
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ err, id: params.id }, 'PATCH /api/purchases/[id]/signature failed')
    return NextResponse.json({ error: 'Failed to save signature' }, { status: 500 })
  }
}
