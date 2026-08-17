import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateProductSchema } from '@/lib/schemas/product'
import { createProduct, listProducts, DuplicateProductCodeError } from '@/lib/services/productService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const category = searchParams.get('category') ?? undefined
  const search = searchParams.get('search') ?? undefined
  // Tri-state: 'true' -> active only, 'false' -> inactive only, absent (the
  // "All statuses" filter) -> no isActive filter at all. The old `!== 'false'`
  // check treated a missing param as active-only (wrong for "All statuses")
  // and 'false' as "no filter" (wrong for "Inactive only" — it showed every
  // product, active ones included, instead of just the inactive ones).
  const activeParam = searchParams.get('active')
  const isActive = activeParam === 'true' ? true : activeParam === 'false' ? false : undefined

  try {
    const products = await runWithRequestTenant(req, () => listProducts({ category, search, isActive }))
    return NextResponse.json({ products })
  } catch (err) {
    logger.error({ err }, 'GET /api/products failed')
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateProductSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const product = await runWithRequestTenant(req, () => createProduct(parsed.data, session.user.id))
    return NextResponse.json(product, { status: 201 })
  } catch (err) {
    if (err instanceof DuplicateProductCodeError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    logger.error({ err }, 'POST /api/products failed')
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
