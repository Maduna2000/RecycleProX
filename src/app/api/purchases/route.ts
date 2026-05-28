import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreatePurchaseSchema } from '@/lib/schemas/purchase'
import {
  createPurchase, listPurchases,
  CustomerBlacklistedError, CustomerInactiveError, ProductInactiveError,
} from '@/lib/services/purchaseService'

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
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined
  const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined

  try {
    const result = await listPurchases({ customerId, status, search, paymentMethod, page, pageSize, from, to })
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
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const purchase = await createPurchase(parsed.data, session.user.id)
    return NextResponse.json(purchase, { status: 201 })
  } catch (err) {
    if (err instanceof CustomerBlacklistedError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof CustomerInactiveError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof ProductInactiveError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/purchases failed')
    return NextResponse.json({ error: 'Failed to create purchase' }, { status: 500 })
  }
}
