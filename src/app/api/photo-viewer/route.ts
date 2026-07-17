import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { getViewUrl } from '@/lib/r2'
import { decodePhotoKeys } from '@/lib/offline/photoKeysCodec'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

class PhotoRecordNotFoundError extends Error {}

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
  if (model !== 'purchase' && model !== 'customer') {
    return NextResponse.json({ error: `Unsupported model: ${model}` }, { status: 400 })
  }

  try {
    const keys = await runWithRequestTenant(req, async () => {
      if (model === 'purchase') {
        const record = await prisma.purchase.findUnique({ where: { id }, select: { photoR2Keys: true } })
        if (!record) throw new PhotoRecordNotFoundError('Purchase not found')
        return decodePhotoKeys(record.photoR2Keys)
      }
      const record = await prisma.customer.findUnique({ where: { id }, select: { idPhotoR2Key: true } })
      if (!record) throw new PhotoRecordNotFoundError('Customer not found')
      return record.idPhotoR2Key ? [record.idPhotoR2Key] : []
    })

    if (keys.length === 0) return NextResponse.json({ photos: [] })

    const photos = await Promise.all(
      keys.map(async (key) => ({
        key,
        url: await getViewUrl(key),
      }))
    )

    return NextResponse.json({ photos })
  } catch (err) {
    if (err instanceof PhotoRecordNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err, model, id }, 'GET /api/photo-viewer failed')
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 })
  }
}
