import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — manager or admin required' }, { status: 403 })
  }

  // Optional: restrict to specific product IDs. Empty = all active products.
  const body = await req.json().catch(() => ({})) as { productIds?: string[] }

  try {
    const group = await prisma.priceGroup.findUnique({ where: { id: params.id } })
    if (!group) return NextResponse.json({ error: 'Price group not found' }, { status: 404 })

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(body.productIds?.length ? { id: { in: body.productIds } } : {}),
      },
      select: { id: true, defaultBuyPrice: true, defaultSellPrice: true },
    })

    // Upsert all overrides in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      let upserted = 0
      for (const product of products) {
        await tx.priceGroupProductOverride.upsert({
          where: {
            priceGroupId_productId: {
              priceGroupId: params.id,
              productId:    product.id,
            },
          },
          create: {
            priceGroupId: params.id,
            productId:    product.id,
            buyPrice:     product.defaultBuyPrice,
            sellPrice:    product.defaultSellPrice,
          },
          update: {
            buyPrice:  product.defaultBuyPrice,
            sellPrice: product.defaultSellPrice,
          },
        })
        upserted++
      }
      return upserted
    })

    logger.info({ priceGroupId: params.id, upserted: result, userId: session.user.id }, 'price-group.copy-from-defaults')
    return NextResponse.json({ upserted: result })
  } catch (err) {
    logger.error({ err }, 'POST /api/price-groups/[id]/copy-from-defaults failed')
    return NextResponse.json({ error: 'Failed to copy prices' }, { status: 500 })
  }
}
