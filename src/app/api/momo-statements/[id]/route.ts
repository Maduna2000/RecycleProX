import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getMomoStatement, deleteMomoStatement, MomoStatementNotFoundError } from '@/lib/services/momoStatementService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  try {
    const statement = await runWithRequestTenant(req, () => getMomoStatement(id))
    return NextResponse.json(statement)
  } catch (err) {
    if (err instanceof MomoStatementNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err, id }, 'GET /api/momo-statements/[id] failed')
    return NextResponse.json({ error: 'Failed to fetch MoMo statement' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — only an admin can delete a MoMo statement' }, { status: 403 })
  }

  const { id } = await context.params

  try {
    await runWithRequestTenant(req, () => deleteMomoStatement(id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof MomoStatementNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err, id }, 'DELETE /api/momo-statements/[id] failed')
    return NextResponse.json({ error: 'Failed to delete MoMo statement' }, { status: 500 })
  }
}
