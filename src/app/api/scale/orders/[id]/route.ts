import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getScaleOrderById, ScaleOrderNotFoundError } from '@/lib/services/scaleService'
import { getViewUrl } from '@/lib/r2'
import { decodePhotoKeys } from '@/lib/offline/photoKeysCodec'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const order = await runWithRequestTenant(req, () => getScaleOrderById(params.id))

    // order.photoR2Keys is a legacy single-product column, seeded only from
    // the *first* line at order-creation time (see scaleService.ts's
    // createScaleOrder) — it was never meant to represent the whole order.
    // Each product's real photos live on its own ScaleOrderLine.photoR2Keys,
    // so the per-line photos are the source of truth here; for a
    // single-line order the two are identical anyway.
    const lines = await Promise.all(
      order.lines.map(async (line) => ({
        ...line,
        photoUrls: await Promise.all(
          decodePhotoKeys(line.photoR2Keys).map(key => getViewUrl(key, 3600))
        ),
      }))
    )
    // Every order created through createScaleOrder() always gets at least
    // one ScaleOrderLine row, but fall back to the legacy header field for
    // any order that somehow predates that (defensive, not expected).
    const photoUrls = order.lines.length > 0
      ? lines.flatMap(l => l.photoUrls)
      : await Promise.all(decodePhotoKeys(order.photoR2Keys).map(key => getViewUrl(key, 3600)))
    const slipUrl = order.slipR2Key ? await getViewUrl(order.slipR2Key, 3600) : null

    return NextResponse.json({ ...order, lines, photoUrls, slipUrl })
  } catch (err) {
    if (err instanceof ScaleOrderNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/scale/orders/[id] failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
