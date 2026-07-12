import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getScaleOrderById, ScaleOrderNotFoundError } from '@/lib/services/scaleService'
import { getViewUrl } from '@/lib/r2'
import { decodePhotoKeys } from '@/lib/offline/photoKeysCodec'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const order = await getScaleOrderById(params.id)

    // Attach presigned URLs for photos
    const photoUrls = await Promise.all(
      decodePhotoKeys(order.photoR2Keys).map(key => getViewUrl(key, 3600))
    )
    const slipUrl = order.slipR2Key ? await getViewUrl(order.slipR2Key, 3600) : null

    return NextResponse.json({ ...order, photoUrls, slipUrl })
  } catch (err) {
    if (err instanceof ScaleOrderNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/scale/orders/[id] failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
