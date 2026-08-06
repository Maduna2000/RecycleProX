import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdateProductSchema } from '@/lib/schemas/product'
import { getProduct, updateProduct, deleteProduct, resolvePrice, ProductNotFoundError, ProductInUseError } from '@/lib/services/productService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ?priceGroupId= is how Purchases-new/Sales-new ask "what should this
  // customer actually pay for this product" — until this fix, that param
  // was silently ignored and every caller got the product's plain default
  // price back, never a price-group override.
  const priceGroupId = req.nextUrl.searchParams.get('priceGroupId') ?? undefined

  try {
    const product = await runWithRequestTenant(req, async () => {
      const p = await getProduct(params.id)
      if (!priceGroupId) return p
      const resolved = await resolvePrice(params.id, priceGroupId)
      return { ...p, defaultBuyPrice: resolved.buyPrice, defaultSellPrice: resolved.sellPrice, priceSource: resolved.source }
    })
    return NextResponse.json(product)
  } catch (err) {
    if (err instanceof ProductNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/products/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = UpdateProductSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const product = await runWithRequestTenant(req, () => updateProduct(params.id, parsed.data, session.user.id))
    return NextResponse.json(product)
  } catch (err) {
    if (err instanceof ProductNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'PUT /api/products/[id] failed')
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await runWithRequestTenant(req, () => deleteProduct(params.id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof ProductNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof ProductInUseError)    return NextResponse.json({ error: 'Product is used in existing transactions and cannot be deleted. Deactivate it instead.' }, { status: 409 })
    logger.error({ err }, 'DELETE /api/products/[id] failed')
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
