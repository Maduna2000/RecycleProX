import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { BulkPriceUpdateSchema } from '@/lib/schemas/product'
import { bulkUpdatePrices, ProductNotFoundError } from '@/lib/services/productService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = BulkPriceUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const updated = await runWithRequestTenant(req, () => bulkUpdatePrices(parsed.data, session.user.id))
    return NextResponse.json({ updated: updated.length })
  } catch (err) {
    if (err instanceof ProductNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'POST /api/products/bulk-price failed')
    return NextResponse.json({ error: 'Failed to update prices' }, { status: 500 })
  }
}
