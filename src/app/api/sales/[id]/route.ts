import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdateSaleSchema } from '@/lib/schemas/sale'
import {
  getSale, updateSale, SaleNotFoundError, SaleNotPendingError,
  AmountAlreadyPaidError, ProductInactiveError, InsufficientStockError,
} from '@/lib/services/saleService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sale = await runWithRequestTenant(req, () => getSale(params.id))
    return NextResponse.json(sale)
  } catch (err) {
    if (err instanceof SaleNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'GET /api/sales/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch sale' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can edit a sale' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateSaleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const sale = await runWithRequestTenant(req, () => updateSale(params.id, parsed.data, session.user.id))
    return NextResponse.json(sale)
  } catch (err) {
    if (err instanceof SaleNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof SaleNotPendingError) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof AmountAlreadyPaidError) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof ProductInactiveError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof InsufficientStockError) return NextResponse.json({ error: err.message }, { status: 422 })

    const message = err instanceof Error ? err.message : 'Failed to update sale'
    logger.error({ err }, 'PATCH /api/sales/[id] failed')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
