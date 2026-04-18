import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'

// PATCH /api/purchases/[id]/photos
// Body: { add: string } | { remove: string }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json() as { add?: string; remove?: string }
    const purchase = await prisma.purchase.findUnique({ where: { id: params.id }, select: { photoR2Keys: true } })
    if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })

    let keys = purchase.photoR2Keys ?? []

    if (body.add) {
      keys = [...keys, body.add]
    } else if (body.remove) {
      keys = keys.filter((k) => k !== body.remove)
    } else {
      return NextResponse.json({ error: 'Provide add or remove' }, { status: 400 })
    }

    const updated = await prisma.purchase.update({
      where: { id: params.id },
      data: { photoR2Keys: keys },
      select: { photoR2Keys: true },
    })

    logger.info({ purchaseId: params.id, userId: session.user?.id, action: body.add ? 'photo_added' : 'photo_removed' }, 'purchase.photos.updated')
    return NextResponse.json({ photoR2Keys: updated.photoR2Keys })
  } catch (err) {
    logger.error({ err }, 'PATCH /api/purchases/[id]/photos failed')
    return NextResponse.json({ error: 'Failed to update photos' }, { status: 500 })
  }
}
