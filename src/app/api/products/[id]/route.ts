import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdateProductSchema } from '@/lib/schemas/product'
import { getProduct, updateProduct, ProductNotFoundError } from '@/lib/services/productService'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const product = await getProduct(params.id)
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
    const product = await updateProduct(params.id, parsed.data, session.user.id)
    return NextResponse.json(product)
  } catch (err) {
    if (err instanceof ProductNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'PUT /api/products/[id] failed')
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}
