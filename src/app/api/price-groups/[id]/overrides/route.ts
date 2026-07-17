import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { SetGroupOverridesSchema } from '@/lib/schemas/product'
import { setGroupOverrides, PriceGroupNotFoundError } from '@/lib/services/productService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = SetGroupOverridesSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    await runWithRequestTenant(req, () => setGroupOverrides(params.id, parsed.data, session.user.id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PriceGroupNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'PUT /api/price-groups/[id]/overrides failed')
    return NextResponse.json({ error: 'Failed to update overrides' }, { status: 500 })
  }
}
