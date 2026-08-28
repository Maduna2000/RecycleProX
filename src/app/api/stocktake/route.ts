import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { createStocktake, listStocktakes } from '@/lib/services/stocktakeService'
import { CreateStocktakeSchema } from '@/lib/schemas/stocktake'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await runWithRequestTenant(req, () => listStocktakes())
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/stocktake failed')
    return NextResponse.json({ error: 'Failed to list stocktakes' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const parsed = CreateStocktakeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const stocktake = await runWithRequestTenant(req, () => createStocktake(session.user.id, parsed.data.notes))
    return NextResponse.json(stocktake, { status: 201 })
  } catch (err: unknown) {
    const msg = 'Failed to create stocktake'
    logger.error({ err }, 'POST /api/stocktake failed')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
