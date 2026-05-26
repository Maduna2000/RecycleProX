import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateScaleOrderSchema } from '@/lib/schemas/scale'
import {
  listScaleOrders, createScaleOrder,
  ScaleCustomerNotFoundError, ScaleProductInactiveError,
} from '@/lib/services/scaleService'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier', 'scale_operator'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const p = req.nextUrl.searchParams
  const result = await listScaleOrders({
    dateFrom:     p.get('dateFrom')     ?? undefined,
    dateTo:       p.get('dateTo')       ?? undefined,
    status:       (p.get('status')      ?? undefined) as 'pending' | 'processed' | 'voided' | undefined,
    operatorId:   p.get('operatorId')   ?? undefined,
    productId:    p.get('productId')    ?? undefined,
    categoryName: p.get('categoryName')  ?? undefined,
    customerType: (p.get('customerType') ?? undefined) as 'casual' | 'account' | undefined,
    search:       p.get('search')       ?? undefined,
    page:         p.get('page')         ? Number(p.get('page'))     : undefined,
    pageSize:     p.get('pageSize')     ? Number(p.get('pageSize')) : undefined,
  })
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'cashier', 'scale_operator'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateScaleOrderSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const order = await createScaleOrder(parsed.data, session.user.id)
    return NextResponse.json(order, { status: 201 })
  } catch (err) {
    if (err instanceof ScaleCustomerNotFoundError)  return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof ScaleProductInactiveError)   return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/scale/orders failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
