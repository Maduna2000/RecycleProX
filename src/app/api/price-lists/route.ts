import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listPriceLists, createPriceList } from '@/lib/services/priceListService'
import { CreatePriceListSchema } from '@/lib/schemas/priceList'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const priceGroupId = req.nextUrl.searchParams.get('priceGroupId') ?? undefined

  try {
    const priceLists = await runWithRequestTenant(req, () => listPriceLists({ priceGroupId }))
    return NextResponse.json({ priceLists })
  } catch (err) {
    logger.error({ err }, 'GET /api/price-lists failed')
    return NextResponse.json({ error: 'Failed to load price lists' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreatePriceListSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const priceList = await runWithRequestTenant(req, () => createPriceList(parsed.data, session.user.id))
    return NextResponse.json(priceList, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/price-lists failed')
    return NextResponse.json({ error: 'Failed to create price list' }, { status: 500 })
  }
}
