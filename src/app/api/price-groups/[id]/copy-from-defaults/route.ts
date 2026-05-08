import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { copyDefaultsToPriceGroup, PriceGroupNotFoundError } from '@/lib/services/productService'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden — manager or admin required' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { productIds?: string[] }

  try {
    const upserted = await copyDefaultsToPriceGroup(params.id, body.productIds)
    logger.info({ priceGroupId: params.id, upserted, userId: session.user.id }, 'price-group.copy-from-defaults')
    return NextResponse.json({ upserted })
  } catch (err) {
    if (err instanceof PriceGroupNotFoundError) {
      return NextResponse.json({ error: 'Price group not found' }, { status: 404 })
    }
    logger.error({ err }, 'POST /api/price-groups/[id]/copy-from-defaults failed')
    return NextResponse.json({ error: 'Failed to copy prices' }, { status: 500 })
  }
}
