import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { getViewUrl } from '@/lib/r2'
import { decodePhotoKeys } from '@/lib/offline/photoKeysCodec'

// GET /api/photo-viewer?model=purchase&id=xxx
// Returns presigned view URLs for all photos attached to a record.
// Supported models: purchase, customer
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const model = req.nextUrl.searchParams.get('model')?.toLowerCase()
  const id    = req.nextUrl.searchParams.get('id')

  if (!model || !id) {
    return NextResponse.json({ error: 'model and id query params are required' }, { status: 400 })
  }

  try {
    let keys: string[] = []

    if (model === 'purchase') {
      const record = await prisma.purchase.findUnique({ where: { id }, select: { photoR2Keys: true } })
      if (!record) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
      keys = decodePhotoKeys(record.photoR2Keys)
    } else if (model === 'customer') {
      const record = await prisma.customer.findUnique({ where: { id }, select: { idPhotoR2Key: true } })
      if (!record) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      if (record.idPhotoR2Key) keys = [record.idPhotoR2Key]
    } else {
      return NextResponse.json({ error: `Unsupported model: ${model}` }, { status: 400 })
    }

    if (keys.length === 0) return NextResponse.json({ photos: [] })

    const photos = await Promise.all(
      keys.map(async (key) => ({
        key,
        url: await getViewUrl(key),
      }))
    )

    return NextResponse.json({ photos })
  } catch (err) {
    logger.error({ err, model, id }, 'GET /api/photo-viewer failed')
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 })
  }
}
