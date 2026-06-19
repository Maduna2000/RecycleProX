import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { ReorderTradeCommodityCategoriesSchema } from '@/lib/schemas/tradeCommodity'
import { reorderTradeCommodityCategories } from '@/lib/services/tradeCommodityService'

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = ReorderTradeCommodityCategoriesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
      { status: 422 },
    )
  }

  try {
    const categories = await reorderTradeCommodityCategories(parsed.data, session.user.id)
    return NextResponse.json({ categories })
  } catch (err) {
    logger.error({ err }, 'PUT /api/settings/trade-commodities/reorder failed')
    return NextResponse.json({ error: 'Failed to reorder categories' }, { status: 500 })
  }
}
