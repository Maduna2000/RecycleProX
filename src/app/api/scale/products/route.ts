import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateScaleProductSchema } from '@/lib/schemas/scale'
import { listProducts, createProduct } from '@/lib/services/scaleProductService'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const categoryId     = req.nextUrl.searchParams.get('categoryId') ?? undefined
  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'
  const products = await listProducts(categoryId, includeInactive)
  return NextResponse.json(products)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateScaleProductSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const product = await createProduct(parsed.data, session.user.id)
    return NextResponse.json(product, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/scale/products failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
