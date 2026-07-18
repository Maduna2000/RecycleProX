import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  checkoutGateEntry,
  GateEntryNotFoundError,
  GateEntryAlreadyExitedError,
} from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

const GATE_ROLES = ['admin', 'manager', 'security_guard']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!GATE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const entry = await runWithRequestTenant(req, () => checkoutGateEntry(params.id, session.user.id))
    return NextResponse.json(entry)
  } catch (err) {
    if (err instanceof GateEntryNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof GateEntryAlreadyExitedError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    logger.error({ err }, 'PATCH /api/gate/entries/[id]/checkout failed')
    return NextResponse.json({ error: 'Failed to check out' }, { status: 500 })
  }
}
