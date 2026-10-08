import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { parseSASTDateRange } from '@/lib/utils/dayBounds'
import { zodErrorMessage } from '@/lib/utils/zodError'
import { CreatePurchaseSchema } from '@/lib/schemas/purchase'
import {
  createPurchase, listPurchases,
  CustomerBlacklistedError, CustomerInactiveError, ProductInactiveError,
  ScaleOrderAlreadyLinkedError, InsufficientFloatError,
} from '@/lib/services/purchaseService'
import { ScaleOrderNotFoundError, ScaleOrderAlreadyVoidedError } from '@/lib/services/scaleService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const customerId = searchParams.get('customerId') ?? undefined
  const status = searchParams.get('status') ?? undefined
  const search = searchParams.get('search') ?? undefined
  const paymentMethod = searchParams.get('paymentMethod') ?? undefined
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50')
  const range = parseSASTDateRange(searchParams.get('from'), searchParams.get('to'))
  if (!range) return NextResponse.json({ error: 'Invalid date filter' }, { status: 400 })
  const { from, to } = range

  try {
    const result = await runWithRequestTenant(req, () => listPurchases({ customerId, status, search, paymentMethod, page, pageSize, from, to }))
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/purchases failed')
    return NextResponse.json({ error: 'Failed to fetch purchases' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreatePurchaseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: zodErrorMessage(parsed.error), details: parsed.error.flatten() }, { status: 422 })

  try {
    const purchase = await runWithRequestTenant(req, () => createPurchase(parsed.data, session.user.id))
    return NextResponse.json(purchase, { status: 201 })
  } catch (err) {
    if (err instanceof CustomerBlacklistedError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof CustomerInactiveError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof ProductInactiveError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof ScaleOrderNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof ScaleOrderAlreadyVoidedError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof ScaleOrderAlreadyLinkedError) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof InsufficientFloatError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/purchases failed')
    return NextResponse.json({ error: 'Failed to create purchase' }, { status: 500 })
  }
}
