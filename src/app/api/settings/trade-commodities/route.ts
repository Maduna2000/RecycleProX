import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateTradeCommodityCategorySchema } from '@/lib/schemas/tradeCommodity'
import {
  listTradeCommodityCategories,
  createTradeCommodityCategory,
  DuplicateCategoryError,
} from '@/lib/services/tradeCommodityService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const includeInactive = searchParams.get('includeInactive') === 'true'

  const categories = await runWithRequestTenant(req, () => listTradeCommodityCategories(includeInactive))
  return NextResponse.json({ categories })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateTradeCommodityCategorySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
      { status: 422 },
    )
  }

  try {
    const category = await runWithRequestTenant(req, () => createTradeCommodityCategory(parsed.data, session.user.id))
    return NextResponse.json(category, { status: 201 })
  } catch (err) {
    if (err instanceof DuplicateCategoryError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    logger.error({ err }, 'POST /api/settings/trade-commodities failed')
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
