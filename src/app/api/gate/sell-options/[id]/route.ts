import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdateSellOptionSchema } from '@/lib/schemas/gate'
import { updateSellOption, deleteSellOption } from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = UpdateSellOptionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 422 })

  try {
    const option = await runWithRequestTenant(req, () => updateSellOption(params.id, parsed.data))
    return NextResponse.json(option)
  } catch (err) {
    const msg = 'Failed to update sell option'
    const status = msg.includes('already exists') ? 409 : msg.includes('not found') ? 404 : 500
    if (status === 500) logger.error({ err }, 'PATCH /api/gate/sell-options/[id] failed')
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await runWithRequestTenant(req, () => deleteSellOption(params.id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = 'Failed to delete sell option'
    const status = msg.includes('not found') ? 404 : 500
    if (status === 500) logger.error({ err }, 'DELETE /api/gate/sell-options/[id] failed')
    return NextResponse.json({ error: msg }, { status })
  }
}
