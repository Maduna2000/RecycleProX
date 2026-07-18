import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import logger from '@/lib/logger'
import { setTradeCommodityFlag } from '@/lib/services/productService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

type RouteContext = { params: Promise<{ id: string }> }

const ToggleSchema = z.object({ isActive: z.boolean() })

/** Toggles whether a product category is shown as a trade-commodity option. */
export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const body = await req.json()
  const parsed = ToggleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Body must include { "isActive": boolean }' }, { status: 422 })
  }

  try {
    const category = await runWithRequestTenant(req, () => setTradeCommodityFlag(id, parsed.data.isActive))
    return NextResponse.json(category)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update category'
    if (msg.includes('not found')) return NextResponse.json({ error: msg }, { status: 404 })
    logger.error({ err, id }, 'PUT /api/settings/trade-commodities/[id] failed')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
