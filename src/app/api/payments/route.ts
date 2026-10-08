import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { parseSASTDateRange } from '@/lib/utils/dayBounds'
import { CreatePaymentSchema } from '@/lib/schemas/payment'
import {
  createPayment, listPayments,
  CustomerNotFoundError,
  PaymentExceedsBalanceError,
} from '@/lib/services/paymentService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const customerId = searchParams.get('customerId') ?? undefined
  const search = searchParams.get('search') ?? undefined
  const paymentMethod = searchParams.get('paymentMethod') ?? undefined
  const sourceRaw = searchParams.get('source') ?? undefined
  const source = sourceRaw === 'sale' || sourceRaw === 'purchase' ? sourceRaw : undefined
  const includeVoided = searchParams.get('includeVoided') === 'true'
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50')
  const range = parseSASTDateRange(searchParams.get('from'), searchParams.get('to'))
  if (!range) return NextResponse.json({ error: 'Invalid date filter' }, { status: 400 })
  const { from, to } = range

  try {
    const result = await runWithRequestTenant(req, () => listPayments({ customerId, search, paymentMethod, source, includeVoided, page, pageSize, from, to, viewerRole: session.user.role }))
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/payments failed')
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreatePaymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const payment = await runWithRequestTenant(req, () => createPayment(parsed.data, session.user.id))
    return NextResponse.json(payment, { status: 201 })
  } catch (err) {
    if (err instanceof CustomerNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof PaymentExceedsBalanceError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err }, 'POST /api/payments failed')
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}
