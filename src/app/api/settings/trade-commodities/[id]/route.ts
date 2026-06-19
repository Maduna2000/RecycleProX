import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdateTradeCommodityCategorySchema } from '@/lib/schemas/tradeCommodity'
import {
  getTradeCommodityCategory,
  updateTradeCommodityCategory,
  deleteTradeCommodityCategory,
  CategoryNotFoundError,
  DuplicateCategoryError,
} from '@/lib/services/tradeCommodityService'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  try {
    const category = await getTradeCommodityCategory(id)
    return NextResponse.json(category)
  } catch (err) {
    if (err instanceof CategoryNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error({ err, id }, 'GET /api/settings/trade-commodities/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch category' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const body = await req.json()
  const parsed = UpdateTradeCommodityCategorySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
      { status: 422 },
    )
  }

  try {
    const category = await updateTradeCommodityCategory(id, parsed.data, session.user.id)
    return NextResponse.json(category)
  } catch (err) {
    if (err instanceof CategoryNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof DuplicateCategoryError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    logger.error({ err, id }, 'PUT /api/settings/trade-commodities/[id] failed')
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params

  try {
    const category = await deleteTradeCommodityCategory(id, session.user.id)
    return NextResponse.json(category)
  } catch (err) {
    if (err instanceof CategoryNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error({ err, id }, 'DELETE /api/settings/trade-commodities/[id] failed')
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
